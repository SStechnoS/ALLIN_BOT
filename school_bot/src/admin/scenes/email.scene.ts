import { Scenes, Markup } from "telegraf";
import type { AdminBotContext } from "../types";
import { getUserEmailsForBroadcast } from "../db";
import { sendEmail } from "../../services/resend.service";
import { sendAdminMenu } from "../handlers/menu.handler";
import { logger } from "../../logger";
import { config } from "../../config";

export const SCENE_ADMIN_EMAIL = "admin_email";

interface EmailState {
  step: 1 | 2 | 3;
  // 1 = awaiting subject
  // 2 = awaiting body
  // 3 = preview / confirm
  target?: "all" | "unconfirmed";
  subject?: string;
  body?: string;
}

function s(ctx: AdminBotContext): EmailState {
  return ctx.scene.state as EmailState;
}

const TARGET_LABELS: Record<string, string> = {
  all: "Все с email",
  unconfirmed: "Не подтвердили урок",
};

// ── Scene ─────────────────────────────────────────────────────────────────────

export const adminEmailScene = new Scenes.BaseScene<AdminBotContext>(
  SCENE_ADMIN_EMAIL,
);

// ── Confirm ───────────────────────────────────────────────────────────────────

adminEmailScene.action("email_confirm", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

  const state = s(ctx);
  const { target, subject, body } = state;

  if (!target || !subject || !body) {
    await ctx.reply("Ошибка: не хватает данных. Начните заново.");
    return ctx.scene.leave();
  }

  if (!config.resend.apiKey || !config.resend.from) {
    await ctx.reply(
      "Email рассылка не настроена (проверьте RESEND_API_KEY и RESEND_FROM_EMAIL в .env).",
    );
    return ctx.scene.leave();
  }

  const recipients = getUserEmailsForBroadcast(target);

  if (recipients.length === 0) {
    await ctx.reply("Нет получателей с email адресами.");
    await ctx.scene.leave();
    return sendAdminMenu(ctx);
  }

  await ctx.reply(`Отправляю ${recipients.length} писем...`);

  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    try {
      await sendEmail({ to: r.email, subject, html: body });
      sent++;
    } catch (err) {
      logger.error("Email send failed", { err, email: r.email });
      failed++;
    }
    // Small delay to avoid rate-limit bursts
    await new Promise((res) => setTimeout(res, 100));
  }

  await ctx.reply(
    `✅ Email рассылка завершена.\n\nОтправлено: <b>${sent}</b>\nОшибок: <b>${failed}</b>`,
    { parse_mode: "HTML" },
  );
  await ctx.scene.leave();
  await sendAdminMenu(ctx);
});

// ── Cancel ────────────────────────────────────────────────────────────────────

adminEmailScene.action("email_cancel", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.scene.leave();
  await sendAdminMenu(ctx, "❌ Email рассылка отменена.");
});

// ── /start escape ─────────────────────────────────────────────────────────────

adminEmailScene.command("start", async (ctx) => {
  await ctx.scene.leave();
  await sendAdminMenu(ctx, "Главное меню:");
});

// ── Message handler ───────────────────────────────────────────────────────────

adminEmailScene.on("message", async (ctx) => {
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
    await ctx.reply(
      "✏️ Введите тело письма.\n\nHTML поддерживается, например: <code>&lt;b&gt;жирный&lt;/b&gt;</code>, <code>&lt;a href=\"...\"&gt;ссылка&lt;/a&gt;</code>",
      { parse_mode: "HTML" },
    );
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

async function showPreview(ctx: AdminBotContext): Promise<void> {
  const state = s(ctx);
  const recipients = getUserEmailsForBroadcast(state.target ?? "all");
  const targetLabel = TARGET_LABELS[state.target ?? "all"] ?? "—";

  const preview =
    `📧 <b>Предпросмотр email рассылки</b>\n\n` +
    `👥 <b>Аудитория:</b> ${targetLabel} (${recipients.length} адресов)\n` +
    `📌 <b>Тема:</b> ${state.subject}\n\n` +
    `<b>Тело письма:</b>\n<code>${state.body}</code>`;

  await ctx.reply(preview, {
    parse_mode: "HTML",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("✅ Отправить", "email_confirm")],
      [Markup.button.callback("✖ Отмена", "email_cancel")],
    ]),
  });
}
