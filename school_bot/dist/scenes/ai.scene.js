"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiScene = exports.SCENE_AI = void 0;
const telegraf_1 = require("telegraf");
const openai_service_1 = require("../services/openai.service");
const keyboards_1 = require("../bot/keyboards");
const user_service_1 = require("../services/user.service");
const onboarding_scene_1 = require("./onboarding.scene");
const booking_scene_1 = require("./booking.scene");
const logger_1 = require("../logger");
const config_1 = require("../config");
exports.SCENE_AI = "ai";
function s(ctx) {
    const state = ctx.scene.state;
    if (!state.history)
        state.history = [];
    return state;
}
// ── Scene ──────────────────────────────────────────────────────────────────
exports.aiScene = new telegraf_1.Scenes.BaseScene(exports.SCENE_AI);
// ── Enter ──────────────────────────────────────────────────────────────────
exports.aiScene.enter(async (ctx) => {
    ctx.scene.state = { history: [] };
    await (0, keyboards_1.sendAiMenu)(ctx, "AI режим включён. Задайте свой вопрос — я постараюсь помочь!\n\nЧтобы выйти, нажмите кнопку ниже.");
});
// ── /start — exit AI mode and follow normal routing ────────────────────────
exports.aiScene.command("start", async (ctx) => {
    if (!ctx.from)
        return;
    await ctx.scene.leave();
    const user = (0, user_service_1.getUserByTelegramId)(ctx.from.id);
    if (!user || !user.name)
        return ctx.scene.enter(onboarding_scene_1.SCENE_ONBOARDING);
    const booking = (0, user_service_1.getUserBooking)(user.id);
    if (!booking)
        return ctx.scene.enter(booking_scene_1.SCENE_BOOKING);
    await (0, keyboards_1.sendMainMenu)(ctx, `С возвращением, ${user.name ?? ctx.from.first_name}!`);
});
// ── Exit button ────────────────────────────────────────────────────────────
exports.aiScene.hears(keyboards_1.EXIT_AI_BTN, async (ctx) => {
    await ctx.scene.leave();
    await (0, keyboards_1.sendMainMenu)(ctx, "Вы вышли из AI режима.");
});
// ── Text messages — chat with AI ───────────────────────────────────────────
exports.aiScene.on("text", async (ctx) => {
    if (!config_1.config.openai.apiKey) {
        await ctx.reply("AI режим временно недоступен. Обратитесь к менеджеру.");
        return;
    }
    const userText = ctx.message.text;
    const state = s(ctx);
    state.history.push({ role: "user", content: userText });
    await ctx.sendChatAction("typing");
    let reply;
    try {
        reply = await (0, openai_service_1.askAi)(state.history);
    }
    catch (err) {
        logger_1.logger.error("OpenAI request failed", { err });
        state.history.pop(); // remove the failed user message to keep history consistent
        await ctx.reply("Произошла ошибка при обращении к AI. Попробуйте ещё раз.");
        return;
    }
    state.history.push({ role: "assistant", content: reply });
    await ctx.reply(reply);
});
// ── Non-text messages ──────────────────────────────────────────────────────
exports.aiScene.on("message", async (ctx) => {
    await ctx.reply("Я понимаю только текстовые сообщения. Напишите свой вопрос.");
});
//# sourceMappingURL=ai.scene.js.map