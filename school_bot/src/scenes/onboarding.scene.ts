import { Scenes, Markup } from 'telegraf';
import type { BotContext } from '../types';
import { config } from '../config';
import { createOrGetUser, finalizeUser, updateUserSheetsRow } from '../services/user.service';
import { appendUserRow, syncUserRow } from '../services/sheets.service';
import { logger } from '../logger';

export const SCENE_ONBOARDING = 'onboarding';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Scene-local state stored in ctx.scene.state (persisted under __scenes in SQLite). */
interface OnboardingState {
  step: 0 | 1 | 2 | 3; // 0=consent, 1=waiting phone, 2=waiting email, 3=waiting name
  userId?: number;      // DB user id (set at scene enter)
  phone?: string;
  email?: string;
  sheetsRow?: number;   // Google Sheets 1-based row index
}

function s(ctx: BotContext): OnboardingState {
  return ctx.scene.state as OnboardingState;
}

// ────────────────────────────────────────────────────────────────────────────

export const onboardingScene = new Scenes.BaseScene<BotContext>(SCENE_ONBOARDING);

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
      logger.error('createOrGetUser failed on onboarding enter', { err });
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
          logger.error('Sheet sync failed on onboarding re-enter', { err });
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
            source: 'telegram_bot',
            status: 'new',
          });
          s(ctx).sheetsRow = sheetsRow;
          updateUserSheetsRow(user.id, sheetsRow);
        } catch (err) {
          logger.error('Failed to append sheet row on onboarding enter', { err });
        }
      }
    }
  }

  await ctx.reply(
    'Добро пожаловать!\n\n' +
      'Для записи на пробный урок нам необходимо сохранить ваши данные. ' +
      'Нажимая «Подтвердить», вы соглашаетесь с нашей политикой конфиденциальности.',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Подтвердить', 'onboarding_consent')],
      [Markup.button.url('📄 Политика конфиденциальности', config.privacyPolicyUrl)],
    ]),
  );
});

// Step 0 → 1: user accepted consent
onboardingScene.action('onboarding_consent', async (ctx) => {
  if (s(ctx).step !== 0) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  ctx.scene.state = { ...s(ctx), step: 1 };
  await ctx.reply(
    'Поделитесь своим номером телефона:',
    Markup.keyboard([[Markup.button.contactRequest('📱 Отправить номер телефона')]])
      .resize()
      .oneTime(),
  );
});

// Message handler: drives steps 1 → 2 → 3 → done
onboardingScene.on('message', async (ctx) => {
  const state = s(ctx);

  // Step 0: waiting for consent — remind user
  if (state.step === 0) {
    await ctx.reply('Нажмите «✅ Подтвердить» для продолжения.');
    return;
  }

  // Step 1: waiting for phone contact
  if (state.step === 1) {
    if (!('contact' in ctx.message)) {
      await ctx.reply('Пожалуйста, воспользуйтесь кнопкой для отправки номера.');
      return;
    }
    const phone = ctx.message.contact.phone_number;
    ctx.scene.state = { ...state, step: 2, phone };

    if (state.sheetsRow) {
      try { await syncUserRow(state.sheetsRow, { phone }); } catch (err) {
        logger.error('Sheet sync failed (phone)', { err });
      }
    }

    await ctx.reply('Введите вашу электронную почту:', Markup.removeKeyboard());
    return;
  }

  // Step 2: waiting for email
  if (state.step === 2) {
    if (!('text' in ctx.message)) return;
    const email = ctx.message.text.trim();
    if (!EMAIL_RE.test(email)) {
      await ctx.reply('Неверный формат. Введите корректный email:');
      return;
    }
    ctx.scene.state = { ...state, step: 3, email };

    if (state.sheetsRow) {
      try { await syncUserRow(state.sheetsRow, { email }); } catch (err) {
        logger.error('Sheet sync failed (email)', { err });
      }
    }

    await ctx.reply('Введите ваше имя:');
    return;
  }

  // Step 3: waiting for name → finalize user → sync sheet → enter booking
  if (state.step === 3) {
    if (!('text' in ctx.message) || !ctx.from) return;
    const name = ctx.message.text.trim();
    if (!name) {
      await ctx.reply('Пожалуйста, введите ваше имя:');
      return;
    }

    if (!state.userId) {
      await ctx.reply('Произошла ошибка. Попробуйте ещё раз.');
      return ctx.scene.reenter();
    }

    try {
      finalizeUser(state.userId, {
        phone: state.phone ?? null,
        email: state.email ?? null,
        name,
      });
    } catch (err) {
      logger.error('Failed to finalize user during onboarding', { err });
      await ctx.reply('Произошла ошибка. Попробуйте ещё раз.');
      return;
    }

    if (state.sheetsRow) {
      const now = Math.floor(Date.now() / 1000);
      try {
        await syncUserRow(state.sheetsRow, {
          name,
          gdprAccepted: true,
          gdprAcceptedAt: now,
          status: 'registered',
        });
      } catch (err) {
        logger.error('Sheet sync failed (name/gdpr)', { err });
      }
    }

    await ctx.reply('Отлично! Теперь выберем время для вашего пробного урока.');
    return ctx.scene.enter('booking');
  }
});
