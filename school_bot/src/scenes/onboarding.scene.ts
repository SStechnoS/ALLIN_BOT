import { Scenes, Markup } from 'telegraf';
import type { BotContext } from '../types';
import { config } from '../config';
import { createUser } from '../services/user.service';
import { logger } from '../logger';

export const SCENE_ONBOARDING = 'onboarding';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Scene-local state stored in ctx.scene.state (persisted under __scenes in SQLite). */
interface OnboardingState {
  step: 0 | 1 | 2 | 3; // 0=consent, 1=waiting phone, 2=waiting email, 3=waiting name
  phone?: string;
  email?: string;
}

function s(ctx: BotContext): OnboardingState {
  return ctx.scene.state as OnboardingState;
}

// ────────────────────────────────────────────────────────────────────────────

export const onboardingScene = new Scenes.BaseScene<BotContext>(SCENE_ONBOARDING);

// Enter: show consent message, set step=0
onboardingScene.enter(async (ctx) => {
  ctx.scene.state = { step: 0 } satisfies OnboardingState;
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
  ctx.scene.state = { step: 1 } satisfies OnboardingState;
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
    ctx.scene.state = { step: 2, phone: ctx.message.contact.phone_number };
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
    ctx.scene.state = { step: 3, phone: state.phone, email };
    await ctx.reply('Введите ваше имя:');
    return;
  }

  // Step 3: waiting for name → save user → enter booking
  if (state.step === 3) {
    if (!('text' in ctx.message) || !ctx.from) return;
    const name = ctx.message.text.trim();
    if (!name) {
      await ctx.reply('Пожалуйста, введите ваше имя:');
      return;
    }

    try {
      createUser({
        telegramId: ctx.from.id,
        telegramName: ctx.from.username ?? null,
        phone: state.phone ?? null,
        email: state.email ?? null,
        name,
      });
    } catch (err) {
      logger.error('Failed to create user during onboarding', { err });
      await ctx.reply('Произошла ошибка. Попробуйте ещё раз.');
      return;
    }

    await ctx.reply('Отлично! Теперь выберем время для вашего пробного урока.');
    return ctx.scene.enter('booking');
  }
});
