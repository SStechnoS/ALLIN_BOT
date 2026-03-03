"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSearchScene = exports.SCENE_ADMIN_SEARCH = void 0;
const telegraf_1 = require("telegraf");
const db_1 = require("../db");
const menu_handler_1 = require("../handlers/menu.handler");
const format_1 = require("../../utils/format");
exports.SCENE_ADMIN_SEARCH = 'admin_search';
exports.adminSearchScene = new telegraf_1.Scenes.BaseScene(exports.SCENE_ADMIN_SEARCH);
exports.adminSearchScene.enter(async (ctx) => {
    await ctx.reply('🔍 Введите имя, телефон, email или Telegram username/ID:');
});
exports.adminSearchScene.on('message', async (ctx) => {
    if (!('text' in ctx.message))
        return;
    const query = ctx.message.text.trim();
    const users = (0, db_1.searchUsers)(query);
    if (users.length === 0) {
        await ctx.reply('Клиентов не найдено.');
    }
    else {
        const lines = users.map((u, i) => {
            const bookingLine = u.event_start
                ? `\n   📅 ${(0, format_1.formatDay)(new Date(u.event_start * 1000))}, ${(0, format_1.formatTime)(new Date(u.event_start * 1000))} ${u.lesson_confirmed_at ? '✅' : '❓'}`
                : '\n   📅 нет записи';
            const tg = u.telegram_name ? `@${u.telegram_name}` : `ID: ${u.telegram_id}`;
            return (`${i + 1}. <b>${u.name ?? '—'}</b>\n` +
                `   📞 ${u.phone ?? '—'}\n` +
                `   📧 ${u.email ?? '—'}\n` +
                `   💬 ${tg}` +
                bookingLine);
        });
        await ctx.reply(`🔍 <b>Результаты (${users.length}):</b>\n\n${lines.join('\n\n')}`, {
            parse_mode: 'HTML',
        });
    }
    await ctx.scene.leave();
    await (0, menu_handler_1.sendAdminMenu)(ctx, '🔍 Новый поиск — снова нажмите «Найти клиента».');
});
//# sourceMappingURL=search.scene.js.map