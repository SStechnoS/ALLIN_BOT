import { Scenes, Markup } from "telegraf";
import type { BotContext } from "../types";
import {
  getAvailableSlots,
  bookSlot,
  type CalendarSlot,
} from "../services/calendar.service";
import {
  getUserByTelegramId,
  createBooking,
  getUserBooking,
} from "../services/user.service";
import { createMeeting } from "../services/zoom.service";
import { cancelNudges, scheduleLessonReminders } from "../jobs/notifications";
import { notifyAdmins } from "../admin/notifications";
import { syncUserRow } from "../services/sheets.service";
import { formatDay, formatTime, formatMonthLabel } from "../utils/format";
import { sendMainMenu } from "../bot/keyboards";
import { logger } from "../logger";
import { SCENE_ONBOARDING } from "./onboarding.scene";
import { getBotMessage } from "../services/bot-messages.service";

export const SCENE_BOOKING = "booking";

/** Scene-local state stored in ctx.scene.state (persisted under __scenes in SQLite). */
interface BookingState {
  monthPage?: number; // current page in month picker (0-based)
  monthKey?: string; // selected month "YYYY-MM"
  dayKey?: string;
  dayLabel?: string;
  slots?: Record<string, string>; // index → Google Calendar eventId
  eventId?: string;
  timeLabel?: string;
  eventStart?: number;
  eventEnd?: number;
}

function s(ctx: BotContext): BookingState {
  return ctx.scene.state as BookingState;
}

function clearState(ctx: BotContext): void {
  ctx.scene.state = {} satisfies BookingState;
}

// ────────────────────────────────────────────────────────────────────────────

export const bookingScene = new Scenes.BaseScene<BotContext>(SCENE_BOOKING);

// ── Enter ──────────────────────────────────────────────────────────────────

bookingScene.enter(async (ctx) => {
  clearState(ctx);
  await showMonthSelection(ctx, 0);
});

// ── Month selected ─────────────────────────────────────────────────────────

bookingScene.action(/^booking_month_(\d{4}-\d{2})$/, async (ctx) => {
  await ctx.answerCbQuery();
  const monthKey = ctx.match![1]!;
  await showDaySelectionForMonth(ctx, monthKey);
});

// ── Month page navigation ──────────────────────────────────────────────────

bookingScene.action(/^booking_mpage_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const page = parseInt(ctx.match![1]!, 10);
  await showMonthSelection(ctx, page);
});

// ── Day selected ───────────────────────────────────────────────────────────

bookingScene.action(/^booking_day_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const dayKey = ctx.match?.[1];
  if (!dayKey) return;

  let slots: Map<string, CalendarSlot[]>;
  try {
    slots = await getAvailableSlots();
  } catch (err) {
    logger.error("Calendar fetch failed", { err });
    await ctx.answerCbQuery("Ошибка загрузки расписания. Попробуйте позже.");
    return;
  }

  const daySlots = slots.get(dayKey);
  if (!daySlots || daySlots.length === 0) {
    const { monthKey, monthPage } = s(ctx);
    if (monthKey) {
      await showDaySelectionForMonth(ctx, monthKey);
    } else {
      await showMonthSelection(ctx, monthPage ?? 0);
    }
    return;
  }

  const slotMap: Record<string, string> = {};
  const timeButtons = daySlots.map((slot, i) => {
    slotMap[String(i)] = slot.eventId;
    return [Markup.button.callback(slot.timeLabel, `booking_time_${i}`)];
  });

  ctx.scene.state = {
    ...s(ctx),
    dayKey,
    dayLabel: daySlots[0]!.dayLabel,
    slots: slotMap,
  };

  await ctx.editMessageText(
    `🕐 Выберите удобное время:\n<b>${daySlots[0]!.dayLabel}</b>`,
    {
      ...Markup.inlineKeyboard([
        ...timeButtons,
        [Markup.button.callback("← Назад к дням", "booking_back_days")],
      ]),
      parse_mode: "HTML",
    },
  );
});

// ── Time selected ──────────────────────────────────────────────────────────

bookingScene.action(/^booking_time_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const idx = ctx.match?.[1];
  if (idx === undefined) return;

  const state = s(ctx);
  const eventId = state.slots?.[idx];
  if (!eventId) {
    await ctx.answerCbQuery("Слот недоступен, выберите другое время.");
    return;
  }

  let slots: Map<string, CalendarSlot[]>;
  try {
    slots = await getAvailableSlots();
  } catch (err) {
    logger.error("Calendar fetch failed", { err });
    return;
  }

  const dayKey = state.dayKey;
  if (!dayKey) return;

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

  await ctx.editMessageText(
    `📋 <b>Проверьте запись на пробный урок:</b>\n\n` +
      `📅 <b>День:</b> ${state.dayLabel}\n` +
      `🕐 <b>Время:</b> ${slot.timeLabel}\n\n` +
      `Всё верно? Нажмите «Подтвердить» 👇`,
    {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Подтвердить запись", "booking_confirm")],
        [Markup.button.callback("← Назад к времени", "booking_back_times")],
      ]),
      parse_mode: "HTML",
    },
  );
});

// ── Confirm booking ────────────────────────────────────────────────────────

bookingScene.action("booking_confirm", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.from) return;

  const state = s(ctx);
  const {
    eventId,
    dayLabel = "",
    timeLabel = "",
    eventStart,
    eventEnd,
  } = state;

  if (!eventId || !eventStart || !eventEnd) {
    await ctx.reply("⚠️ Что-то пошло не так. Начните выбор заново.");
    return ctx.scene.reenter();
  }

  const user = getUserByTelegramId(ctx.from.id);
  if (!user) {
    await ctx.reply("⚠️ Пользователь не найден. Нажмите /start");
    return ctx.scene.leave();
  }

  // Create Zoom meeting for the selected slot
  let zoomLink: string | undefined;
  let zoomMeetingId: string | undefined;
  try {
    const startIso = new Date(eventStart * 1000).toISOString();
    const durationMinutes = Math.round((eventEnd - eventStart) / 60);
    const meeting = await createMeeting({
      topic: `Пробный урок — ${user.name ?? ctx.from.first_name}`,
      startTime: startIso,
      durationMinutes: durationMinutes > 0 ? durationMinutes : 60,
    });
    zoomLink = meeting.joinUrl;
    zoomMeetingId = meeting.meetingId;
  } catch (err) {
    logger.error("Zoom meeting creation failed", { err, eventId });
    // Non-fatal: continue booking without Zoom link
  }

  try {
    await bookSlot(eventId, user.name ?? ctx.from.first_name);
    createBooking({
      userId: user.id,
      calendarEventId: eventId,
      eventStart,
      eventEnd,
      zoomLink,
      zoomMeetingId,
    });
  } catch (err) {
    logger.error("Booking failed", { err, eventId });
    await ctx.answerCbQuery("⚠️ Не удалось забронировать. Попробуйте ещё раз.");
    return;
  }

  // Cancel nudge jobs, schedule lesson reminders
  cancelNudges(ctx.from.id);
  scheduleLessonReminders(
    ctx.from.id,
    eventStart,
    eventId,
    dayLabel,
    timeLabel,
    zoomLink ?? "",
  );

  // Notify admins about the new booking (fire-and-forget)
  const tgHandle = user.telegram_name
    ? `@${user.telegram_name}`
    : String(ctx.from.id);
  notifyAdmins(
    `📅 <b>Новая запись!</b>\n\n` +
      `<b>Имя:</b> ${user.name ?? ctx.from.first_name}\n` +
      `<b>Телефон:</b> ${user.phone ?? "—"}\n` +
      `<b>Email:</b> ${user.email ?? "—"}\n` +
      `<b>Telegram:</b> ${tgHandle}\n\n` +
      `<b>День:</b> ${dayLabel}\n` +
      `<b>Время:</b> ${timeLabel}` +
      (zoomLink ? `\n<b>Zoom:</b> ${zoomLink}` : ""),
  ).catch((err) => logger.error("Admin booking notification failed", { err }));

  // Sync sheet row with booking data
  if (user.sheets_row) {
    const startDate = new Date(eventStart * 1000);
    const now = Math.floor(Date.now() / 1000);
    try {
      await syncUserRow(user.sheets_row, {
        lessonDate: formatDay(startDate),
        lessonTime: formatTime(startDate),
        lessonDatetime: startDate.toISOString(),
        zoomLink,
        zoomMeetingId,
        confirmed: true,
        confirmedAt: now,
        calendarEventId: eventId,
        status: "booked",
      });
    } catch (err) {
      logger.error("Sheet sync failed (booking confirm)", { err });
    }
  }

  clearState(ctx);

  const zoomLine = zoomLink ? `\n🔗 <b>Ссылка Zoom:</b> ${zoomLink}` : "";

  await ctx.editMessageText(
    `🎉 <b>Запись подтверждена!</b>\n\n` +
      `👤 <b>Имя:</b> ${user.name ?? ctx.from.first_name}\n` +
      (user.phone ? `📱 <b>Телефон:</b> ${user.phone}\n` : "") +
      (user.email ? `📧 <b>Email:</b> ${user.email}\n` : "") +
      `\n📅 <b>День:</b> ${dayLabel}\n` +
      `🕐 <b>Время:</b> ${timeLabel}` +
      zoomLine +
      `\n\n✨ Ждём вас на уроке!`,
    { parse_mode: "HTML" },
  );

  await sendMainMenu(ctx, "📋 Ваша запись сохранена. Чем могу помочь?");
  return ctx.scene.leave();
});

// ── Back buttons ───────────────────────────────────────────────────────────

bookingScene.action("booking_back_months", async (ctx) => {
  await ctx.answerCbQuery();
  const page = s(ctx).monthPage ?? 0;
  ctx.scene.state = { monthPage: page };
  await showMonthSelection(ctx, page);
});

bookingScene.action("booking_back_days", async (ctx) => {
  await ctx.answerCbQuery();
  const { monthKey, monthPage } = s(ctx);
  ctx.scene.state = { monthKey, monthPage };
  if (monthKey) {
    await showDaySelectionForMonth(ctx, monthKey);
  } else {
    await showMonthSelection(ctx, monthPage ?? 0);
  }
});

bookingScene.action("booking_back_times", async (ctx) => {
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
    if (monthKey) return showDaySelectionForMonth(ctx, monthKey);
    return showMonthSelection(ctx, monthPage ?? 0);
  }

  let slots: Map<string, CalendarSlot[]>;
  try {
    slots = await getAvailableSlots();
  } catch {
    if (monthKey) return showDaySelectionForMonth(ctx, monthKey);
    return showMonthSelection(ctx, monthPage ?? 0);
  }

  return showTimeSelection(ctx, dayKey, slots);
});

// ── /start inside booking scene ────────────────────────────────────────────

bookingScene.command("start", async (ctx) => {
  if (!ctx.from) return;

  // Выходим из текущей сцены и пересобираем состояние так же, как в глобальном /start
  await ctx.scene.leave();

  const user = getUserByTelegramId(ctx.from.id);

  // Пользователь ещё не завершил онбординг — отправляем в onboarding
  if (!user || !user.name) {
    return ctx.scene.enter(SCENE_ONBOARDING);
  }

  const booking = getUserBooking(user.id);

  const welcomeText = getBotMessage("welcome_text");

  // Нет бронирования — сразу переходим к выбору времени
  if (!booking) {
    await ctx.reply(welcomeText);
    return ctx.scene.enter(SCENE_BOOKING);
  }

  // Есть бронирование — показываем главное меню
  await sendMainMenu(
    ctx,
    `С возвращением, ${user.name ?? ctx.from.first_name}!`,
  );
});

// ── Ignore unexpected text input ───────────────────────────────────────────

bookingScene.on("message", async (ctx) => {
  await ctx.reply(
    "☝️ Для выбора времени используйте кнопки в сообщении выше.\n\nЧтобы начать заново — отправьте /start",
  );
});

// ── Helpers ────────────────────────────────────────────────────────────────

const MONTHS_PER_PAGE = 6;

async function showMonthSelection(
  ctx: BotContext,
  page: number,
): Promise<void> {
  let slots: Map<string, CalendarSlot[]>;
  try {
    slots = await getAvailableSlots();
  } catch (err) {
    logger.error("Calendar fetch failed on showMonthSelection", { err });
    const msg = "Не удалось загрузить расписание. Попробуйте позже.";
    ctx.callbackQuery ? await ctx.editMessageText(msg) : await ctx.reply(msg);
    await ctx.scene.leave();
    return;
  }

  if (slots.size === 0) {
    const msg = "😔 К сожалению, свободных слотов пока нет.\n\nСвяжитесь с менеджером — он поможет подобрать время 👇";
    ctx.callbackQuery ? await ctx.editMessageText(msg) : await ctx.reply(msg);
    await ctx.scene.leave();
    return;
  }

  // Collect unique months in sorted order
  const monthsSet = new Set<string>();
  for (const dayKey of slots.keys()) {
    monthsSet.add(dayKey.substring(0, 7)); // "YYYY-MM"
  }
  const months = Array.from(monthsSet).sort();

  const totalPages = Math.ceil(months.length / MONTHS_PER_PAGE);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const pageMonths = months.slice(
    safePage * MONTHS_PER_PAGE,
    (safePage + 1) * MONTHS_PER_PAGE,
  );

  // Two-column layout
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < pageMonths.length; i += 2) {
    const row: ReturnType<typeof Markup.button.callback>[] = [
      Markup.button.callback(
        formatMonthLabel(pageMonths[i]!),
        `booking_month_${pageMonths[i]}`,
      ),
    ];
    if (pageMonths[i + 1]) {
      row.push(
        Markup.button.callback(
          formatMonthLabel(pageMonths[i + 1]!),
          `booking_month_${pageMonths[i + 1]}`,
        ),
      );
    }
    rows.push(row);
  }

  // Page navigation if needed
  if (totalPages > 1) {
    const navRow: ReturnType<typeof Markup.button.callback>[] = [];
    if (safePage > 0)
      navRow.push(
        Markup.button.callback("← Назад", `booking_mpage_${safePage - 1}`),
      );
    if (safePage < totalPages - 1)
      navRow.push(
        Markup.button.callback("Вперёд →", `booking_mpage_${safePage + 1}`),
      );
    rows.push(navRow);
  }

  ctx.scene.state = { ...s(ctx), monthPage: safePage };

  const text = "📅 Выберите удобный месяц для пробного урока:";
  ctx.callbackQuery
    ? await ctx.editMessageText(text, Markup.inlineKeyboard(rows))
    : await ctx.reply(text, Markup.inlineKeyboard(rows));
}

async function showDaySelectionForMonth(
  ctx: BotContext,
  monthKey: string,
): Promise<void> {
  let slots: Map<string, CalendarSlot[]>;
  try {
    slots = await getAvailableSlots();
  } catch (err) {
    logger.error("Calendar fetch failed on showDaySelectionForMonth", { err });
    const msg = "Не удалось загрузить расписание. Попробуйте позже.";
    ctx.callbackQuery ? await ctx.editMessageText(msg) : await ctx.reply(msg);
    await ctx.scene.leave();
    return;
  }

  const monthDays = Array.from(slots.entries()).filter(([dayKey]) =>
    dayKey.startsWith(monthKey),
  );
  if (monthDays.length === 0) {
    await showMonthSelection(ctx, s(ctx).monthPage ?? 0);
    return;
  }

  const buttons = monthDays.map(([dayKey, daySlots]) => [
    Markup.button.callback(daySlots[0]!.dayLabel, `booking_day_${dayKey}`),
  ]);
  buttons.push([Markup.button.callback("← Назад", "booking_back_months")]);

  ctx.scene.state = { ...s(ctx), monthKey };

  const text = `📆 Выберите день:\n<b>${formatMonthLabel(monthKey)}</b>`;
  ctx.callbackQuery
    ? await ctx.editMessageText(text, {
        ...Markup.inlineKeyboard(buttons),
        parse_mode: "HTML",
      })
    : await ctx.reply(text, {
        ...Markup.inlineKeyboard(buttons),
        parse_mode: "HTML",
      });
}

async function showTimeSelection(
  ctx: BotContext,
  dayKey: string,
  slots: Map<string, CalendarSlot[]>,
): Promise<void> {
  const daySlots = slots.get(dayKey);
  if (!daySlots || daySlots.length === 0) {
    const { monthKey, monthPage } = s(ctx);
    if (monthKey) return showDaySelectionForMonth(ctx, monthKey);
    return showMonthSelection(ctx, monthPage ?? 0);
  }

  const slotMap: Record<string, string> = {};
  const timeButtons = daySlots.map((slot, i) => {
    slotMap[String(i)] = slot.eventId;
    return [Markup.button.callback(slot.timeLabel, `booking_time_${i}`)];
  });

  ctx.scene.state = {
    ...s(ctx),
    slots: slotMap,
    dayLabel: daySlots[0]!.dayLabel,
  };

  await ctx.editMessageText(
    `🕐 Выберите удобное время:\n<b>${daySlots[0]!.dayLabel}</b>`,
    {
      ...Markup.inlineKeyboard([
        ...timeButtons,
        [Markup.button.callback("← Назад к дням", "booking_back_days")],
      ]),
      parse_mode: "HTML",
    },
  );
}
