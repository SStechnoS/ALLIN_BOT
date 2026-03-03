import { Scenes } from "telegraf";
import type { BotContext } from "../types";
import { askAi, type AiMessage } from "../services/openai.service";
import { sendMainMenu, sendAiMenu, EXIT_AI_BTN } from "../bot/keyboards";
import { getUserByTelegramId, getUserBooking } from "../services/user.service";
import { SCENE_ONBOARDING } from "./onboarding.scene";
import { SCENE_BOOKING } from "./booking.scene";
import { logger } from "../logger";
import { config } from "../config";

export const SCENE_AI = "ai";

interface AiState {
  history: AiMessage[];
}

function s(ctx: BotContext): AiState {
  const state = ctx.scene.state as Partial<AiState>;
  if (!state.history) state.history = [];
  return state as AiState;
}

// ── Scene ──────────────────────────────────────────────────────────────────

export const aiScene = new Scenes.BaseScene<BotContext>(SCENE_AI);

// ── Enter ──────────────────────────────────────────────────────────────────

aiScene.enter(async (ctx) => {
  ctx.scene.state = { history: [] } satisfies AiState;
  await sendAiMenu(
    ctx,
    "🤖 <b>AI-ассистент активирован!</b>\n\nЯ знаю всё об All In Academy и готов ответить на ваши вопросы 💬\n\nСпрашивайте — я помогу! Чтобы выйти, нажмите кнопку ниже.",
  );
});

// ── /start — exit AI mode and follow normal routing ────────────────────────

aiScene.command("start", async (ctx) => {
  if (!ctx.from) return;
  await ctx.scene.leave();

  const user = getUserByTelegramId(ctx.from.id);
  if (!user || !user.name) return ctx.scene.enter(SCENE_ONBOARDING);

  const booking = getUserBooking(user.id);
  if (!booking) return ctx.scene.enter(SCENE_BOOKING);

  await sendMainMenu(ctx, `👋 С возвращением, ${user.name ?? ctx.from.first_name}!`);
});

// ── Exit button ────────────────────────────────────────────────────────────

aiScene.hears(EXIT_AI_BTN, async (ctx) => {
  await ctx.scene.leave();
  await sendMainMenu(ctx, "✅ Вы вышли из AI режима. Чем могу помочь?");
});

// ── Text messages — chat with AI ───────────────────────────────────────────

aiScene.on("text", async (ctx) => {
  if (!config.openai.apiKey) {
    await ctx.reply("⚠️ AI режим временно недоступен. Свяжитесь с менеджером 💬");
    return;
  }

  const userText = ctx.message.text;
  const state = s(ctx);

  state.history.push({ role: "user", content: userText });

  await ctx.sendChatAction("typing");

  let reply: string;
  try {
    reply = await askAi(state.history);
  } catch (err) {
    logger.error("OpenAI request failed", { err });
    state.history.pop(); // remove the failed user message to keep history consistent
    await ctx.reply("⚠️ Не удалось получить ответ. Попробуйте ещё раз или задайте другой вопрос.");
    return;
  }

  state.history.push({ role: "assistant", content: reply });

  await ctx.reply(reply);
});

// ── Non-text messages ──────────────────────────────────────────────────────

aiScene.on("message", async (ctx) => {
  await ctx.reply("🖊️ Я понимаю только текстовые сообщения. Напишите ваш вопрос!");
});
