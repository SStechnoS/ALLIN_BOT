import { Telegraf, Scenes } from 'telegraf';
import { logger } from '../logger';
import { config } from '../config';
import type { BotContext } from '../types';
import { buildSessionMiddleware } from './session';

/**
 * Factory — creates, configures and returns the bot instance.
 * Register new scenes / handlers here as features are added.
 */
export function createBot(): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(config.bot.token);

  // ── Middleware stack (order matters) ──────────────────────────────────────
  bot.use(buildSessionMiddleware());

  // Scene manager — register scenes via stage.register(scene) as you add them
  const stage = new Scenes.Stage<BotContext>([]);
  bot.use(stage.middleware());

  // Global error handler
  bot.catch((err, ctx) => {
    logger.error('Unhandled bot error', {
      error: err instanceof Error ? err.message : String(err),
      update: ctx.update,
    });
  });

  // ── Base commands ─────────────────────────────────────────────────────────
  bot.start((ctx) => ctx.reply('Bot is running.'));
  bot.help((ctx) => ctx.reply('Commands:\n/start — start\n/help — this message'));

  return bot;
}
