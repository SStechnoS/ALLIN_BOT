"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminEmailScene = exports.SCENE_ADMIN_EMAIL = void 0;
const telegraf_1 = require("telegraf");
const db_1 = require("../db");
const resend_service_1 = require("../../services/resend.service");
const menu_handler_1 = require("../handlers/menu.handler");
const logger_1 = require("../../logger");
const config_1 = require("../../config");
exports.SCENE_ADMIN_EMAIL = "admin_email";
function s(ctx) {
    return ctx.scene.state;
}
const TARGET_LABELS = {
    all: "Все с email",
    unconfirmed: "Не подтвердили урок",
};
// ── Scene ─────────────────────────────────────────────────────────────────────
exports.adminEmailScene = new telegraf_1.Scenes.BaseScene(exports.SCENE_ADMIN_EMAIL);
// ── Confirm ───────────────────────────────────────────────────────────────────
exports.adminEmailScene.action("email_confirm", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    const state = s(ctx);
    const { target, subject, body } = state;
    if (!target || !subject || !body) {
        await ctx.reply("Ошибка: не хватает данных. Начните заново.");
        return ctx.scene.leave();
    }
    if (!config_1.config.resend.apiKey || !config_1.config.resend.from) {
        await ctx.reply("Email рассылка не настроена (проверьте RESEND_API_KEY и RESEND_FROM_EMAIL в .env).");
        return ctx.scene.leave();
    }
    const recipients = (0, db_1.getUserEmailsForBroadcast)(target);
    if (recipients.length === 0) {
        await ctx.reply("Нет получателей с email адресами.");
        await ctx.scene.leave();
        return (0, menu_handler_1.sendAdminMenu)(ctx);
    }
    await ctx.reply(`Отправляю ${recipients.length} писем...`);
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
        try {
            await (0, resend_service_1.sendEmail)({ to: r.email, subject, html: body });
            sent++;
        }
        catch (err) {
            logger_1.logger.error("Email send failed", { err, email: r.email });
            failed++;
        }
        // Small delay to avoid rate-limit bursts
        await new Promise((res) => setTimeout(res, 100));
    }
    await ctx.reply(`✅ Email рассылка завершена.\n\nОтправлено: <b>${sent}</b>\nОшибок: <b>${failed}</b>`, { parse_mode: "HTML" });
    await ctx.scene.leave();
    await (0, menu_handler_1.sendAdminMenu)(ctx);
});
// ── Cancel ────────────────────────────────────────────────────────────────────
exports.adminEmailScene.action("email_cancel", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.scene.leave();
    await (0, menu_handler_1.sendAdminMenu)(ctx, "❌ Email рассылка отменена.");
});
// ── /start escape ─────────────────────────────────────────────────────────────
exports.adminEmailScene.command("start", async (ctx) => {
    await ctx.scene.leave();
    await (0, menu_handler_1.sendAdminMenu)(ctx, "Главное меню:");
});
// ── Message handler ───────────────────────────────────────────────────────────
exports.adminEmailScene.on("message", async (ctx) => {
    const state = s(ctx);
    if (state.step === 1) {
        if (!("text" in ctx.message)) {
            await ctx.reply("Пожалуйста, введите тему письма текстом.");
            return;
        }
        ctx.scene.state = {
            ...state,
            step: 2,
            subject: ctx.message.text.trim(),
        };
        await ctx.reply("✏️ Введите тело письма.\n\nHTML поддерживается, например: <code>&lt;b&gt;жирный&lt;/b&gt;</code>, <code>&lt;a href=\"...\"&gt;ссылка&lt;/a&gt;</code>", { parse_mode: "HTML" });
        return;
    }
    if (state.step === 2) {
        if (!("text" in ctx.message)) {
            await ctx.reply("Пожалуйста, введите тело письма текстом.");
            return;
        }
        ctx.scene.state = {
            ...state,
            step: 3,
            body: ctx.message.text.trim(),
        };
        await showPreview(ctx);
        return;
    }
});
// ── Preview helper ────────────────────────────────────────────────────────────
async function showPreview(ctx) {
    const state = s(ctx);
    const recipients = (0, db_1.getUserEmailsForBroadcast)(state.target ?? "all");
    const targetLabel = TARGET_LABELS[state.target ?? "all"] ?? "—";
    const preview = `📧 <b>Предпросмотр email рассылки</b>\n\n` +
        `👥 <b>Аудитория:</b> ${targetLabel} (${recipients.length} адресов)\n` +
        `📌 <b>Тема:</b> ${state.subject}\n\n` +
        `<b>Тело письма:</b>\n<code>${state.body}</code>`;
    await ctx.reply(preview, {
        parse_mode: "HTML",
        ...telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("✅ Отправить", "email_confirm")],
            [telegraf_1.Markup.button.callback("✖ Отмена", "email_cancel")],
        ]),
    });
}
//# sourceMappingURL=email.scene.js.map