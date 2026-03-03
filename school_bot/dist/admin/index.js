"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminBot = createAdminBot;
const telegraf_1 = require("telegraf");
const session_1 = require("./session");
const db_1 = require("./db");
const notifications_1 = require("./notifications");
const auth_scene_1 = require("./scenes/auth.scene");
const broadcast_scene_1 = require("./scenes/broadcast.scene");
const search_scene_1 = require("./scenes/search.scene");
const clients_scene_1 = require("./scenes/clients.scene");
const messages_scene_1 = require("./scenes/messages.scene");
const email_scene_1 = require("./scenes/email.scene");
const menu_handler_1 = require("./handlers/menu.handler");
const config_1 = require("../config");
const logger_1 = require("../logger");
function createAdminBot() {
    const bot = new telegraf_1.Telegraf(config_1.config.adminBot.token);
    // ── Middleware ────────────────────────────────────────────────────────────
    bot.use((0, session_1.buildAdminSessionMiddleware)());
    const stage = new telegraf_1.Scenes.Stage([
        auth_scene_1.adminAuthScene,
        broadcast_scene_1.broadcastScene,
        search_scene_1.adminSearchScene,
        clients_scene_1.adminClientsScene,
        messages_scene_1.adminMessagesScene,
        email_scene_1.adminEmailScene,
    ]);
    bot.use(stage.middleware());
    // Global error handler
    bot.catch((err, ctx) => {
        logger_1.logger.error("Unhandled admin bot error", {
            error: err instanceof Error ? err.message : String(err),
            update: ctx.update,
        });
    });
    // ── /start ────────────────────────────────────────────────────────────────
    bot.start(async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.scene.leave();
        const admin = (0, db_1.getAdminByTelegramId)(ctx.from.id);
        if (admin) {
            return (0, menu_handler_1.sendAdminMenu)(ctx, `С возвращением, ${ctx.from.first_name}!`);
        }
        // Not yet authorised — enter silent auth scene
        return ctx.scene.enter(auth_scene_1.SCENE_ADMIN_AUTH);
    });
    (0, menu_handler_1.registerAdminMenuHandlers)(bot);
    // Initialise the notifier singleton with this bot's Telegram instance
    (0, notifications_1.initAdminNotifier)(bot.telegram);
    return bot;
}
//# sourceMappingURL=index.js.map