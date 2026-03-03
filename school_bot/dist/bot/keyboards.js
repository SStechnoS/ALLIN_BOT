"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXIT_AI_BTN = exports.USE_AI = exports.CONTACT_MANAGER_BTN = exports.RESCHEDULE_BTN = exports.MAIN_MENU_BTN = void 0;
exports.sendMainMenu = sendMainMenu;
exports.sendAiMenu = sendAiMenu;
const telegraf_1 = require("telegraf");
exports.MAIN_MENU_BTN = "📋 Моё бронирование";
exports.RESCHEDULE_BTN = "🔄 Перенести запись";
exports.CONTACT_MANAGER_BTN = "💬 Связаться с менеджером";
exports.USE_AI = "AI";
exports.EXIT_AI_BTN = "Выйти из AI";
async function sendMainMenu(ctx, text) {
    await ctx.reply(text, telegraf_1.Markup.keyboard([
        [exports.MAIN_MENU_BTN, exports.CONTACT_MANAGER_BTN],
        [exports.RESCHEDULE_BTN, exports.USE_AI],
    ]).resize());
}
async function sendAiMenu(ctx, text) {
    await ctx.reply(text, telegraf_1.Markup.keyboard([[exports.EXIT_AI_BTN]]).resize());
}
//# sourceMappingURL=keyboards.js.map