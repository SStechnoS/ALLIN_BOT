import { Markup, type Telegraf } from 'telegraf';
import type { AdminBotContext } from '../types';
import {
  getAdminByTelegramId,
  getStatsByPeriod,
  getUpcomingSchedule,
  type PeriodStats,
} from '../db';
import { SCENE_ADMIN_BROADCAST } from '../scenes/broadcast.scene';
import { SCENE_ADMIN_SEARCH } from '../scenes/search.scene';
import { SCENE_ADMIN_CLIENTS } from '../scenes/clients.scene';
import { SCENE_ADMIN_MESSAGES } from '../scenes/messages.scene';
import { formatDay, formatTime } from '../../utils/format';
import { logger } from '../../logger';

export const ADMIN_BTN_STATS = '📊 Статистика';
export const ADMIN_BTN_SCHEDULE = '📅 Расписание';
export const ADMIN_BTN_CLIENTS = '👥 Клиенты';
export const ADMIN_BTN_SEARCH = '🔍 Найти клиента';
export const ADMIN_BTN_BROADCAST = '📢 Рассылка';
export const ADMIN_BTN_MESSAGES = '📝 Тексты бота';

export async function sendAdminMenu(ctx: AdminBotContext, text = 'Главное меню:'): Promise<void> {
  await ctx.reply(
    text,
    Markup.keyboard([
      [ADMIN_BTN_STATS, ADMIN_BTN_SCHEDULE],
      [ADMIN_BTN_CLIENTS, ADMIN_BTN_SEARCH],
      [ADMIN_BTN_BROADCAST, ADMIN_BTN_MESSAGES],
    ]).resize(),
  );
}

function isAdmin(ctx: AdminBotContext): boolean {
  return !!(ctx.from && getAdminByTelegramId(ctx.from.id));
}

// ── Period helpers ────────────────────────────────────────────────────────────

type PeriodKey = '7d' | 'month' | 'prev_month' | 'all';

function getPeriodBounds(key: PeriodKey): { since?: number; until?: number; label: string } {
  const now = Math.floor(Date.now() / 1000);
  switch (key) {
    case '7d':
      return { since: now - 7 * 86400, label: 'за 7 дней' };
    case 'month': {
      const d = new Date();
      return {
        since: Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000),
        label: 'за этот месяц',
      };
    }
    case 'prev_month': {
      const d = new Date();
      const until = Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000) - 1;
      const since = Math.floor(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime() / 1000);
      return { since, until, label: 'за прошлый месяц' };
    }
    default:
      return { since: undefined, label: 'за всё время' };
  }
}

function formatStats(stats: PeriodStats, label: string): string {
  return (
    `📊 <b>Статистика ${label}</b>\n\n` +
    `👤 Новых клиентов: <b>${stats.new_users}</b>\n` +
    `📅 Новых записей: <b>${stats.new_bookings}</b>\n` +
    `🎯 Пришли на урок: <b>${stats.attended}</b>\n` +
    `❌ Не пришли: <b>${stats.not_attended}</b>\n\n` +
    `⏳ Предстоящих уроков: <b>${stats.upcoming}</b>`
  );
}

function statsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('7 дней', 'stats_7d'),
      Markup.button.callback('Этот месяц', 'stats_month'),
    ],
    [
      Markup.button.callback('Прошлый месяц', 'stats_prev_month'),
      Markup.button.callback('Всё время', 'stats_all'),
    ],
  ]);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export function registerAdminMenuHandlers(bot: Telegraf<AdminBotContext>): void {
  // ── Stats ──────────────────────────────────────────────────────────────────

  bot.hears(ADMIN_BTN_STATS, async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
      const { since, until, label } = getPeriodBounds('all');
      const stats = getStatsByPeriod(since, until);
      await ctx.reply(formatStats(stats, label), {
        parse_mode: 'HTML',
        ...statsKeyboard(),
      });
    } catch (err) {
      logger.error('Admin stats failed', { err });
      await ctx.reply('Ошибка при загрузке статистики.');
    }
  });

  // Period switch callbacks
  const PERIOD_KEYS: PeriodKey[] = ['7d', 'month', 'prev_month', 'all'];
  for (const key of PERIOD_KEYS) {
    bot.action(`stats_${key}`, async (ctx) => {
      if (!isAdmin(ctx)) return ctx.answerCbQuery();
      await ctx.answerCbQuery();
      try {
        const { since, until, label } = getPeriodBounds(key);
        const stats = getStatsByPeriod(since, until);
        await ctx.editMessageText(formatStats(stats, label), {
          parse_mode: 'HTML',
          ...statsKeyboard(),
        });
      } catch (err) {
        logger.error('Admin stats period switch failed', { err });
      }
    });
  }

  // ── Schedule ───────────────────────────────────────────────────────────────

  bot.hears(ADMIN_BTN_SCHEDULE, async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
      const rows = getUpcomingSchedule();
      if (rows.length === 0) {
        await ctx.reply('Предстоящих записей нет.');
        return;
      }
      const lines = rows.map((r, i) => {
        const start = new Date(r.event_start * 1000);
        const confirmed = r.lesson_confirmed_at ? '✅' : '❓';
        const tg = r.telegram_name ? `@${r.telegram_name}` : String(r.telegram_id);
        return (
          `${i + 1}. <b>${r.name ?? '—'}</b> ${confirmed}\n` +
          `   📅 ${formatDay(start)}, ${formatTime(start)}\n` +
          `   📞 ${r.phone ?? '—'} | 💬 ${tg}`
        );
      });
      for (const chunk of chunkText(lines, 4000)) {
        await ctx.reply(chunk, { parse_mode: 'HTML' });
      }
    } catch (err) {
      logger.error('Admin schedule failed', { err });
      await ctx.reply('Ошибка при загрузке расписания.');
    }
  });

  // ── Clients ────────────────────────────────────────────────────────────────

  bot.hears(ADMIN_BTN_CLIENTS, async (ctx) => {
    if (!isAdmin(ctx)) return;
    return ctx.scene.enter(SCENE_ADMIN_CLIENTS);
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  bot.hears(ADMIN_BTN_SEARCH, async (ctx) => {
    if (!isAdmin(ctx)) return;
    return ctx.scene.enter(SCENE_ADMIN_SEARCH);
  });

  // ── Broadcast ──────────────────────────────────────────────────────────────

  bot.hears(ADMIN_BTN_BROADCAST, async (ctx) => {
    if (!isAdmin(ctx)) return;
    return ctx.scene.enter(SCENE_ADMIN_BROADCAST);
  });

  // ── Messages ───────────────────────────────────────────────────────────────

  bot.hears(ADMIN_BTN_MESSAGES, async (ctx) => {
    if (!isAdmin(ctx)) return;
    return ctx.scene.enter(SCENE_ADMIN_MESSAGES);
  });
}

// ── Utility ────────────────────────────────────────────────────────────────

function chunkText(lines: string[], maxLen: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const sep = current ? '\n\n' : '';
    if ((current + sep + line).length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current += sep + line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
