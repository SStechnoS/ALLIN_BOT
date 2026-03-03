"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("./db/client");
const bot_1 = require("./bot");
const admin_1 = require("./admin");
const tilda_server_1 = require("./webhook/tilda.server");
const config_1 = require("./config");
const logger_1 = require("./logger");
async function main() {
    // 1. Validate config (throws on missing vars) + init DB
    (0, client_1.initDb)();
    // 2. Build bots
    const bot = (0, bot_1.createBot)();
    let adminBot;
    if (config_1.config.adminBot.token && config_1.config.adminBot.password) {
        adminBot = (0, admin_1.createAdminBot)();
    }
    else {
        logger_1.logger.warn("Admin bot not started: set ADMIN_BOT_TOKEN and ADMIN_BOT_PASSWORD to enable it");
    }
    // 3. Start Tilda webhook server (requires admin notifier to be ready first)
    const webhookServer = config_1.config.tildaWebhook
        ? (0, tilda_server_1.startTildaWebhookServer)()
        : (logger_1.logger.warn('Tilda webhook server not started: TILDA_WEBHOOK is not set'), undefined);
    // 4. Graceful shutdown
    const shutdown = async (signal) => {
        logger_1.logger.info(`Received ${signal}, shutting down…`);
        bot.stop(signal);
        adminBot?.stop(signal);
        webhookServer?.close();
        (0, client_1.closeDb)();
        process.exit(0);
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    // 5. Launch both bots concurrently without awaiting individually —
    //    bot.launch() resolves only when the bot stops, so awaiting it serially
    //    would block the second bot from ever starting.
    const launches = [
        bot.launch().then(() => logger_1.logger.info("Main bot stopped")),
    ];
    if (adminBot) {
        launches.push(adminBot.launch().then(() => logger_1.logger.info("Admin bot stopped")));
    }
    logger_1.logger.info("Main bot started (long polling)");
    if (adminBot)
        logger_1.logger.info("Admin bot started (long polling)");
    await Promise.all(launches);
}
main().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map