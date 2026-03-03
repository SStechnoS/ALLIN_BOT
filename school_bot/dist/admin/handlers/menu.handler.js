"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_BTN_EMAIL = exports.ADMIN_BTN_MESSAGES = exports.ADMIN_BTN_BROADCAST = exports.ADMIN_BTN_SEARCH = exports.ADMIN_BTN_CLIENTS = exports.ADMIN_BTN_SCHEDULE = exports.ADMIN_BTN_STATS = void 0;
exports.sendAdminMenu = sendAdminMenu;
exports.registerAdminMenuHandlers = registerAdminMenuHandlers;
const telegraf_1 = require("telegraf");
const db_1 = require("../db");
const broadcast_scene_1 = require("../scenes/broadcast.scene");
const search_scene_1 = require("../scenes/search.scene");
const clients_scene_1 = require("../scenes/clients.scene");
const messages_scene_1 = require("../scenes/messages.scene");
const email_scene_1 = require("../scenes/email.scene");
const format_1 = require("../../utils/format");
const logger_1 = require("../../logger");
exports.ADMIN_BTN_STATS = "📊 Статистика";
exports.ADMIN_BTN_SCHEDULE = "📅 Расписание";
exports.ADMIN_BTN_CLIENTS = "👥 Клиенты";
exports.ADMIN_BTN_SEARCH = "🔍 Найти клиента";
exports.ADMIN_BTN_BROADCAST = "📢 Рассылка";
exports.ADMIN_BTN_MESSAGES = "📝 Тексты бота";
exports.ADMIN_BTN_EMAIL = "📧 Email рассылка";
async function sendAdminMenu(ctx, text = "Главное меню:") {
    await ctx.reply(text, telegraf_1.Markup.keyboard([
        [exports.ADMIN_BTN_STATS, exports.ADMIN_BTN_SCHEDULE],
        [exports.ADMIN_BTN_CLIENTS, exports.ADMIN_BTN_SEARCH],
        [exports.ADMIN_BTN_BROADCAST, exports.ADMIN_BTN_MESSAGES],
        [exports.ADMIN_BTN_EMAIL],
    ]).resize());
}
function isAdmin(ctx) {
    return !!(ctx.from && (0, db_1.getAdminByTelegramId)(ctx.from.id));
}
// ── Stats helpers ─────────────────────────────────────────────────────────────
function formatStats(stats, label) {
    return (`📊 <b>Статистика — ${label}</b>\n\n` +
        `👤 Новых клиентов: <b>${stats.new_users}</b>\n` +
        `📅 Новых записей: <b>${stats.new_bookings}</b>\n` +
        `🎯 Пришли на урок: <b>${stats.attended}</b>\n` +
        `❌ Не пришли: <b>${stats.not_attended}</b>\n\n` +
        `⏳ Предстоящих уроков: <b>${stats.upcoming}</b>`);
}
function statsMainKeyboard() {
    return telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback("За всё время", "stats_all"),
            telegraf_1.Markup.button.callback("Выбрать месяц", `stats_m_${(0, format_1.currentYM)()}`),
        ],
    ]);
}
function statsMonthKeyboard(ym) {
    return telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback("←", `stats_m_${(0, format_1.prevYM)(ym)}`),
            telegraf_1.Markup.button.callback("→", `stats_m_${(0, format_1.nextYM)(ym)}`),
        ],
        [telegraf_1.Markup.button.callback("← За всё время", "stats_all")],
    ]);
}
// ── Handlers ──────────────────────────────────────────────────────────────────
function registerAdminMenuHandlers(bot) {
    // ── Stats ──────────────────────────────────────────────────────────────────
    bot.hears(exports.ADMIN_BTN_STATS, async (ctx) => {
        if (!isAdmin(ctx))
            return;
        try {
            const stats = (0, db_1.getStatsByPeriod)(undefined, undefined);
            await ctx.reply(formatStats(stats, "за всё время"), {
                parse_mode: "HTML",
                ...statsMainKeyboard(),
            });
        }
        catch (err) {
            logger_1.logger.error("Admin stats failed", { err });
            await ctx.reply("Ошибка при загрузке статистики.");
        }
    });
    bot.action("stats_all", async (ctx) => {
        if (!isAdmin(ctx))
            return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        try {
            const stats = (0, db_1.getStatsByPeriod)(undefined, undefined);
            await ctx.editMessageText(formatStats(stats, "за всё время"), {
                parse_mode: "HTML",
                ...statsMainKeyboard(),
            });
        }
        catch (err) {
            logger_1.logger.error("Admin stats failed", { err });
        }
    });
    bot.action(/^stats_m_(\d{4}-\d{2})$/, async (ctx) => {
        if (!isAdmin(ctx))
            return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const ym = ctx.match[1];
        const { since, until } = (0, format_1.ymToBounds)(ym);
        const label = (0, format_1.formatMonthLabel)(ym);
        try {
            const stats = (0, db_1.getStatsByPeriod)(since, until);
            await ctx.editMessageText(formatStats(stats, label), {
                parse_mode: "HTML",
                ...statsMonthKeyboard(ym),
            });
        }
        catch (err) {
            logger_1.logger.error("Admin stats month failed", { err });
        }
    });
    // ── Schedule ───────────────────────────────────────────────────────────────
    bot.hears(exports.ADMIN_BTN_SCHEDULE, async (ctx) => {
        if (!isAdmin(ctx))
            return;
        try {
            const rows = (0, db_1.getUpcomingSchedule)();
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
                return (`${i + 1}. <b>${r.name ?? "—"}</b> ${confirmed}\n` +
                    `   📅 ${(0, format_1.formatDay)(start)}, ${(0, format_1.formatTime)(start)}\n` +
                    `   📞 ${r.phone ?? "—"} | 💬 ${tg}`);
            });
            for (const chunk of chunkText(lines, 4000)) {
                await ctx.reply(chunk, { parse_mode: "HTML" });
            }
        }
        catch (err) {
            logger_1.logger.error("Admin schedule failed", { err });
            await ctx.reply("Ошибка при загрузке расписания.");
        }
    });
    // ── Clients ────────────────────────────────────────────────────────────────
    bot.hears(exports.ADMIN_BTN_CLIENTS, async (ctx) => {
        if (!isAdmin(ctx))
            return;
        return ctx.scene.enter(clients_scene_1.SCENE_ADMIN_CLIENTS);
    });
    // ── Search ─────────────────────────────────────────────────────────────────
    bot.hears(exports.ADMIN_BTN_SEARCH, async (ctx) => {
        if (!isAdmin(ctx))
            return;
        return ctx.scene.enter(search_scene_1.SCENE_ADMIN_SEARCH);
    });
    // ── Broadcast ──────────────────────────────────────────────────────────────
    bot.hears(exports.ADMIN_BTN_BROADCAST, async (ctx) => {
        if (!isAdmin(ctx))
            return;
        await ctx.reply("📢 <b>Рассылка</b>\n\nВыберите аудиторию:", {
            parse_mode: "HTML",
            ...telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback("👥 Все клиенты", "bc_target_all")],
                [
                    telegraf_1.Markup.button.callback("❓ Не подтвердили урок", "bc_target_unconfirmed"),
                ],
            ]),
        });
    });
    bot.action("bc_target_all", async (ctx) => {
        if (!isAdmin(ctx))
            return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        await ctx.scene.enter(broadcast_scene_1.SCENE_ADMIN_BROADCAST);
        ctx.scene.state = { step: 1, target: "all" };
        await ctx.editMessageText("✏️ Введите текст сообщения (поддерживается HTML):");
    });
    bot.action("bc_target_unconfirmed", async (ctx) => {
        if (!isAdmin(ctx))
            return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        await ctx.scene.enter(broadcast_scene_1.SCENE_ADMIN_BROADCAST);
        ctx.scene.state = { step: 1, target: "unconfirmed" };
        await ctx.editMessageText("✏️ Введите текст сообщения (поддерживается HTML):");
    });
    // ── Messages ───────────────────────────────────────────────────────────────
    bot.hears(exports.ADMIN_BTN_MESSAGES, async (ctx) => {
        if (!isAdmin(ctx))
            return;
        return ctx.scene.enter(messages_scene_1.SCENE_ADMIN_MESSAGES);
    });
    // ── Email broadcast ────────────────────────────────────────────────────────
    bot.hears(exports.ADMIN_BTN_EMAIL, async (ctx) => {
        if (!isAdmin(ctx))
            return;
        await ctx.reply("📧 <b>Email рассылка</b>\n\nВыберите аудиторию:", {
            parse_mode: "HTML",
            ...telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback("📨 Все с email", "email_target_all")],
                [
                    telegraf_1.Markup.button.callback("❓ Не подтвердили урок", "email_target_unconfirmed"),
                ],
            ]),
        });
    });
    bot.action("email_target_all", async (ctx) => {
        if (!isAdmin(ctx))
            return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        await ctx.scene.enter(email_scene_1.SCENE_ADMIN_EMAIL);
        ctx.scene.state = { step: 1, target: "all" };
        await ctx.editMessageText("✏️ Введите тему письма:");
    });
    bot.action("email_target_unconfirmed", async (ctx) => {
        if (!isAdmin(ctx))
            return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        await ctx.scene.enter(email_scene_1.SCENE_ADMIN_EMAIL);
        ctx.scene.state = { step: 1, target: "unconfirmed" };
        await ctx.editMessageText("✏️ Введите тему письма:");
    });
}
// ── Utility ────────────────────────────────────────────────────────────────
function chunkText(lines, maxLen) {
    const chunks = [];
    let current = "";
    for (const line of lines) {
        const sep = current ? "\n\n" : "";
        if ((current + sep + line).length > maxLen) {
            if (current)
                chunks.push(current);
            current = line;
        }
        else {
            current += sep + line;
        }
    }
    if (current)
        chunks.push(current);
    return chunks;
}
//# sourceMappingURL=menu.handler.js.map