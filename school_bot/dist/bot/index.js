"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBot = createBot;
const telegraf_1 = require("telegraf");
const logger_1 = require("../logger");
const config_1 = require("../config");
const session_1 = require("./session");
const keyboards_1 = require("./keyboards");
const onboarding_scene_1 = require("../scenes/onboarding.scene");
const booking_scene_1 = require("../scenes/booking.scene");
const ai_scene_1 = require("../scenes/ai.scene");
const menu_handler_1 = require("../handlers/menu.handler");
const user_service_1 = require("../services/user.service");
const scheduler_1 = require("../jobs/scheduler");
const telegram_1 = require("./telegram");
function createBot() {
    const bot = new telegraf_1.Telegraf(config_1.config.bot.token);
    // ── Middleware stack (order matters) ──────────────────────────────────────
    bot.use((0, session_1.buildSessionMiddleware)());
    const stage = new telegraf_1.Scenes.Stage([onboarding_scene_1.onboardingScene, booking_scene_1.bookingScene, ai_scene_1.aiScene]);
    bot.use(stage.middleware());
    // Global error handler
    bot.catch((err, ctx) => {
        logger_1.logger.error('Unhandled bot error', {
            error: err instanceof Error ? err.message : String(err),
            update: ctx.update,
        });
    });
    // ── /start ────────────────────────────────────────────────────────────────
    bot.start(async (ctx) => {
        if (!ctx.from)
            return;
        // Always leave any active scene before re-evaluating state
        await ctx.scene.leave();
        const user = (0, user_service_1.getUserByTelegramId)(ctx.from.id);
        // name is null until the user completes the full onboarding flow
        if (!user || !user.name) {
            return ctx.scene.enter(onboarding_scene_1.SCENE_ONBOARDING);
        }
        const booking = (0, user_service_1.getUserBooking)(user.id);
        if (!booking) {
            return ctx.scene.enter(booking_scene_1.SCENE_BOOKING);
        }
        // User is fully registered and has a booking — show main menu
        await (0, keyboards_1.sendMainMenu)(ctx, `С возвращением, ${user.name ?? ctx.from.first_name}!`);
    });
    bot.help((ctx) => ctx.reply('/start — начать\n/help — помощь'));
    (0, menu_handler_1.registerMenuHandlers)(bot);
    // ── Lesson confirmation (from 24h reminder inline button) ─────────────────
    bot.action(/^confirm_lesson_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery('Участие подтверждено! До встречи 👋');
        if (!ctx.from)
            return;
        const user = (0, user_service_1.getUserByTelegramId)(ctx.from.id);
        if (!user)
            return;
        (0, user_service_1.confirmLesson)(user.id);
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    });
    // ── Noop (placeholder buttons that do nothing) ────────────────────────────
    bot.action('noop', (ctx) => ctx.answerCbQuery());
    (0, telegram_1.initClientTelegram)(bot.telegram);
    (0, scheduler_1.startScheduler)(bot);
    return bot;
}
//# sourceMappingURL=index.js.map