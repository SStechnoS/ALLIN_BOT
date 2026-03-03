"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMenuHandlers = registerMenuHandlers;
const telegraf_1 = require("telegraf");
const user_service_1 = require("../services/user.service");
const calendar_service_1 = require("../services/calendar.service");
const sheets_service_1 = require("../services/sheets.service");
const format_1 = require("../utils/format");
const keyboards_1 = require("../bot/keyboards");
const ai_scene_1 = require("../scenes/ai.scene");
const notifications_1 = require("../jobs/notifications");
const booking_scene_1 = require("../scenes/booking.scene");
const logger_1 = require("../logger");
function registerMenuHandlers(bot) {
    // ── View booking ──────────────────────────────────────────────────────────
    bot.hears(keyboards_1.MAIN_MENU_BTN, async (ctx) => {
        if (!ctx.from)
            return;
        const user = (0, user_service_1.getUserByTelegramId)(ctx.from.id);
        if (!user) {
            await ctx.reply("Вы не зарегистрированы. Нажмите /start для начала.");
            return;
        }
        const booking = (0, user_service_1.getUserBooking)(user.id);
        if (!booking) {
            return ctx.scene.enter(booking_scene_1.SCENE_BOOKING);
        }
        const start = new Date(booking.event_start * 1000);
        const end = new Date(booking.event_end * 1000);
        const zoomLine = booking.zoom_link
            ? `\n<b>Ссылка Zoom:</b> ${booking.zoom_link}`
            : "";
        await ctx.reply(`<b>Ваша запись на пробный урок:</b>\n\n` +
            `<b>Имя:</b> ${user.name ?? ""}\n` +
            (user.phone ? `<b>Телефон:</b> ${user.phone}\n` : "") +
            (user.email ? `<b>Email:</b> ${user.email}\n` : "") +
            `\n<b>День:</b> ${(0, format_1.formatDay)(start)}\n` +
            `<b>Время:</b> ${(0, format_1.formatTime)(start)} — ${(0, format_1.formatTime)(end)}` +
            zoomLine, { parse_mode: "HTML" });
    });
    // ── Reschedule ────────────────────────────────────────────────────────────
    bot.hears(keyboards_1.RESCHEDULE_BTN, async (ctx) => {
        if (!ctx.from)
            return;
        const user = (0, user_service_1.getUserByTelegramId)(ctx.from.id);
        if (!user) {
            await ctx.reply("Вы не зарегистрированы. Нажмите /start для начала.");
            return;
        }
        const booking = (0, user_service_1.getUserBooking)(user.id);
        if (!booking) {
            return ctx.scene.enter(booking_scene_1.SCENE_BOOKING);
        }
        // Restore the Google Calendar slot so it becomes available again
        try {
            await (0, calendar_service_1.cancelSlot)(booking.calendar_event_id);
        }
        catch (err) {
            logger_1.logger.error("Failed to cancel slot on Google Calendar", { err });
            // Non-fatal: proceed with reschedule regardless
        }
        (0, user_service_1.deleteUserBooking)(user.id);
        // Cancel lesson reminders, schedule new nudges
        (0, notifications_1.cancelLessonReminders)(ctx.from.id);
        (0, notifications_1.scheduleNudges)(ctx.from.id, Math.floor(Date.now() / 1000));
        // Sync sheet: clear lesson data, set status to rescheduling
        if (user.sheets_row) {
            try {
                await (0, sheets_service_1.syncUserRow)(user.sheets_row, {
                    lessonDate: "",
                    lessonTime: "",
                    lessonDatetime: "",
                    zoomLink: "",
                    zoomMeetingId: "",
                    confirmed: false,
                    calendarEventId: "",
                    status: "rescheduling",
                });
            }
            catch (err) {
                logger_1.logger.error("Sheet sync failed (reschedule)", { err });
            }
        }
        await ctx.reply("Запись отменена. Выберите новое удобное время:");
        return ctx.scene.enter(booking_scene_1.SCENE_BOOKING);
    });
    // ── AI mode ───────────────────────────────────────────────────────────────
    bot.hears(keyboards_1.USE_AI, async (ctx) => {
        return ctx.scene.enter(ai_scene_1.SCENE_AI);
    });
    // ── Contact manager ───────────────────────────────────────────────────────
    bot.hears(keyboards_1.CONTACT_MANAGER_BTN, async (ctx) => {
        const url = "https://t.me/lxvrovv";
        if (!url) {
            await ctx.reply("Контакт менеджера сейчас недоступен. Попробуйте позже или воспользуйтесь /start.");
            return;
        }
        await ctx.reply("Напишите менеджеру напрямую:", telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.url("Открыть чат с менеджером", url)],
        ]));
    });
}
//# sourceMappingURL=menu.handler.js.map