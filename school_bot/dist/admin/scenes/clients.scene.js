"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminClientsScene = exports.SCENE_ADMIN_CLIENTS = void 0;
const telegraf_1 = require("telegraf");
const db_1 = require("../db");
const menu_handler_1 = require("../handlers/menu.handler");
const format_1 = require("../../utils/format");
const logger_1 = require("../../logger");
exports.SCENE_ADMIN_CLIENTS = "admin_clients";
function s(ctx) {
    return ctx.scene.state;
}
// ── Scene ─────────────────────────────────────────────────────────────────────
exports.adminClientsScene = new telegraf_1.Scenes.BaseScene(exports.SCENE_ADMIN_CLIENTS);
exports.adminClientsScene.enter(async (ctx) => {
    ctx.scene.state = {
        mode: "picker",
        page: 0,
        total: 0,
    };
    await showPicker(ctx, (0, format_1.currentYM)());
});
// ── Period picker ─────────────────────────────────────────────────────────────
exports.adminClientsScene.action("cl_all", async (ctx) => {
    await ctx.answerCbQuery();
    const total = (0, db_1.getRegisteredUserCount)();
    if (total === 0) {
        await ctx.editMessageText("Зарегистрированных клиентов пока нет.", {
            ...telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback("↩️ Меню", "cl_back")],
            ]),
        });
        return;
    }
    ctx.scene.state = { mode: "list", page: 0, total };
    await showClient(ctx);
});
exports.adminClientsScene.action(/^cl_month_(\d{4}-\d{2})$/, async (ctx) => {
    await ctx.answerCbQuery();
    const ym = ctx.match[1];
    const { since, until } = (0, format_1.ymToBounds)(ym);
    const total = (0, db_1.getFilteredUserCount)(since, until);
    const label = (0, format_1.formatMonthLabel)(ym);
    if (total === 0) {
        await ctx.editMessageText(`За ${label.toLowerCase()} клиентов нет.`, {
            ...telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback("← Назад", `cl_mprev_${ym}`)],
                [telegraf_1.Markup.button.callback("↩️ Меню", "cl_back")],
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
    };
    await showClient(ctx);
});
exports.adminClientsScene.action(/^cl_mprev_(\d{4}-\d{2})$/, async (ctx) => {
    await ctx.answerCbQuery();
    await showPicker(ctx, (0, format_1.prevYM)(ctx.match[1]));
});
exports.adminClientsScene.action(/^cl_mnext_(\d{4}-\d{2})$/, async (ctx) => {
    await ctx.answerCbQuery();
    await showPicker(ctx, (0, format_1.nextYM)(ctx.match[1]));
});
exports.adminClientsScene.action("cl_back_picker", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.scene.state = { mode: "picker", page: 0, total: 0 };
    await showPicker(ctx, (0, format_1.currentYM)());
});
// ── Navigation ────────────────────────────────────────────────────────────────
exports.adminClientsScene.action("cl_prev", async (ctx) => {
    await ctx.answerCbQuery();
    const state = s(ctx);
    if (state.page <= 0)
        return;
    ctx.scene.state = { ...state, page: state.page - 1 };
    await showClient(ctx);
});
exports.adminClientsScene.action("cl_next", async (ctx) => {
    await ctx.answerCbQuery();
    const state = s(ctx);
    if (state.page >= state.total - 1)
        return;
    ctx.scene.state = { ...state, page: state.page + 1 };
    await showClient(ctx);
});
// ── Attendance ────────────────────────────────────────────────────────────────
exports.adminClientsScene.action("cl_attended", async (ctx) => {
    await ctx.answerCbQuery("✅ Отмечено: пришёл");
    const state = s(ctx);
    const user = (0, db_1.getUserAtOffsetFiltered)(state.page, state.since, state.until);
    if (!user?.booking_id)
        return;
    try {
        (0, db_1.setAttended)(user.booking_id, true);
    }
    catch (err) {
        logger_1.logger.error("setAttended failed", { err });
    }
    await showClient(ctx);
});
exports.adminClientsScene.action("cl_not_attended", async (ctx) => {
    await ctx.answerCbQuery("❌ Отмечено: не пришёл");
    const state = s(ctx);
    const user = (0, db_1.getUserAtOffsetFiltered)(state.page, state.since, state.until);
    if (!user?.booking_id)
        return;
    try {
        (0, db_1.setAttended)(user.booking_id, false);
    }
    catch (err) {
        logger_1.logger.error("setAttended failed", { err });
    }
    await showClient(ctx);
});
// ── Back ──────────────────────────────────────────────────────────────────────
exports.adminClientsScene.action("cl_back", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.scene.leave();
    await (0, menu_handler_1.sendAdminMenu)(ctx);
});
// ── Helpers ───────────────────────────────────────────────────────────────────
async function showPicker(ctx, ym) {
    const { since, until } = (0, format_1.ymToBounds)(ym);
    const monthCount = (0, db_1.getFilteredUserCount)(since, until);
    const label = (0, format_1.formatMonthLabel)(ym);
    // Кнопка периода: "N Месяц 'YY" (число перед месяцем, год из 2 цифр)
    const [yearS, monthS] = ym.split("-");
    const yearShort = yearS.slice(-2);
    const date = new Date(Number(yearS), Number(monthS) - 1, 1);
    const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(date);
    const periodButtonLabel = `(${monthCount}) ${monthName} - ${yearShort}`;
    const keyboard = telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback("👥 Все клиенты", "cl_all")],
        [telegraf_1.Markup.button.callback(periodButtonLabel, `cl_month_${ym}`)], // одна кнопка на строке
        [
            telegraf_1.Markup.button.callback("←", `cl_mprev_${ym}`),
            telegraf_1.Markup.button.callback("→", `cl_mnext_${ym}`),
        ],
        [telegraf_1.Markup.button.callback("↩️ Меню", "cl_back")],
    ]);
    const text = "👥 <b>Клиенты</b>\n\nВыберите период:";
    if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: "HTML", ...keyboard });
    }
    else {
        await ctx.reply(text, { parse_mode: "HTML", ...keyboard });
    }
}
async function showClient(ctx) {
    const state = s(ctx);
    const user = (0, db_1.getUserAtOffsetFiltered)(state.page, state.since, state.until);
    if (!user) {
        await ctx.scene.leave();
        await (0, menu_handler_1.sendAdminMenu)(ctx, "Клиент не найден.");
        return;
    }
    const now = Math.floor(Date.now() / 1000);
    const tg = user.telegram_name
        ? `@${user.telegram_name}`
        : `ID: ${user.telegram_id}`;
    const periodLine = state.periodLabel
        ? `📅 Период: ${state.periodLabel}\n`
        : "";
    let text = `👤 <b>${user.name}</b>  <i>(${state.page + 1} / ${state.total})</i>\n` +
        periodLine +
        `\n📞 ${user.phone ?? "—"}\n` +
        `📧 ${user.email ?? "—"}\n` +
        `💬 ${tg}\n`;
    const hasPastBooking = user.booking_id !== null &&
        user.event_start !== null &&
        user.event_start < now;
    if (user.event_start) {
        const start = new Date(user.event_start * 1000);
        const isPast = user.event_start < now;
        text += `\n📅 ${(0, format_1.formatDay)(start)}, ${(0, format_1.formatTime)(start)}`;
        if (isPast) {
            const statusLabel = user.attended === 1
                ? "✅ Пришёл"
                : user.attended === 0
                    ? "❌ Не пришёл"
                    : "❓ Статус не указан";
            text += `\n${statusLabel}`;
        }
        else {
            text += ` ⏳ предстоящий`;
            text += user.lesson_confirmed_at
                ? "\n✅ Подтверждён"
                : "\n❓ Не подтверждён";
        }
    }
    else {
        text += "\n📅 Записи нет";
    }
    // Build inline keyboard
    const rows = [];
    if (hasPastBooking) {
        rows.push([
            telegraf_1.Markup.button.callback(user.attended === 1 ? "✅ Пришёл ✓" : "✅ Пришёл", "cl_attended"),
            telegraf_1.Markup.button.callback(user.attended === 0 ? "❌ Не пришёл ✓" : "❌ Не пришёл", "cl_not_attended"),
        ]);
    }
    rows.push([telegraf_1.Markup.button.callback("← Период", "cl_back_picker")]);
    const navRow = [];
    if (state.page > 0)
        navRow.push(telegraf_1.Markup.button.callback("←", "cl_prev"));
    navRow.push(telegraf_1.Markup.button.callback("↩️ Меню", "cl_back"));
    if (state.page < state.total - 1)
        navRow.push(telegraf_1.Markup.button.callback("→", "cl_next"));
    rows.push(navRow);
    const keyboard = { inline_keyboard: rows };
    if (ctx.callbackQuery) {
        await ctx.editMessageText(text, {
            parse_mode: "HTML",
            reply_markup: keyboard,
        });
    }
    else {
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    }
}
//# sourceMappingURL=clients.scene.js.map