"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingScene = exports.SCENE_BOOKING = void 0;
const telegraf_1 = require("telegraf");
const calendar_service_1 = require("../services/calendar.service");
const user_service_1 = require("../services/user.service");
const zoom_service_1 = require("../services/zoom.service");
const notifications_1 = require("../jobs/notifications");
const notifications_2 = require("../admin/notifications");
const sheets_service_1 = require("../services/sheets.service");
const format_1 = require("../utils/format");
const keyboards_1 = require("../bot/keyboards");
const logger_1 = require("../logger");
const onboarding_scene_1 = require("./onboarding.scene");
const bot_messages_service_1 = require("../services/bot-messages.service");
exports.SCENE_BOOKING = "booking";
function s(ctx) {
    return ctx.scene.state;
}
function clearState(ctx) {
    ctx.scene.state = {};
}
// ────────────────────────────────────────────────────────────────────────────
exports.bookingScene = new telegraf_1.Scenes.BaseScene(exports.SCENE_BOOKING);
// ── Enter ──────────────────────────────────────────────────────────────────
exports.bookingScene.enter(async (ctx) => {
    clearState(ctx);
    await showMonthSelection(ctx, 0);
});
// ── Month selected ─────────────────────────────────────────────────────────
exports.bookingScene.action(/^booking_month_(\d{4}-\d{2})$/, async (ctx) => {
    await ctx.answerCbQuery();
    const monthKey = ctx.match[1];
    await showDaySelectionForMonth(ctx, monthKey);
});
// ── Month page navigation ──────────────────────────────────────────────────
exports.bookingScene.action(/^booking_mpage_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const page = parseInt(ctx.match[1], 10);
    await showMonthSelection(ctx, page);
});
// ── Day selected ───────────────────────────────────────────────────────────
exports.bookingScene.action(/^booking_day_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const dayKey = ctx.match?.[1];
    if (!dayKey)
        return;
    let slots;
    try {
        slots = await (0, calendar_service_1.getAvailableSlots)();
    }
    catch (err) {
        logger_1.logger.error("Calendar fetch failed", { err });
        await ctx.answerCbQuery("Ошибка загрузки расписания. Попробуйте позже.");
        return;
    }
    const daySlots = slots.get(dayKey);
    if (!daySlots || daySlots.length === 0) {
        const { monthKey, monthPage } = s(ctx);
        if (monthKey) {
            await showDaySelectionForMonth(ctx, monthKey);
        }
        else {
            await showMonthSelection(ctx, monthPage ?? 0);
        }
        return;
    }
    const slotMap = {};
    const timeButtons = daySlots.map((slot, i) => {
        slotMap[String(i)] = slot.eventId;
        return [telegraf_1.Markup.button.callback(slot.timeLabel, `booking_time_${i}`)];
    });
    ctx.scene.state = {
        ...s(ctx),
        dayKey,
        dayLabel: daySlots[0].dayLabel,
        slots: slotMap,
    };
    await ctx.editMessageText(`Выберите удобное время:\n<b>${daySlots[0].dayLabel}</b>`, {
        ...telegraf_1.Markup.inlineKeyboard([
            ...timeButtons,
            [telegraf_1.Markup.button.callback("← Назад", "booking_back_days")],
        ]),
        parse_mode: "HTML",
    });
});
// ── Time selected ──────────────────────────────────────────────────────────
exports.bookingScene.action(/^booking_time_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const idx = ctx.match?.[1];
    if (idx === undefined)
        return;
    const state = s(ctx);
    const eventId = state.slots?.[idx];
    if (!eventId) {
        await ctx.answerCbQuery("Слот недоступен, выберите другое время.");
        return;
    }
    let slots;
    try {
        slots = await (0, calendar_service_1.getAvailableSlots)();
    }
    catch (err) {
        logger_1.logger.error("Calendar fetch failed", { err });
        return;
    }
    const dayKey = state.dayKey;
    if (!dayKey)
        return;
    const slot = slots.get(dayKey)?.find((s) => s.eventId === eventId);
    if (!slot) {
        await showTimeSelection(ctx, dayKey, slots);
        return;
    }
    ctx.scene.state = {
        ...state,
        eventId,
        timeLabel: slot.timeLabel,
        eventStart: slot.eventStart,
        eventEnd: slot.eventEnd,
    };
    await ctx.editMessageText(`Ваша запись на пробный урок:\n\n` +
        `<b>День:</b> ${state.dayLabel}\n` +
        `<b>Время:</b> ${slot.timeLabel}\n\n` +
        `Подтвердите запись:`, {
        ...telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("✅ Подтвердить", "booking_confirm")],
            [telegraf_1.Markup.button.callback("← Назад", "booking_back_times")],
        ]),
        parse_mode: "HTML",
    });
});
// ── Confirm booking ────────────────────────────────────────────────────────
exports.bookingScene.action("booking_confirm", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from)
        return;
    const state = s(ctx);
    const { eventId, dayLabel = "", timeLabel = "", eventStart, eventEnd, } = state;
    if (!eventId || !eventStart || !eventEnd) {
        await ctx.reply("Произошла ошибка. Начните выбор заново.");
        return ctx.scene.reenter();
    }
    const user = (0, user_service_1.getUserByTelegramId)(ctx.from.id);
    if (!user) {
        await ctx.reply("Пользователь не найден. Нажмите /start");
        return ctx.scene.leave();
    }
    // Create Zoom meeting for the selected slot
    let zoomLink;
    let zoomMeetingId;
    try {
        const startIso = new Date(eventStart * 1000).toISOString();
        const durationMinutes = Math.round((eventEnd - eventStart) / 60);
        const meeting = await (0, zoom_service_1.createMeeting)({
            topic: `Пробный урок — ${user.name ?? ctx.from.first_name}`,
            startTime: startIso,
            durationMinutes: durationMinutes > 0 ? durationMinutes : 60,
        });
        zoomLink = meeting.joinUrl;
        zoomMeetingId = meeting.meetingId;
    }
    catch (err) {
        logger_1.logger.error("Zoom meeting creation failed", { err, eventId });
        // Non-fatal: continue booking without Zoom link
    }
    try {
        await (0, calendar_service_1.bookSlot)(eventId, user.name ?? ctx.from.first_name);
        (0, user_service_1.createBooking)({
            userId: user.id,
            calendarEventId: eventId,
            eventStart,
            eventEnd,
            zoomLink,
            zoomMeetingId,
        });
    }
    catch (err) {
        logger_1.logger.error("Booking failed", { err, eventId });
        await ctx.answerCbQuery("Не удалось забронировать. Попробуйте ещё раз.");
        return;
    }
    // Cancel nudge jobs, schedule lesson reminders
    (0, notifications_1.cancelNudges)(ctx.from.id);
    (0, notifications_1.scheduleLessonReminders)(ctx.from.id, eventStart, eventId, dayLabel, timeLabel, zoomLink ?? "");
    // Notify admins about the new booking (fire-and-forget)
    const tgHandle = user.telegram_name
        ? `@${user.telegram_name}`
        : String(ctx.from.id);
    (0, notifications_2.notifyAdmins)(`📅 <b>Новая запись!</b>\n\n` +
        `<b>Имя:</b> ${user.name ?? ctx.from.first_name}\n` +
        `<b>Телефон:</b> ${user.phone ?? "—"}\n` +
        `<b>Email:</b> ${user.email ?? "—"}\n` +
        `<b>Telegram:</b> ${tgHandle}\n\n` +
        `<b>День:</b> ${dayLabel}\n` +
        `<b>Время:</b> ${timeLabel}` +
        (zoomLink ? `\n<b>Zoom:</b> ${zoomLink}` : "")).catch((err) => logger_1.logger.error("Admin booking notification failed", { err }));
    // Sync sheet row with booking data
    if (user.sheets_row) {
        const startDate = new Date(eventStart * 1000);
        const now = Math.floor(Date.now() / 1000);
        try {
            await (0, sheets_service_1.syncUserRow)(user.sheets_row, {
                lessonDate: (0, format_1.formatDay)(startDate),
                lessonTime: (0, format_1.formatTime)(startDate),
                lessonDatetime: startDate.toISOString(),
                zoomLink,
                zoomMeetingId,
                confirmed: true,
                confirmedAt: now,
                calendarEventId: eventId,
                status: "booked",
            });
        }
        catch (err) {
            logger_1.logger.error("Sheet sync failed (booking confirm)", { err });
        }
    }
    clearState(ctx);
    const zoomLine = zoomLink ? `\n<b>Ссылка Zoom:</b> ${zoomLink}` : "";
    await ctx.editMessageText(`✅ Запись подтверждена!\n\n` +
        `<b>Имя:</b> ${user.name ?? ctx.from.first_name}\n` +
        (user.phone ? `<b>Телефон:</b> ${user.phone}\n` : "") +
        (user.email ? `<b>Email:</b> ${user.email}\n` : "") +
        `\n<b>День:</b> ${dayLabel}\n` +
        `<b>Время:</b> ${timeLabel}` +
        zoomLine +
        `\n\nДо встречи!`, { parse_mode: "HTML" });
    await (0, keyboards_1.sendMainMenu)(ctx, "Вы можете просмотреть свою запись:");
    return ctx.scene.leave();
});
// ── Back buttons ───────────────────────────────────────────────────────────
exports.bookingScene.action("booking_back_months", async (ctx) => {
    await ctx.answerCbQuery();
    const page = s(ctx).monthPage ?? 0;
    ctx.scene.state = { monthPage: page };
    await showMonthSelection(ctx, page);
});
exports.bookingScene.action("booking_back_days", async (ctx) => {
    await ctx.answerCbQuery();
    const { monthKey, monthPage } = s(ctx);
    ctx.scene.state = { monthKey, monthPage };
    if (monthKey) {
        await showDaySelectionForMonth(ctx, monthKey);
    }
    else {
        await showMonthSelection(ctx, monthPage ?? 0);
    }
});
exports.bookingScene.action("booking_back_times", async (ctx) => {
    await ctx.answerCbQuery();
    const { dayKey, monthKey, monthPage } = s(ctx);
    ctx.scene.state = {
        ...s(ctx),
        eventId: undefined,
        timeLabel: undefined,
        eventStart: undefined,
        eventEnd: undefined,
    };
    if (!dayKey) {
        if (monthKey)
            return showDaySelectionForMonth(ctx, monthKey);
        return showMonthSelection(ctx, monthPage ?? 0);
    }
    let slots;
    try {
        slots = await (0, calendar_service_1.getAvailableSlots)();
    }
    catch {
        if (monthKey)
            return showDaySelectionForMonth(ctx, monthKey);
        return showMonthSelection(ctx, monthPage ?? 0);
    }
    return showTimeSelection(ctx, dayKey, slots);
});
// ── /start inside booking scene ────────────────────────────────────────────
exports.bookingScene.command("start", async (ctx) => {
    if (!ctx.from)
        return;
    // Выходим из текущей сцены и пересобираем состояние так же, как в глобальном /start
    await ctx.scene.leave();
    const user = (0, user_service_1.getUserByTelegramId)(ctx.from.id);
    // Пользователь ещё не завершил онбординг — отправляем в onboarding
    if (!user || !user.name) {
        return ctx.scene.enter(onboarding_scene_1.SCENE_ONBOARDING);
    }
    const booking = (0, user_service_1.getUserBooking)(user.id);
    const welcomeText = (0, bot_messages_service_1.getBotMessage)("welcome_text");
    // Нет бронирования — сразу переходим к выбору времени
    if (!booking) {
        await ctx.reply(welcomeText);
        return ctx.scene.enter(exports.SCENE_BOOKING);
    }
    // Есть бронирование — показываем главное меню
    await (0, keyboards_1.sendMainMenu)(ctx, `С возвращением, ${user.name ?? ctx.from.first_name}!`);
});
// ── Ignore unexpected text input ───────────────────────────────────────────
exports.bookingScene.on("message", async (ctx) => {
    await ctx.reply("Сейчас мы выбираем время для урока. Пожалуйста, используйте кнопки под сообщением.\n\n" +
        "Чтобы начать заново из любого места, просто отправьте команду /start.");
});
// ── Helpers ────────────────────────────────────────────────────────────────
const MONTHS_PER_PAGE = 6;
async function showMonthSelection(ctx, page) {
    let slots;
    try {
        slots = await (0, calendar_service_1.getAvailableSlots)();
    }
    catch (err) {
        logger_1.logger.error("Calendar fetch failed on showMonthSelection", { err });
        const msg = "Не удалось загрузить расписание. Попробуйте позже.";
        ctx.callbackQuery ? await ctx.editMessageText(msg) : await ctx.reply(msg);
        await ctx.scene.leave();
        return;
    }
    if (slots.size === 0) {
        const msg = "К сожалению, свободных слотов нет. Попробуйте позже.";
        ctx.callbackQuery ? await ctx.editMessageText(msg) : await ctx.reply(msg);
        await ctx.scene.leave();
        return;
    }
    // Collect unique months in sorted order
    const monthsSet = new Set();
    for (const dayKey of slots.keys()) {
        monthsSet.add(dayKey.substring(0, 7)); // "YYYY-MM"
    }
    const months = Array.from(monthsSet).sort();
    const totalPages = Math.ceil(months.length / MONTHS_PER_PAGE);
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const pageMonths = months.slice(safePage * MONTHS_PER_PAGE, (safePage + 1) * MONTHS_PER_PAGE);
    // Two-column layout
    const rows = [];
    for (let i = 0; i < pageMonths.length; i += 2) {
        const row = [
            telegraf_1.Markup.button.callback((0, format_1.formatMonthLabel)(pageMonths[i]), `booking_month_${pageMonths[i]}`),
        ];
        if (pageMonths[i + 1]) {
            row.push(telegraf_1.Markup.button.callback((0, format_1.formatMonthLabel)(pageMonths[i + 1]), `booking_month_${pageMonths[i + 1]}`));
        }
        rows.push(row);
    }
    // Page navigation if needed
    if (totalPages > 1) {
        const navRow = [];
        if (safePage > 0)
            navRow.push(telegraf_1.Markup.button.callback("← Назад", `booking_mpage_${safePage - 1}`));
        if (safePage < totalPages - 1)
            navRow.push(telegraf_1.Markup.button.callback("Вперёд →", `booking_mpage_${safePage + 1}`));
        rows.push(navRow);
    }
    ctx.scene.state = { ...s(ctx), monthPage: safePage };
    const text = "Выберите месяц для пробного урока:";
    ctx.callbackQuery
        ? await ctx.editMessageText(text, telegraf_1.Markup.inlineKeyboard(rows))
        : await ctx.reply(text, telegraf_1.Markup.inlineKeyboard(rows));
}
async function showDaySelectionForMonth(ctx, monthKey) {
    let slots;
    try {
        slots = await (0, calendar_service_1.getAvailableSlots)();
    }
    catch (err) {
        logger_1.logger.error("Calendar fetch failed on showDaySelectionForMonth", { err });
        const msg = "Не удалось загрузить расписание. Попробуйте позже.";
        ctx.callbackQuery ? await ctx.editMessageText(msg) : await ctx.reply(msg);
        await ctx.scene.leave();
        return;
    }
    const monthDays = Array.from(slots.entries()).filter(([dayKey]) => dayKey.startsWith(monthKey));
    if (monthDays.length === 0) {
        await showMonthSelection(ctx, s(ctx).monthPage ?? 0);
        return;
    }
    const buttons = monthDays.map(([dayKey, daySlots]) => [
        telegraf_1.Markup.button.callback(daySlots[0].dayLabel, `booking_day_${dayKey}`),
    ]);
    buttons.push([telegraf_1.Markup.button.callback("← Назад", "booking_back_months")]);
    ctx.scene.state = { ...s(ctx), monthKey };
    const text = `Выберите день:\n<b>${(0, format_1.formatMonthLabel)(monthKey)}</b>`;
    ctx.callbackQuery
        ? await ctx.editMessageText(text, {
            ...telegraf_1.Markup.inlineKeyboard(buttons),
            parse_mode: "HTML",
        })
        : await ctx.reply(text, {
            ...telegraf_1.Markup.inlineKeyboard(buttons),
            parse_mode: "HTML",
        });
}
async function showTimeSelection(ctx, dayKey, slots) {
    const daySlots = slots.get(dayKey);
    if (!daySlots || daySlots.length === 0) {
        const { monthKey, monthPage } = s(ctx);
        if (monthKey)
            return showDaySelectionForMonth(ctx, monthKey);
        return showMonthSelection(ctx, monthPage ?? 0);
    }
    const slotMap = {};
    const timeButtons = daySlots.map((slot, i) => {
        slotMap[String(i)] = slot.eventId;
        return [telegraf_1.Markup.button.callback(slot.timeLabel, `booking_time_${i}`)];
    });
    ctx.scene.state = {
        ...s(ctx),
        slots: slotMap,
        dayLabel: daySlots[0].dayLabel,
    };
    await ctx.editMessageText(`Выберите удобное время:\n<b>${daySlots[0].dayLabel}</b>`, {
        ...telegraf_1.Markup.inlineKeyboard([
            ...timeButtons,
            [telegraf_1.Markup.button.callback("← Назад", "booking_back_days")],
        ]),
        parse_mode: "HTML",
    });
}
//# sourceMappingURL=booking.scene.js.map