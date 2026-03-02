import { Telegraf, Scenes } from 'telegraf';
import { logger } from '../logger';
import { config } from '../config';
import type { BotContext } from '../types';
import { buildSessionMiddleware } from './session';
import { sendMainMenu } from './keyboards';
import { onboardingScene, SCENE_ONBOARDING } from '../scenes/onboarding.scene';
import { bookingScene, SCENE_BOOKING } from '../scenes/booking.scene';
import { aiScene } from '../scenes/ai.scene';
import { registerMenuHandlers } from '../handlers/menu.handler';
import { getUserByTelegramId, getUserBooking, confirmLesson } from '../services/user.service';
import { startScheduler } from '../jobs/scheduler';
import { initClientTelegram } from './telegram';

export function createBot(): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(config.bot.token);

  // ── Middleware stack (order matters) ──────────────────────────────────────
  bot.use(buildSessionMiddleware());

  const stage = new Scenes.Stage<BotContext>([onboardingScene, bookingScene, aiScene]);
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

    // name is null until the user completes the full onboarding flow
    if (!user || !user.name) {
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

  // ── Lesson confirmation (from 24h reminder inline button) ─────────────────
  bot.action(/^confirm_lesson_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Участие подтверждено! До встречи 👋');
    if (!ctx.from) return;
    const user = getUserByTelegramId(ctx.from.id);
    if (!user) return;
    confirmLesson(user.id);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  });

  // ── Noop (placeholder buttons that do nothing) ────────────────────────────
  bot.action('noop', (ctx) => ctx.answerCbQuery());

  initClientTelegram(bot.telegram);
  startScheduler(bot);

  return bot;
}
