import type { Telegraf } from 'telegraf';
import type { BotContext } from '../types';
import {
  getUserByTelegramId,
  getUserBooking,
  deleteUserBooking,
} from '../services/user.service';
import { cancelSlot } from '../services/calendar.service';
import { syncUserRow } from '../services/sheets.service';
import { formatDay, formatTime } from '../utils/format';
import { MAIN_MENU_BTN, RESCHEDULE_BTN } from '../bot/keyboards';
import { SCENE_BOOKING } from '../scenes/booking.scene';
import { logger } from '../logger';

export function registerMenuHandlers(bot: Telegraf<BotContext>): void {
  // ── View booking ──────────────────────────────────────────────────────────

  bot.hears(MAIN_MENU_BTN, async (ctx) => {
    if (!ctx.from) return;

    const user = getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.reply('Вы не зарегистрированы. Нажмите /start для начала.');
      return;
    }

    const booking = getUserBooking(user.id);
    if (!booking) {
      await ctx.reply('У вас нет активных записей.');
      return;
    }

    const start = new Date(booking.event_start * 1000);
    const end = new Date(booking.event_end * 1000);
    const zoomLine = booking.zoom_link ? `\n<b>Ссылка Zoom:</b> ${booking.zoom_link}` : '';

    await ctx.reply(
      `<b>Ваша запись на пробный урок:</b>\n\n` +
        `<b>Имя:</b> ${user.name ?? ''}\n` +
        (user.phone ? `<b>Телефон:</b> ${user.phone}\n` : '') +
        (user.email ? `<b>Email:</b> ${user.email}\n` : '') +
        `\n<b>День:</b> ${formatDay(start)}\n` +
        `<b>Время:</b> ${formatTime(start)} — ${formatTime(end)}` +
        zoomLine,
      { parse_mode: 'HTML' },
    );
  });

  // ── Reschedule ────────────────────────────────────────────────────────────

  bot.hears(RESCHEDULE_BTN, async (ctx) => {
    if (!ctx.from) return;

    const user = getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.reply('Вы не зарегистрированы. Нажмите /start для начала.');
      return;
    }

    const booking = getUserBooking(user.id);
    if (!booking) {
      await ctx.reply('У вас нет активных записей для переноса.');
      return;
    }

    // Restore the Google Calendar slot so it becomes available again
    try {
      await cancelSlot(booking.calendar_event_id);
    } catch (err) {
      logger.error('Failed to cancel slot on Google Calendar', { err });
      // Non-fatal: proceed with reschedule regardless
    }

    deleteUserBooking(user.id);

    // Sync sheet: clear lesson data, set status to rescheduling
    if (user.sheets_row) {
      try {
        await syncUserRow(user.sheets_row, {
          lessonDate: '',
          lessonTime: '',
          lessonDatetime: '',
          zoomLink: '',
          zoomMeetingId: '',
          confirmed: false,
          calendarEventId: '',
          status: 'rescheduling',
        });
      } catch (err) {
        logger.error('Sheet sync failed (reschedule)', { err });
      }
    }

    await ctx.reply('Запись отменена. Выберите новое удобное время:');
    return ctx.scene.enter(SCENE_BOOKING);
  });
}
