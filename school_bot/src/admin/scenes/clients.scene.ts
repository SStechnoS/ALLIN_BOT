import { Scenes, Markup } from 'telegraf';
import type { AdminBotContext } from '../types';
import { getRegisteredUserCount, getUserAtOffset, setAttended } from '../db';
import { sendAdminMenu } from '../handlers/menu.handler';
import { formatDay, formatTime } from '../../utils/format';
import { logger } from '../../logger';

export const SCENE_ADMIN_CLIENTS = 'admin_clients';

interface ClientsState {
  page: number;
  total: number;
}

function s(ctx: AdminBotContext): ClientsState {
  return ctx.scene.state as ClientsState;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export const adminClientsScene = new Scenes.BaseScene<AdminBotContext>(SCENE_ADMIN_CLIENTS);

adminClientsScene.enter(async (ctx) => {
  const total = getRegisteredUserCount();
  ctx.scene.state = { page: 0, total } satisfies ClientsState;

  if (total === 0) {
    await ctx.reply('Зарегистрированных клиентов пока нет.');
    await ctx.scene.leave();
    await sendAdminMenu(ctx);
    return;
  }

  await showClient(ctx);
});

// ── Navigation ────────────────────────────────────────────────────────────────

adminClientsScene.action('cl_prev', async (ctx) => {
  await ctx.answerCbQuery();
  const state = s(ctx);
  if (state.page <= 0) return;
  ctx.scene.state = { ...state, page: state.page - 1 };
  await showClient(ctx);
});

adminClientsScene.action('cl_next', async (ctx) => {
  await ctx.answerCbQuery();
  const state = s(ctx);
  if (state.page >= state.total - 1) return;
  ctx.scene.state = { ...state, page: state.page + 1 };
  await showClient(ctx);
});

// ── Attendance ────────────────────────────────────────────────────────────────

adminClientsScene.action('cl_attended', async (ctx) => {
  await ctx.answerCbQuery('✅ Отмечено: пришёл');
  const state = s(ctx);
  const user = getUserAtOffset(state.page);
  if (!user?.booking_id) return;
  try {
    setAttended(user.booking_id, true);
  } catch (err) {
    logger.error('setAttended failed', { err });
  }
  await showClient(ctx);
});

adminClientsScene.action('cl_not_attended', async (ctx) => {
  await ctx.answerCbQuery('❌ Отмечено: не пришёл');
  const state = s(ctx);
  const user = getUserAtOffset(state.page);
  if (!user?.booking_id) return;
  try {
    setAttended(user.booking_id, false);
  } catch (err) {
    logger.error('setAttended failed', { err });
  }
  await showClient(ctx);
});

// ── Back ──────────────────────────────────────────────────────────────────────

adminClientsScene.action('cl_back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.scene.leave();
  await sendAdminMenu(ctx);
});

// ── Show helper ───────────────────────────────────────────────────────────────

async function showClient(ctx: AdminBotContext): Promise<void> {
  const state = s(ctx);
  const user = getUserAtOffset(state.page);

  if (!user) {
    await ctx.scene.leave();
    await sendAdminMenu(ctx, 'Клиент не найден.');
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const tg = user.telegram_name ? `@${user.telegram_name}` : `ID: ${user.telegram_id}`;

  let text =
    `👤 <b>${user.name}</b>  <i>(${state.page + 1} / ${state.total})</i>\n\n` +
    `📞 ${user.phone ?? '—'}\n` +
    `📧 ${user.email ?? '—'}\n` +
    `💬 ${tg}\n`;

  const hasPastBooking =
    user.booking_id !== null &&
    user.event_start !== null &&
    user.event_start < now;

  if (user.event_start) {
    const start = new Date(user.event_start * 1000);
    const isPast = user.event_start < now;
    text += `\n📅 ${formatDay(start)}, ${formatTime(start)}`;
    if (isPast) {
      const statusLabel =
        user.attended === 1
          ? '✅ Пришёл'
          : user.attended === 0
            ? '❌ Не пришёл'
            : '❓ Статус не указан';
      text += `\n${statusLabel}`;
    } else {
      text += ` ⏳ предстоящий`;
      text += user.lesson_confirmed_at ? '\n✅ Подтверждён' : '\n❓ Не подтверждён';
    }
  } else {
    text += '\n📅 Записи нет';
  }

  // Build inline keyboard
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];

  if (hasPastBooking) {
    rows.push([
      Markup.button.callback(
        user.attended === 1 ? '✅ Пришёл ✓' : '✅ Пришёл',
        'cl_attended',
      ),
      Markup.button.callback(
        user.attended === 0 ? '❌ Не пришёл ✓' : '❌ Не пришёл',
        'cl_not_attended',
      ),
    ]);
  }

  const navRow: ReturnType<typeof Markup.button.callback>[] = [];
  if (state.page > 0) navRow.push(Markup.button.callback('← Назад', 'cl_prev'));
  navRow.push(Markup.button.callback('↩️ Меню', 'cl_back'));
  if (state.page < state.total - 1) navRow.push(Markup.button.callback('Вперёд →', 'cl_next'));
  rows.push(navRow);

  const keyboard = { inline_keyboard: rows };

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}
