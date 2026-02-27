import { Scenes, Markup } from "telegraf";
import type { AdminBotContext } from "../types";
import {
  getRegisteredUserCount,
  getUserAtOffset,
  setAttended,
  getFilteredUserCount,
  getUserAtOffsetFiltered,
} from "../db";
import { sendAdminMenu } from "../handlers/menu.handler";
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

export const SCENE_ADMIN_CLIENTS = "admin_clients";

interface ClientsState {
  mode: "picker" | "list";
  page: number;
  total: number;
  since?: number;
  until?: number;
  periodLabel?: string; // defined when mode=list with month filter
}

function s(ctx: AdminBotContext): ClientsState {
  return ctx.scene.state as ClientsState;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export const adminClientsScene = new Scenes.BaseScene<AdminBotContext>(
  SCENE_ADMIN_CLIENTS,
);

adminClientsScene.enter(async (ctx) => {
  ctx.scene.state = {
    mode: "picker",
    page: 0,
    total: 0,
  } satisfies ClientsState;
  await showPicker(ctx, currentYM());
});

// ── Period picker ─────────────────────────────────────────────────────────────

adminClientsScene.action("cl_all", async (ctx) => {
  await ctx.answerCbQuery();
  const total = getRegisteredUserCount();
  if (total === 0) {
    await ctx.editMessageText("Зарегистрированных клиентов пока нет.", {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("↩️ Меню", "cl_back")],
      ]),
    });
    return;
  }
  ctx.scene.state = { mode: "list", page: 0, total } satisfies ClientsState;
  await showClient(ctx);
});

adminClientsScene.action(/^cl_month_(\d{4}-\d{2})$/, async (ctx) => {
  await ctx.answerCbQuery();
  const ym = ctx.match![1]!;
  const { since, until } = ymToBounds(ym);
  const total = getFilteredUserCount(since, until);
  const label = formatMonthLabel(ym);
  if (total === 0) {
    await ctx.editMessageText(`За ${label.toLowerCase()} клиентов нет.`, {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("← Назад", `cl_mprev_${ym}`)],
        [Markup.button.callback("↩️ Меню", "cl_back")],
      ]),
    });
    return;
  }
  ctx.scene.state = {
    mode: "list",
    page: 0,
    total,
    since,
    until,
    periodLabel: label,
  } satisfies ClientsState;
  await showClient(ctx);
});

adminClientsScene.action(/^cl_mprev_(\d{4}-\d{2})$/, async (ctx) => {
  await ctx.answerCbQuery();
  await showPicker(ctx, prevYM(ctx.match![1]!));
});

adminClientsScene.action(/^cl_mnext_(\d{4}-\d{2})$/, async (ctx) => {
  await ctx.answerCbQuery();
  await showPicker(ctx, nextYM(ctx.match![1]!));
});

adminClientsScene.action("cl_back_picker", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.state = { mode: "picker", page: 0, total: 0 };
  await showPicker(ctx, currentYM());
});

// ── Navigation ────────────────────────────────────────────────────────────────

adminClientsScene.action("cl_prev", async (ctx) => {
  await ctx.answerCbQuery();
  const state = s(ctx);
  if (state.page <= 0) return;
  ctx.scene.state = { ...state, page: state.page - 1 };
  await showClient(ctx);
});

adminClientsScene.action("cl_next", async (ctx) => {
  await ctx.answerCbQuery();
  const state = s(ctx);
  if (state.page >= state.total - 1) return;
  ctx.scene.state = { ...state, page: state.page + 1 };
  await showClient(ctx);
});

// ── Attendance ────────────────────────────────────────────────────────────────

adminClientsScene.action("cl_attended", async (ctx) => {
  await ctx.answerCbQuery("✅ Отмечено: пришёл");
  const state = s(ctx);
  const user = getUserAtOffsetFiltered(state.page, state.since, state.until);
  if (!user?.booking_id) return;
  try {
    setAttended(user.booking_id, true);
  } catch (err) {
    logger.error("setAttended failed", { err });
  }
  await showClient(ctx);
});

adminClientsScene.action("cl_not_attended", async (ctx) => {
  await ctx.answerCbQuery("❌ Отмечено: не пришёл");
  const state = s(ctx);
  const user = getUserAtOffsetFiltered(state.page, state.since, state.until);
  if (!user?.booking_id) return;
  try {
    setAttended(user.booking_id, false);
  } catch (err) {
    logger.error("setAttended failed", { err });
  }
  await showClient(ctx);
});

// ── Back ──────────────────────────────────────────────────────────────────────

adminClientsScene.action("cl_back", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.scene.leave();
  await sendAdminMenu(ctx);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function showPicker(ctx: AdminBotContext, ym: string): Promise<void> {
  const { since, until } = ymToBounds(ym);
  const monthCount = getFilteredUserCount(since, until);
  const label = formatMonthLabel(ym);

  // Кнопка периода: "N Месяц 'YY" (число перед месяцем, год из 2 цифр)
  const [yearS, monthS] = ym.split("-");
  const yearShort = yearS.slice(-2);
  const date = new Date(Number(yearS), Number(monthS) - 1, 1);
  const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(
    date,
  );
  const periodButtonLabel = `(${monthCount}) ${monthName} - ${yearShort}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("👥 Все клиенты", "cl_all")],
    [Markup.button.callback(periodButtonLabel, `cl_month_${ym}`)], // одна кнопка на строке
    [
      Markup.button.callback("←", `cl_mprev_${ym}`),
      Markup.button.callback("→", `cl_mnext_${ym}`),
    ],
    [Markup.button.callback("↩️ Меню", "cl_back")],
  ]);

  const text = "👥 <b>Клиенты</b>\n\nВыберите период:";
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...keyboard });
  }
}

async function showClient(ctx: AdminBotContext): Promise<void> {
  const state = s(ctx);
  const user = getUserAtOffsetFiltered(state.page, state.since, state.until);

  if (!user) {
    await ctx.scene.leave();
    await sendAdminMenu(ctx, "Клиент не найден.");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const tg = user.telegram_name
    ? `@${user.telegram_name}`
    : `ID: ${user.telegram_id}`;
  const periodLine = state.periodLabel
    ? `📅 Период: ${state.periodLabel}\n`
    : "";

  let text =
    `👤 <b>${user.name}</b>  <i>(${state.page + 1} / ${state.total})</i>\n` +
    periodLine +
    `\n📞 ${user.phone ?? "—"}\n` +
    `📧 ${user.email ?? "—"}\n` +
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
          ? "✅ Пришёл"
          : user.attended === 0
            ? "❌ Не пришёл"
            : "❓ Статус не указан";
      text += `\n${statusLabel}`;
    } else {
      text += ` ⏳ предстоящий`;
      text += user.lesson_confirmed_at
        ? "\n✅ Подтверждён"
        : "\n❓ Не подтверждён";
    }
  } else {
    text += "\n📅 Записи нет";
  }

  // Build inline keyboard
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];

  if (hasPastBooking) {
    rows.push([
      Markup.button.callback(
        user.attended === 1 ? "✅ Пришёл ✓" : "✅ Пришёл",
        "cl_attended",
      ),
      Markup.button.callback(
        user.attended === 0 ? "❌ Не пришёл ✓" : "❌ Не пришёл",
        "cl_not_attended",
      ),
    ]);
  }

  rows.push([Markup.button.callback("← Период", "cl_back_picker")]);

  const navRow: ReturnType<typeof Markup.button.callback>[] = [];
  if (state.page > 0) navRow.push(Markup.button.callback("←", "cl_prev"));
  navRow.push(Markup.button.callback("↩️ Меню", "cl_back"));
  if (state.page < state.total - 1)
    navRow.push(Markup.button.callback("→", "cl_next"));
  rows.push(navRow);

  const keyboard = { inline_keyboard: rows };

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  }
}
