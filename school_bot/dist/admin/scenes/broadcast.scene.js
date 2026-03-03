"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastScene = exports.SCENE_ADMIN_BROADCAST = void 0;
const telegraf_1 = require("telegraf");
const db_1 = require("../db");
const telegram_1 = require("../../bot/telegram");
const menu_handler_1 = require("../handlers/menu.handler");
const logger_1 = require("../../logger");
exports.SCENE_ADMIN_BROADCAST = "admin_broadcast";
function s(ctx) {
    return ctx.scene.state;
}
const TARGET_LABELS = {
    all: "Все клиенты",
    unconfirmed: "Не подтвердили урок",
};
const CAPTION_LIMIT = 1024;
// ── Scene ────────────────────────────────────────────────────────────────────
exports.broadcastScene = new telegraf_1.Scenes.BaseScene(exports.SCENE_ADMIN_BROADCAST);
// ── Skip actions ─────────────────────────────────────────────────────────────
exports.broadcastScene.action("bc_skip_media", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    ctx.scene.state = { ...s(ctx), step: 3 };
    await ctx.reply("🔗 Введите текст кнопки-ссылки (будет показана под сообщением):\n\nИли нажмите «Пропустить»:", telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback("⏭ Пропустить", "bc_skip_button")],
    ]));
});
// Clears any partial button state and jumps to preview
exports.broadcastScene.action("bc_skip_button", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    ctx.scene.state = {
        ...s(ctx),
        step: 5,
        buttonText: undefined,
        buttonUrl: undefined,
    };
    await showPreview(ctx);
});
// ── Confirm / cancel ─────────────────────────────────────────────────────────
exports.broadcastScene.action("bc_confirm", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    const state = s(ctx);
    const { target, buttonText, buttonUrl } = state;
    const text = state.text;
    let mediaFileId = state.mediaFileId;
    const mediaType = state.mediaType;
    if (!target || !text) {
        await ctx.reply("Ошибка: не хватает данных. Начните заново.");
        return ctx.scene.leave();
    }
    const clientTg = (0, telegram_1.getClientTelegram)();
    // Admin bot file_ids are bot-specific and can't be used by client bot.
    // Re-upload the file via client bot once to get a valid file_id.
    if (mediaFileId && mediaType && ctx.from) {
        if (clientTg) {
            try {
                const fileLink = await ctx.telegram.getFileLink(mediaFileId);
                const res = await fetch(fileLink);
                const buf = Buffer.from(await res.arrayBuffer());
                let relayMsgId;
                if (mediaType === "photo") {
                    const sent = await clientTg.sendPhoto(ctx.from.id, { source: buf });
                    mediaFileId = sent.photo.at(-1).file_id;
                    relayMsgId = sent.message_id;
                }
                else if (mediaType === "video") {
                    const sent = await clientTg.sendVideo(ctx.from.id, { source: buf });
                    mediaFileId = sent.video.file_id;
                    relayMsgId = sent.message_id;
                }
                else if (mediaType === "video_note") {
                    const sent = await clientTg.sendVideoNote(ctx.from.id, {
                        source: buf,
                    });
                    mediaFileId = sent.video_note.file_id;
                    relayMsgId = sent.message_id;
                }
                else if (mediaType === "animation") {
                    const sent = await clientTg.sendAnimation(ctx.from.id, {
                        source: buf,
                    });
                    mediaFileId = sent.animation.file_id;
                    relayMsgId = sent.message_id;
                }
                else if (mediaType === "document") {
                    const sent = await clientTg.sendDocument(ctx.from.id, {
                        source: buf,
                    });
                    mediaFileId = sent.document.file_id;
                    relayMsgId = sent.message_id;
                }
                if (relayMsgId !== undefined) {
                    try {
                        await clientTg.deleteMessage(ctx.from.id, relayMsgId);
                    }
                    catch { }
                }
            }
            catch (err) {
                logger_1.logger.error("Failed to re-upload broadcast media", { err });
                await ctx.reply("⚠️ Не удалось загрузить медиа через клиентский бот. Рассылка будет без медиа.");
                mediaFileId = undefined;
            }
        }
        else {
            await ctx.reply("⚠️ Клиентский бот не инициализирован. Медиа не будет отправлено.");
            mediaFileId = undefined;
        }
    }
    const recipients = (0, db_1.getUsersForBroadcast)(target);
    let sent = 0;
    let failed = 0;
    const replyMarkup = buttonText && buttonUrl
        ? { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] }
        : undefined;
    const sendTg = clientTg ?? ctx.telegram;
    const textFitsCaption = text.length <= CAPTION_LIMIT;
    for (const r of recipients) {
        try {
            if (mediaFileId) {
                const extra = {
                    caption: text,
                    parse_mode: "HTML",
                    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
                };
                const extraNoCaption = replyMarkup
                    ? { reply_markup: replyMarkup }
                    : undefined;
                if ((mediaType === "photo" ||
                    mediaType === "video" ||
                    mediaType === "animation" ||
                    mediaType === "document") &&
                    textFitsCaption) {
                    // Send media with caption + button in one message
                    if (mediaType === "photo") {
                        await sendTg.sendPhoto(r.telegram_id, mediaFileId, extra);
                    }
                    else if (mediaType === "video") {
                        await sendTg.sendVideo(r.telegram_id, mediaFileId, extra);
                    }
                    else if (mediaType === "animation") {
                        await sendTg.sendAnimation(r.telegram_id, mediaFileId, extra);
                    }
                    else {
                        await sendTg.sendDocument(r.telegram_id, mediaFileId, extra);
                    }
                }
                else {
                    // video_note or long text: send media first, then text with button
                    if (mediaType === "photo") {
                        await sendTg.sendPhoto(r.telegram_id, mediaFileId);
                    }
                    else if (mediaType === "video") {
                        await sendTg.sendVideo(r.telegram_id, mediaFileId);
                    }
                    else if (mediaType === "video_note") {
                        await sendTg.sendVideoNote(r.telegram_id, mediaFileId);
                    }
                    else if (mediaType === "animation") {
                        await sendTg.sendAnimation(r.telegram_id, mediaFileId);
                    }
                    else if (mediaType === "document") {
                        await sendTg.sendDocument(r.telegram_id, mediaFileId);
                    }
                    await sendTg.sendMessage(r.telegram_id, text, {
                        parse_mode: "HTML",
                        ...(extraNoCaption ?? {}),
                    });
                }
            }
            else {
                await sendTg.sendMessage(r.telegram_id, text, {
                    parse_mode: "HTML",
                    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
                });
            }
            sent++;
        }
        catch (err) {
            logger_1.logger.error("Broadcast send failed", {
                err,
                telegram_id: r.telegram_id,
            });
            failed++;
        }
        await new Promise((res) => setTimeout(res, 50));
    }
    await ctx.reply(`✅ Рассылка завершена.\n\nОтправлено: <b>${sent}</b>\nОшибок: <b>${failed}</b>`, { parse_mode: "HTML" });
    await ctx.scene.leave();
    await (0, menu_handler_1.sendAdminMenu)(ctx);
});
exports.broadcastScene.action("bc_cancel", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.scene.leave();
    await (0, menu_handler_1.sendAdminMenu)(ctx, "❌ Рассылка отменена.");
});
// ── /start inside broadcast scene ────────────────────────────────────────────
exports.broadcastScene.command("start", async (ctx) => {
    // Из любого шага рассылки /start должен "спасать":
    // выходим из сцены и показываем главное админ‑меню.
    await ctx.scene.leave();
    await (0, menu_handler_1.sendAdminMenu)(ctx, "Главное меню:");
});
// ── Message handler ───────────────────────────────────────────────────────────
exports.broadcastScene.on("message", async (ctx) => {
    const state = s(ctx);
    // Step 1: receive text
    if (state.step === 1) {
        if (!("text" in ctx.message)) {
            await ctx.reply("Пожалуйста, отправьте текстовое сообщение.");
            return;
        }
        ctx.scene.state = { ...state, step: 2, text: ctx.message.text };
        await ctx.reply("Отправьте фото, видео, GIF или кружок для прикрепления,\nили нажмите «Пропустить»:", telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("⏭ Пропустить", "bc_skip_media")],
        ]));
        return;
    }
    // Step 2: receive media
    if (state.step === 2) {
        if ("photo" in ctx.message && ctx.message.photo.length > 0) {
            const fileId = ctx.message.photo.at(-1).file_id;
            ctx.scene.state = {
                ...state,
                step: 3,
                mediaFileId: fileId,
                mediaType: "photo",
            };
        }
        else if ("video_note" in ctx.message) {
            const fileId = ctx.message.video_note.file_id;
            ctx.scene.state = {
                ...state,
                step: 3,
                mediaFileId: fileId,
                mediaType: "video_note",
            };
        }
        else if ("video" in ctx.message) {
            const fileId = ctx.message.video.file_id;
            ctx.scene.state = {
                ...state,
                step: 3,
                mediaFileId: fileId,
                mediaType: "video",
            };
        }
        else if ("animation" in ctx.message) {
            // GIF — check before document because animation messages also carry a document field
            const fileId = ctx.message.animation.file_id;
            ctx.scene.state = {
                ...state,
                step: 3,
                mediaFileId: fileId,
                mediaType: "animation",
            };
        }
        else if ("document" in ctx.message) {
            const fileId = ctx.message.document.file_id;
            ctx.scene.state = {
                ...state,
                step: 3,
                mediaFileId: fileId,
                mediaType: "document",
            };
        }
        else {
            await ctx.reply("Пожалуйста, отправьте фото, видео, GIF или кружок,\nили нажмите «Пропустить».", telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback("⏭ Пропустить", "bc_skip_media")],
            ]));
            return;
        }
        await ctx.reply("🔗 Введите текст кнопки-ссылки (будет показана под сообщением):\n\nИли нажмите «Пропустить»:", telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("⏭ Пропустить", "bc_skip_button")],
        ]));
        return;
    }
    // Step 3: receive button text
    if (state.step === 3) {
        if (!("text" in ctx.message)) {
            await ctx.reply("Пожалуйста, отправьте текст кнопки или нажмите «Пропустить».", telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback("⏭ Пропустить", "bc_skip_button")],
            ]));
            return;
        }
        ctx.scene.state = {
            ...state,
            step: 4,
            buttonText: ctx.message.text.trim(),
        };
        await ctx.reply("🔗 Введите URL кнопки (https://...):", telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("⏭ Отмена кнопки", "bc_skip_button")],
        ]));
        return;
    }
    // Step 4: receive button URL
    if (state.step === 4) {
        if (!("text" in ctx.message)) {
            await ctx.reply("Пожалуйста, введите URL (начинается с https://):");
            return;
        }
        const url = ctx.message.text.trim();
        if (!url.startsWith("http")) {
            await ctx.reply("Неверный URL. Введите ссылку, начинающуюся с https://:");
            return;
        }
        ctx.scene.state = { ...state, step: 5, buttonUrl: url };
        await showPreview(ctx);
        return;
    }
});
// ── Preview helper ────────────────────────────────────────────────────────────
async function showPreview(ctx) {
    const state = s(ctx);
    const target = TARGET_LABELS[state.target ?? "all"] ?? state.target ?? "—";
    const recipients = (0, db_1.getUsersForBroadcast)(state.target ?? "all");
    // Show actual media so admin can verify it looks correct
    if (state.mediaFileId && state.mediaType) {
        try {
            if (state.mediaType === "photo") {
                await ctx.replyWithPhoto(state.mediaFileId);
            }
            else if (state.mediaType === "video") {
                await ctx.replyWithVideo(state.mediaFileId);
            }
            else if (state.mediaType === "video_note") {
                await ctx.replyWithVideoNote(state.mediaFileId);
            }
            else if (state.mediaType === "animation") {
                await ctx.replyWithAnimation(state.mediaFileId);
            }
            else if (state.mediaType === "document") {
                await ctx.replyWithDocument(state.mediaFileId);
            }
        }
        catch (err) {
            logger_1.logger.error("Failed to send media preview", { err });
        }
    }
    const mediaLabel = mediaTypeLabel(state.mediaType);
    let preview = `📋 <b>Предпросмотр рассылки</b>\n\n`;
    preview += `👥 <b>Аудитория:</b> ${target} (${recipients.length} чел.)\n`;
    preview += `📎 <b>Медиа:</b> ${mediaLabel}\n`;
    preview += `🔗 <b>Кнопка:</b> ${state.buttonText ? `${state.buttonText} → ${state.buttonUrl}` : "нет"}\n\n`;
    preview += `<b>Текст:</b>\n${state.text}`;
    await ctx.reply(preview, {
        parse_mode: "HTML",
        ...telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("✅ Отправить", "bc_confirm")],
            [telegraf_1.Markup.button.callback("✖ Отмена", "bc_cancel")],
        ]),
    });
}
function mediaTypeLabel(type) {
    switch (type) {
        case "photo":
            return "📷 Фото";
        case "video":
            return "🎬 Видео";
        case "video_note":
            return "⭕ Кружок";
        case "animation":
            return "🎞 GIF";
        case "document":
            return "📄 Файл";
        default:
            return "нет";
    }
}
//# sourceMappingURL=broadcast.scene.js.map