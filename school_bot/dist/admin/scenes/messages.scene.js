"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminMessagesScene = exports.SCENE_ADMIN_MESSAGES = void 0;
const telegraf_1 = require("telegraf");
const bot_messages_service_1 = require("../../services/bot-messages.service");
const menu_handler_1 = require("../handlers/menu.handler");
const telegram_1 = require("../../bot/telegram");
const logger_1 = require("../../logger");
exports.SCENE_ADMIN_MESSAGES = "admin_messages";
function s(ctx) {
    return ctx.scene.state;
}
// ── Scene ─────────────────────────────────────────────────────────────────────
exports.adminMessagesScene = new telegraf_1.Scenes.BaseScene(exports.SCENE_ADMIN_MESSAGES);
exports.adminMessagesScene.enter(async (ctx) => {
    ctx.scene.state = {};
    await showMenu(ctx);
});
// ── Menu ──────────────────────────────────────────────────────────────────────
async function showMenu(ctx) {
    await ctx.reply("📝 <b>Тексты бота</b>\n\nВыберите, что изменить:", {
        parse_mode: "HTML",
        ...telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("✏️ Текст приветствия", "msg_edit_welcome")],
            [telegraf_1.Markup.button.callback("🎬 Кружок (video note)", "msg_edit_video")],
            [telegraf_1.Markup.button.callback("↩️ Назад", "msg_back")],
        ]),
    });
}
// ── Actions ───────────────────────────────────────────────────────────────────
exports.adminMessagesScene.action("msg_edit_welcome", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.scene.state = { editing: "welcome_text" };
    const current = (0, bot_messages_service_1.getBotMessage)("welcome_text");
    await ctx.editMessageText(`✏️ <b>Текущий текст приветствия:</b>\n\n${current}\n\n<i>Отправьте новый текст:</i>`, {
        parse_mode: "HTML",
        ...telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("↩️ Отмена", "msg_cancel_edit")],
        ]),
    });
});
exports.adminMessagesScene.action("msg_edit_video", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.scene.state = { editing: "welcome_video_note_id" };
    const current = (0, bot_messages_service_1.getBotMessage)("welcome_video_note_id");
    await ctx.editMessageText(`🎬 <b>Кружок (video note)</b>\n` +
        `Текущий: ${current ? `установлен` : "не установлен"}\n\n` +
        `<i>Отправьте новое круглое видео:</i>`, {
        parse_mode: "HTML",
        ...telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("↩️ Отмена", "msg_cancel_edit")],
        ]),
    });
});
exports.adminMessagesScene.action("msg_cancel_edit", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.scene.state = {};
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await showMenu(ctx);
});
exports.adminMessagesScene.action("msg_back", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.scene.leave();
    await (0, menu_handler_1.sendAdminMenu)(ctx);
});
// ── Message handler ───────────────────────────────────────────────────────────
exports.adminMessagesScene.on("message", async (ctx) => {
    const state = s(ctx);
    if (!state.editing)
        return;
    if (state.editing === "welcome_text") {
        if (!("text" in ctx.message)) {
            await ctx.reply("Пожалуйста, отправьте текстовое сообщение.");
            return;
        }
        (0, bot_messages_service_1.setBotMessage)("welcome_text", ctx.message.text);
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
        const clientTg = (0, telegram_1.getClientTelegram)();
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
                }
                catch { }
            }
            catch (err) {
                logger_1.logger.error("Failed to re-upload video note via client bot, using admin file_id as fallback", { err });
            }
        }
        (0, bot_messages_service_1.setBotMessage)("welcome_video_note_id", savedFileId);
        ctx.scene.state = {};
        await ctx.reply("✅ Кружок обновлён!");
        await showMenu(ctx);
        return;
    }
});
//# sourceMappingURL=messages.scene.js.map