import { Markup } from 'telegraf';
import type { BotContext } from '../types';

export const MAIN_MENU_BTN = '📋 Моё бронирование';
export const RESCHEDULE_BTN = '🔄 Перенести запись';

export async function sendMainMenu(ctx: BotContext, text: string): Promise<void> {
  await ctx.reply(
    text,
    Markup.keyboard([[MAIN_MENU_BTN], [RESCHEDULE_BTN]]).resize(),
  );
}
