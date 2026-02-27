import { Scenes, Markup } from 'telegraf';
import type { AdminBotContext } from '../types';
import { getUsersForBroadcast } from '../db';
import { getClientTelegram } from '../../bot/telegram';
import { sendAdminMenu } from '../handlers/menu.handler';
import { logger } from '../../logger';

export const SCENE_ADMIN_BROADCAST = 'admin_broadcast';

interface BroadcastState {
  step: 0 | 1 | 2 | 3 | 4;
  // 0 = awaiting target
  // 1 = awaiting text
  // 2 = awaiting media (photo/video or skip)
  // 3 = awaiting button (Text|URL or skip)
  // 4 = awaiting confirm
  target?: 'all' | 'unconfirmed';
  text?: string;
  mediaFileId?: string;
  mediaType?: 'photo' | 'video';
  buttonText?: string;
  buttonUrl?: string;
}

function s(ctx: AdminBotContext): BroadcastState {
  return ctx.scene.state as BroadcastState;
}

const TARGET_LABELS: Record<string, string> = {
  all: 'Все клиенты',
  unconfirmed: 'Не подтвердили урок',
};

// ── Scene ────────────────────────────────────────────────────────────────────

export const broadcastScene = new Scenes.BaseScene<AdminBotContext>(SCENE_ADMIN_BROADCAST);

broadcastScene.enter(async (ctx) => {
  ctx.scene.state = { step: 0 } satisfies BroadcastState;
  await ctx.reply(
    '📢 <b>Рассылка</b>\n\nВыберите аудиторию:',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('👥 Все клиенты', 'bc_target_all')],
        [Markup.button.callback('❓ Не подтвердили урок', 'bc_target_unconfirmed')],
        [Markup.button.callback('✖ Отмена', 'bc_cancel')],
      ]),
    },
  );
});

// ── Target selection ─────────────────────────────────────────────────────────

broadcastScene.action('bc_target_all', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.state = { ...s(ctx), step: 1, target: 'all' };
  await ctx.editMessageText('✏️ Введите текст сообщения (поддерживается HTML):');
});

broadcastScene.action('bc_target_unconfirmed', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.state = { ...s(ctx), step: 1, target: 'unconfirmed' };
  await ctx.editMessageText('✏️ Введите текст сообщения (поддерживается HTML):');
});

// ── Confirm / cancel ─────────────────────────────────────────────────────────

broadcastScene.action('bc_confirm', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

  const state = s(ctx);
  if (!state.target || !state.text) {
    await ctx.reply('Ошибка: не хватает данных. Начните заново.');
    return ctx.scene.leave();
  }

  const recipients = getUsersForBroadcast(state.target);
  let sent = 0;
  let failed = 0;

  const inlineKeyboard = state.buttonText && state.buttonUrl
    ? [[{ text: state.buttonText, url: state.buttonUrl }]]
    : undefined;

  const clientTg = getClientTelegram() ?? ctx.telegram; // fallback to admin bot if client not ready

  for (const r of recipients) {
    try {
      if (state.mediaFileId) {
        if (state.mediaType === 'photo') {
          await clientTg.sendPhoto(r.telegram_id, state.mediaFileId);
        } else {
          await clientTg.sendVideo(r.telegram_id, state.mediaFileId);
        }
      }
      await clientTg.sendMessage(r.telegram_id, state.text, {
        parse_mode: 'HTML',
        ...(inlineKeyboard ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {}),
      });
      sent++;
    } catch {
      failed++;
    }
    // Small delay to avoid Telegram rate limits
    await new Promise((res) => setTimeout(res, 50));
  }

  await ctx.reply(
    `✅ Рассылка завершена.\n\nОтправлено: <b>${sent}</b>\nОшибок: <b>${failed}</b>`,
    { parse_mode: 'HTML' },
  );
  await ctx.scene.leave();
  await sendAdminMenu(ctx);
});

broadcastScene.action('bc_cancel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.scene.leave();
  await sendAdminMenu(ctx, '❌ Рассылка отменена.');
});

broadcastScene.action('bc_skip_media', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.state = { ...s(ctx), step: 3 };
  await ctx.editMessageText(
    'Добавьте кнопку-ссылку в формате:\n<code>Текст кнопки|https://...</code>\n\nИли нажмите «Пропустить»:',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('⏭ Пропустить', 'bc_skip_button')]]),
    },
  );
});

broadcastScene.action('bc_skip_button', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.state = { ...s(ctx), step: 4 };
  await showPreview(ctx);
});

// ── Message handler ───────────────────────────────────────────────────────────

broadcastScene.on('message', async (ctx) => {
  const state = s(ctx);

  // Step 1: receive text
  if (state.step === 1) {
    if (!('text' in ctx.message)) {
      await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
      return;
    }
    ctx.scene.state = { ...state, step: 2, text: ctx.message.text };
    await ctx.reply(
      'Отправьте фото или видео для прикрепления к сообщению, или пропустите:',
      Markup.inlineKeyboard([[Markup.button.callback('⏭ Пропустить', 'bc_skip_media')]]),
    );
    return;
  }

  // Step 2: receive media (photo or video)
  if (state.step === 2) {
    if ('photo' in ctx.message && ctx.message.photo.length > 0) {
      const fileId = ctx.message.photo.at(-1)!.file_id;
      ctx.scene.state = { ...state, step: 3, mediaFileId: fileId, mediaType: 'photo' };
    } else if ('video' in ctx.message) {
      const fileId = ctx.message.video.file_id;
      ctx.scene.state = { ...state, step: 3, mediaFileId: fileId, mediaType: 'video' };
    } else {
      await ctx.reply('Пожалуйста, отправьте фото или видео, или нажмите «Пропустить».',
        Markup.inlineKeyboard([[Markup.button.callback('⏭ Пропустить', 'bc_skip_media')]]),
      );
      return;
    }

    await ctx.reply(
      'Добавьте кнопку-ссылку в формате:\n<code>Текст кнопки|https://...</code>\n\nИли нажмите «Пропустить»:',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('⏭ Пропустить', 'bc_skip_button')]]),
      },
    );
    return;
  }

  // Step 3: receive button text|url
  if (state.step === 3) {
    if (!('text' in ctx.message)) {
      await ctx.reply('Отправьте текст в формате <code>Текст|URL</code> или нажмите «Пропустить».',
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⏭ Пропустить', 'bc_skip_button')]]) },
      );
      return;
    }
    const parts = ctx.message.text.split('|');
    if (parts.length < 2 || !parts[1]!.startsWith('http')) {
      await ctx.reply('Неверный формат. Используйте: <code>Текст кнопки|https://...</code>',
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⏭ Пропустить', 'bc_skip_button')]]) },
      );
      return;
    }
    ctx.scene.state = {
      ...state,
      step: 4,
      buttonText: parts[0]!.trim(),
      buttonUrl: parts.slice(1).join('|').trim(),
    };
    await showPreview(ctx);
    return;
  }
});

// ── Preview helper ────────────────────────────────────────────────────────────

async function showPreview(ctx: AdminBotContext): Promise<void> {
  const state = s(ctx);
  const target = TARGET_LABELS[state.target ?? 'all'] ?? state.target ?? '—';
  const recipients = getUsersForBroadcast(state.target ?? 'all');

  let preview = `📋 <b>Предпросмотр рассылки</b>\n\n`;
  preview += `👥 <b>Аудитория:</b> ${target} (${recipients.length} чел.)\n`;
  preview += `📎 <b>Медиа:</b> ${state.mediaType ?? 'нет'}\n`;
  preview += `🔗 <b>Кнопка:</b> ${state.buttonText ? `${state.buttonText} → ${state.buttonUrl}` : 'нет'}\n\n`;
  preview += `<b>Текст:</b>\n${state.text}`;

  await ctx.reply(preview, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ Отправить', 'bc_confirm')],
      [Markup.button.callback('✖ Отмена', 'bc_cancel')],
    ]),
  });
}
