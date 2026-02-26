import { Telegraf, Scenes } from 'telegraf';
import { logger } from '../logger';
import { config } from '../config';
import type { BotContext } from '../types';
import { buildSessionMiddleware } from './session';
import { sendMainMenu } from './keyboards';
import { onboardingScene, SCENE_ONBOARDING } from '../scenes/onboarding.scene';
import { bookingScene, SCENE_BOOKING } from '../scenes/booking.scene';
import { registerMenuHandlers } from '../handlers/menu.handler';
import { getUserByTelegramId, getUserBooking } from '../services/user.service';

export function createBot(): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(config.bot.token);

  // ── Middleware stack (order matters) ──────────────────────────────────────
  bot.use(buildSessionMiddleware());

  const stage = new Scenes.Stage<BotContext>([onboardingScene, bookingScene]);
  bot.use(stage.middleware());

  // Global error handler
  bot.catch((err, ctx) => {
    logger.error('Unhandled bot error', {
      error: err instanceof Error ? err.message : String(err),
      update: ctx.update,
    });
  });

  // ── /start ────────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    if (!ctx.from) return;

    // Always leave any active scene before re-evaluating state
    await ctx.scene.leave();

    const user = getUserByTelegramId(ctx.from.id);

    if (!user) {
      return ctx.scene.enter(SCENE_ONBOARDING);
    }

    const booking = getUserBooking(user.id);

    if (!booking) {
      return ctx.scene.enter(SCENE_BOOKING);
    }

    // User is fully registered and has a booking — show main menu
    await sendMainMenu(ctx, `С возвращением, ${user.name ?? ctx.from.first_name}!`);
  });

  bot.help((ctx) =>
    ctx.reply('/start — начать\n/help — помощь'),
  );

  registerMenuHandlers(bot);

  return bot;
}
