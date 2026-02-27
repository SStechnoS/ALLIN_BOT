import { Markup, type Telegraf } from "telegraf";
import type { AdminBotContext } from "../types";
import {
  getAdminByTelegramId,
  getStatsByPeriod,
  getUpcomingSchedule,
  type PeriodStats,
} from "../db";
import { SCENE_ADMIN_BROADCAST } from "../scenes/broadcast.scene";
import { SCENE_ADMIN_SEARCH } from "../scenes/search.scene";
import { SCENE_ADMIN_CLIENTS } from "../scenes/clients.scene";
import { SCENE_ADMIN_MESSAGES } from "../scenes/messages.scene";
import {
  formatDay,
  formatTime,
  formatMonthLabel,
  ymToBounds,
  currentYM,
  prevYM,
  nextYM,
} from "../../utils/format";
import { logger } from "../../logger";

export const ADMIN_BTN_STATS = "📊 Статистика";
export const ADMIN_BTN_SCHEDULE = "📅 Расписание";
export const ADMIN_BTN_CLIENTS = "👥 Клиенты";
export const ADMIN_BTN_SEARCH = "🔍 Найти клиента";
export const ADMIN_BTN_BROADCAST = "📢 Рассылка";
export const ADMIN_BTN_MESSAGES = "📝 Тексты бота";

export async function sendAdminMenu(
  ctx: AdminBotContext,
  text = "Главное меню:",
): Promise<void> {
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

// ── Stats helpers ─────────────────────────────────────────────────────────────

function formatStats(stats: PeriodStats, label: string): string {
  return (
    `📊 <b>Статистика — ${label}</b>\n\n` +
    `👤 Новых клиентов: <b>${stats.new_users}</b>\n` +
    `📅 Новых записей: <b>${stats.new_bookings}</b>\n` +
    `🎯 Пришли на урок: <b>${stats.attended}</b>\n` +
    `❌ Не пришли: <b>${stats.not_attended}</b>\n\n` +
    `⏳ Предстоящих уроков: <b>${stats.upcoming}</b>`
  );
}

function statsMainKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("За всё время", "stats_all"),
      Markup.button.callback("Выбрать месяц", `stats_m_${currentYM()}`),
    ],
  ]);
}

function statsMonthKeyboard(ym: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("←", `stats_m_${prevYM(ym)}`),
      Markup.button.callback("→", `stats_m_${nextYM(ym)}`),
    ],
    [Markup.button.callback("← За всё время", "stats_all")],
  ]);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export function registerAdminMenuHandlers(
  bot: Telegraf<AdminBotContext>,
): void {
  // ── Stats ──────────────────────────────────────────────────────────────────

  bot.hears(ADMIN_BTN_STATS, async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
      const stats = getStatsByPeriod(undefined, undefined);
      await ctx.reply(formatStats(stats, "за всё время"), {
        parse_mode: "HTML",
        ...statsMainKeyboard(),
      });
    } catch (err) {
      logger.error("Admin stats failed", { err });
      await ctx.reply("Ошибка при загрузке статистики.");
    }
  });

  bot.action("stats_all", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    try {
      const stats = getStatsByPeriod(undefined, undefined);
      await ctx.editMessageText(formatStats(stats, "за всё время"), {
        parse_mode: "HTML",
        ...statsMainKeyboard(),
      });
    } catch (err) {
      logger.error("Admin stats failed", { err });
    }
  });

  bot.action(/^stats_m_(\d{4}-\d{2})$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    const ym = ctx.match![1]!;
    const { since, until } = ymToBounds(ym);
    const label = formatMonthLabel(ym);
    try {
      const stats = getStatsByPeriod(since, until);
      await ctx.editMessageText(formatStats(stats, label), {
        parse_mode: "HTML",
        ...statsMonthKeyboard(ym),
      });
    } catch (err) {
      logger.error("Admin stats month failed", { err });
    }
  });

  // ── Schedule ───────────────────────────────────────────────────────────────

  bot.hears(ADMIN_BTN_SCHEDULE, async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
      const rows = getUpcomingSchedule();
      if (rows.length === 0) {
        await ctx.reply("Предстоящих записей нет.");
        return;
      }
      const lines = rows.map((r, i) => {
        const start = new Date(r.event_start * 1000);
        const confirmed = r.lesson_confirmed_at ? "✅" : "❓";
        const tg = r.telegram_name
          ? `@${r.telegram_name}`
          : String(r.telegram_id);
        return (
          `${i + 1}. <b>${r.name ?? "—"}</b> ${confirmed}\n` +
          `   📅 ${formatDay(start)}, ${formatTime(start)}\n` +
          `   📞 ${r.phone ?? "—"} | 💬 ${tg}`
        );
      });
      for (const chunk of chunkText(lines, 4000)) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err) {
      logger.error("Admin schedule failed", { err });
      await ctx.reply("Ошибка при загрузке расписания.");
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
    await ctx.reply("📢 <b>Рассылка</b>\n\nВыберите аудиторию:", {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("👥 Все клиенты", "bc_target_all")],
        [
          Markup.button.callback(
            "❓ Не подтвердили урок",
            "bc_target_unconfirmed",
          ),
        ],
      ]),
    });
  });

  bot.action("bc_target_all", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    await ctx.scene.enter(SCENE_ADMIN_BROADCAST);
    ctx.scene.state = { step: 1, target: "all" } as any;
    await ctx.editMessageText(
      "✏️ Введите текст сообщения (поддерживается HTML):",
    );
  });

  bot.action("bc_target_unconfirmed", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    await ctx.scene.enter(SCENE_ADMIN_BROADCAST);
    ctx.scene.state = { step: 1, target: "unconfirmed" } as any;
    await ctx.editMessageText(
      "✏️ Введите текст сообщения (поддерживается HTML):",
    );
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
  let current = "";
  for (const line of lines) {
    const sep = current ? "\n\n" : "";
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
