import { Markup } from 'telegraf';
import type { BotContext } from '../types';

export const MAIN_MENU_BTN = '📋 Моё бронирование';

export async function sendMainMenu(ctx: BotContext, text: string): Promise<void> {
  await ctx.reply(text, Markup.keyboard([[MAIN_MENU_BTN]]).resize());
}
