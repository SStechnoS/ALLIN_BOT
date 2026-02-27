import { Scenes, Markup } from "telegraf";
import type { AdminBotContext } from "../types";
import {
  getBotMessage,
  setBotMessage,
  type BotMessageKey,
} from "../../services/bot-messages.service";
import { sendAdminMenu } from "../handlers/menu.handler";
import { getClientTelegram } from "../../bot/telegram";
import { logger } from "../../logger";

export const SCENE_ADMIN_MESSAGES = "admin_messages";

interface MessagesState {
  editing?: BotMessageKey;
}

function s(ctx: AdminBotContext): MessagesState {
  return ctx.scene.state as MessagesState;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export const adminMessagesScene = new Scenes.BaseScene<AdminBotContext>(
  SCENE_ADMIN_MESSAGES,
);

adminMessagesScene.enter(async (ctx) => {
  ctx.scene.state = {} satisfies MessagesState;
  await showMenu(ctx);
});

// ── Menu ──────────────────────────────────────────────────────────────────────

async function showMenu(ctx: AdminBotContext): Promise<void> {
  await ctx.reply("📝 <b>Тексты бота</b>\n\nВыберите, что изменить:", {
    parse_mode: "HTML",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("✏️ Текст приветствия", "msg_edit_welcome")],
      [Markup.button.callback("🎬 Кружок (video note)", "msg_edit_video")],
      [Markup.button.callback("↩️ Назад", "msg_back")],
    ]),
  });
}

// ── Actions ───────────────────────────────────────────────────────────────────

adminMessagesScene.action("msg_edit_welcome", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.state = { editing: "welcome_text" };
  const current = getBotMessage("welcome_text");
  await ctx.editMessageText(
    `✏️ <b>Текущий текст приветствия:</b>\n\n${current}\n\n<i>Отправьте новый текст:</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("↩️ Отмена", "msg_cancel_edit")],
      ]),
    },
  );
});

adminMessagesScene.action("msg_edit_video", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.state = { editing: "welcome_video_note_id" };
  const current = getBotMessage("welcome_video_note_id");
  await ctx.editMessageText(
    `🎬 <b>Кружок (video note)</b>\n` +
      `Текущий: ${current ? `установлен` : "не установлен"}\n\n` +
      `<i>Отправьте новое круглое видео:</i>`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("↩️ Отмена", "msg_cancel_edit")],
      ]),
    },
  );
});

adminMessagesScene.action("msg_cancel_edit", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.state = {};
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await showMenu(ctx);
});

adminMessagesScene.action("msg_back", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.scene.leave();
  await sendAdminMenu(ctx);
});

// ── Message handler ───────────────────────────────────────────────────────────

adminMessagesScene.on("message", async (ctx) => {
  const state = s(ctx);
  if (!state.editing) return;

  if (state.editing === "welcome_text") {
    if (!("text" in ctx.message)) {
      await ctx.reply("Пожалуйста, отправьте текстовое сообщение.");
      return;
    }
    setBotMessage("welcome_text", ctx.message.text);
    ctx.scene.state = {};
    await ctx.reply("✅ Текст приветствия обновлён!");
    await showMenu(ctx);
    return;
  }

  if (state.editing === "welcome_video_note_id") {
    if (!("video_note" in ctx.message)) {
      await ctx.reply("Пожалуйста, отправьте круглое видео (кружок).");
      return;
    }

    // Telegram file_ids are bot-specific: the admin bot's file_id won't work
    // when sent from the client bot. Download and re-upload via client bot.
    const adminFileId = ctx.message.video_note.file_id;
    console.log("file_id :>> ", ctx.message.video_note.file_id);
    const clientTg = getClientTelegram();
    let savedFileId = adminFileId;

    if (clientTg && ctx.from) {
      try {
        const fileLink = await ctx.telegram.getFileLink(adminFileId);
        const res = await fetch(fileLink);
        const buf = Buffer.from(await res.arrayBuffer());
        const sent = await clientTg.sendVideoNote(ctx.from.id, { source: buf });
        savedFileId = sent.video_note.file_id;
        // Clean up relay message silently
        try {
          await clientTg.deleteMessage(ctx.from.id, sent.message_id);
        } catch {}
      } catch (err) {
        logger.error(
          "Failed to re-upload video note via client bot, using admin file_id as fallback",
          { err },
        );
      }
    }

    setBotMessage("welcome_video_note_id", savedFileId);
    ctx.scene.state = {};
    await ctx.reply("✅ Кружок обновлён!");
    await showMenu(ctx);
    return;
  }
});
