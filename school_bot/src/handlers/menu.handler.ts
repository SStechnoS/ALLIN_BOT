import type { Telegraf } from 'telegraf';
import type { BotContext } from '../types';
import { getUserByTelegramId, getUserBooking } from '../services/user.service';
import { formatDay, formatTime } from '../utils/format';
import { MAIN_MENU_BTN } from '../bot/keyboards';

export function registerMenuHandlers(bot: Telegraf<BotContext>): void {
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

    await ctx.reply(
      `<b>Ваша запись на пробный урок:</b>\n\n` +
        `<b>День:</b> ${formatDay(start)}\n` +
        `<b>Время:</b> ${formatTime(start)} — ${formatTime(end)}`,
      { parse_mode: 'HTML' },
    );
  });
}
