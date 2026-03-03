import { Markup } from "telegraf";
import type { BotContext } from "../types";

export const MAIN_MENU_BTN = "📋 Моё бронирование";
export const RESCHEDULE_BTN = "🔄 Перенести запись";
export const CONTACT_MANAGER_BTN = "💬 Связаться с менеджером";
export const USE_AI = "🤖 Спросить AI";
export const EXIT_AI_BTN = "← Выйти из AI";

export async function sendMainMenu(
  ctx: BotContext,
  text: string,
): Promise<void> {
  await ctx.reply(
    text,
    Markup.keyboard([
      [MAIN_MENU_BTN, CONTACT_MANAGER_BTN],
      [RESCHEDULE_BTN, USE_AI],
    ]).resize(),
  );
}

export async function sendAiMenu(
  ctx: BotContext,
  text: string,
): Promise<void> {
  await ctx.reply(text, Markup.keyboard([[EXIT_AI_BTN]]).resize());
}
