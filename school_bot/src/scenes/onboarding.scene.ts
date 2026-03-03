import { Scenes, Markup } from "telegraf";
import type { BotContext } from "../types";
import { config } from "../config";
import { getBotMessage } from "../services/bot-messages.service";
import {
  createOrGetUser,
  finalizeUser,
  updateUserSheetsRow,
} from "../services/user.service";
import { appendUserRow, syncUserRow } from "../services/sheets.service";
import { scheduleNudges } from "../jobs/notifications";
import { logger } from "../logger";

export const SCENE_ONBOARDING = "onboarding";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Scene-local state stored in ctx.scene.state (persisted under __scenes in SQLite). */
interface OnboardingState {
  step: 0 | 1 | 2 | 3; // 0=consent, 1=waiting phone, 2=waiting email, 3=waiting name
  userId?: number; // DB user id (set at scene enter)
  phone?: string;
  email?: string;
  sheetsRow?: number; // Google Sheets 1-based row index
}

function s(ctx: BotContext): OnboardingState {
  return ctx.scene.state as OnboardingState;
}

// ────────────────────────────────────────────────────────────────────────────

export const onboardingScene = new Scenes.BaseScene<BotContext>(
  SCENE_ONBOARDING,
);

// Enter: create/get DB user immediately so we have a real userId from the start
onboardingScene.enter(async (ctx) => {
  ctx.scene.state = { step: 0 } satisfies OnboardingState;

  if (ctx.from) {
    const now = Math.floor(Date.now() / 1000);

    // Always create or refresh the minimal user record first
    let user;
    try {
      user = createOrGetUser(ctx.from.id, ctx.from.username ?? null);
      s(ctx).userId = user.id;
    } catch (err) {
      logger.error("createOrGetUser failed on onboarding enter", { err });
    }

    if (user) {
      if (user.sheets_row) {
        // Row already exists (re-entry) — store it and refresh tg data
        s(ctx).sheetsRow = user.sheets_row;
        try {
          await syncUserRow(user.sheets_row, {
            tgId: ctx.from.id,
            tgUsername: ctx.from.username ?? ctx.from.first_name,
            botActivated: true,
            botActivatedAt: now,
          });
        } catch (err) {
          logger.error("Sheet sync failed on onboarding re-enter", { err });
        }
      } else {
        // First time — append a new row with userId already filled in
        try {
          const sheetsRow = await appendUserRow({
            userId: user.id,
            tgId: ctx.from.id,
            tgUsername: ctx.from.username ?? ctx.from.first_name,
            botActivated: true,
            botActivatedAt: now,
            createdAt: now,
            source: "telegram_bot",
            status: "new",
          });
          s(ctx).sheetsRow = sheetsRow;
          updateUserSheetsRow(user.id, sheetsRow);
          scheduleNudges(ctx.from.id, now);
        } catch (err) {
          logger.error("Failed to append sheet row on onboarding enter", {
            err,
          });
        }
      }
    }
  }

  const welcomeText = getBotMessage("welcome_text");
  const videoNoteId = getBotMessage("welcome_video_note_id");

  // 1) Отдельно отправляем приветственное сообщение
  await ctx.reply(welcomeText);

  // 2) video note
  if (videoNoteId && ctx.chat) {
    try {
      await ctx.telegram.sendVideoNote(ctx.chat.id, videoNoteId);
    } catch (err) {
      logger.error("Failed to send welcome video note", { err });
    }
  }
  // 3) Отдельным сообщением — запрос на подтверждение политики
  await ctx.reply(
    "🔐 Для продолжения необходимо принять политику конфиденциальности.\n\nМы храним ваши данные безопасно и не передаём третьим лицам.",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Принимаю", "onboarding_consent"),
        Markup.button.url(
          "📄 Политика конфиденциальности",
          config.privacyPolicyUrl,
        ),
      ],
    ]),
  );
});

// Step 0 → 1: user accepted consent
onboardingScene.action("onboarding_consent", async (ctx) => {
  if (s(ctx).step !== 0) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  ctx.scene.state = { ...s(ctx), step: 1 };
  await ctx.reply(
    "🎉 Отлично, вы нас приняли!\n\n📱 Теперь поделитесь своим номером телефона — нажмите кнопку ниже:",
    Markup.keyboard([
      [Markup.button.contactRequest("📱 Отправить номер телефона")],
    ])
      .resize()
      .oneTime(),
  );
});

// /start while in onboarding — re-show welcome + re-prompt the last unanswered step.
// Registered before on('message') so it takes priority.
onboardingScene.command("start", async (ctx) => {
  const state = s(ctx);

  const welcomeText = getBotMessage("welcome_text");
  const videoNoteId = getBotMessage("welcome_video_note_id");

  if (videoNoteId && ctx.chat) {
    try {
      await ctx.telegram.sendVideoNote(ctx.chat.id, videoNoteId);
    } catch {}
  }

  if (state.step === 0) {
    // Ещё не подтвердили согласие — повторно отправляем welcome и отдельное сообщение с политикой
    await ctx.reply(welcomeText);
    await ctx.reply(
      "🔐 Для продолжения необходимо принять политику конфиденциальности.\n\nМы храним ваши данные безопасно и не передаём третьим лицам.",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Принимаю", "onboarding_consent"),
          Markup.button.url(
            "📄 Политика конфиденциальности",
            config.privacyPolicyUrl,
          ),
        ],
      ]),
    );
  } else {
    // Уже после согласия — просто повторно отправляем welcome и подсказываем текущий шаг
    await ctx.reply(welcomeText);
    if (state.step === 1) {
      await ctx.reply(
        "📱 Поделитесь своим номером телефона — нажмите кнопку ниже:",
        Markup.keyboard([
          [Markup.button.contactRequest("📱 Отправить номер телефона")],
        ])
          .resize()
          .oneTime(),
      );
    } else if (state.step === 2) {
      await ctx.reply(
        "📧 Введите вашу электронную почту:",
        Markup.removeKeyboard(),
      );
    } else if (state.step === 3) {
      await ctx.reply("✍️ Введите ваше имя:");
    }
  }
});

// Message handler: drives steps 1 → 2 → 3 → done
onboardingScene.on("message", async (ctx) => {
  const state = s(ctx);

  // Step 0: waiting for consent — remind user
  if (state.step === 0) {
    await ctx.reply("👆 Нажмите кнопку «✅ Принимаю» выше, чтобы продолжить.");
    return;
  }

  // Step 1: waiting for phone contact
  if (state.step === 1) {
    if (!("contact" in ctx.message)) {
      await ctx.reply(
        "📱 Используйте кнопку ниже, чтобы поделиться номером телефона.",
      );
      return;
    }
    const phone = ctx.message.contact.phone_number;
    ctx.scene.state = { ...state, step: 2, phone };

    if (state.sheetsRow) {
      try {
        await syncUserRow(state.sheetsRow, { phone });
      } catch (err) {
        logger.error("Sheet sync failed (phone)", { err });
      }
    }

    await ctx.reply("📧 Отлично! Теперь введите вашу электронную почту:", Markup.removeKeyboard());
    return;
  }

  // Step 2: waiting for email
  if (state.step === 2) {
    if (!("text" in ctx.message)) return;
    const email = ctx.message.text.trim();
    if (!EMAIL_RE.test(email)) {
      await ctx.reply("❌ Неверный формат email. Попробуйте ещё раз:\n\nПример: <code>name@example.com</code>", { parse_mode: "HTML" });
      return;
    }
    ctx.scene.state = { ...state, step: 3, email };

    if (state.sheetsRow) {
      try {
        await syncUserRow(state.sheetsRow, { email });
      } catch (err) {
        logger.error("Sheet sync failed (email)", { err });
      }
    }

    await ctx.reply("✍️ Почти готово! Введите ваше имя:");
    return;
  }

  // Step 3: waiting for name → finalize user → sync sheet → enter booking
  if (state.step === 3) {
    if (!("text" in ctx.message) || !ctx.from) return;
    const name = ctx.message.text.trim();
    if (!name) {
      await ctx.reply("✍️ Пожалуйста, введите ваше имя:");
      return;
    }

    if (!state.userId) {
      await ctx.reply("⚠️ Что-то пошло не так. Попробуйте ещё раз.");
      return ctx.scene.reenter();
    }

    try {
      finalizeUser(state.userId, {
        phone: state.phone ?? null,
        email: state.email ?? null,
        name,
      });
    } catch (err) {
      logger.error("Failed to finalize user during onboarding", { err });
      await ctx.reply("⚠️ Произошла ошибка. Попробуйте ещё раз.");
      return;
    }

    if (state.sheetsRow) {
      const now = Math.floor(Date.now() / 1000);
      try {
        await syncUserRow(state.sheetsRow, {
          name,
          gdprAccepted: true,
          gdprAcceptedAt: now,
          status: "registered",
        });
      } catch (err) {
        logger.error("Sheet sync failed (name/gdpr)", { err });
      }
    }

    await ctx.reply(`🎯 Отлично, ${name}! Все данные сохранены.\n\nТеперь выберем удобное время для вашего <b>пробного пробного урока</b> 📅`, { parse_mode: "HTML" });
    return ctx.scene.enter("booking");
  }
});
