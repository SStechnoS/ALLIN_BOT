import { initDb, closeDb } from "./db/client";
import { createBot } from "./bot";
import { createAdminBot } from "./admin";
import { startTildaWebhookServer } from "./webhook/tilda.server";
import { config } from "./config";
import { logger } from "./logger";

async function main(): Promise<void> {
  // 1. Validate config (throws on missing vars) + init DB
  initDb();

  // 2. Build bots
  const bot = createBot();

  let adminBot: ReturnType<typeof createAdminBot> | undefined;
  if (config.adminBot.token && config.adminBot.password) {
    adminBot = createAdminBot();
  } else {
    logger.warn(
      "Admin bot not started: set ADMIN_BOT_TOKEN and ADMIN_BOT_PASSWORD to enable it",
    );
  }

  // 3. Start Tilda webhook server (requires admin notifier to be ready first)
  const webhookServer = config.tildaWebhook
    ? startTildaWebhookServer()
    : (logger.warn('Tilda webhook server not started: TILDA_WEBHOOK is not set'), undefined);

  // 4. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down…`);
    bot.stop(signal);
    adminBot?.stop(signal);
    webhookServer?.close();
    closeDb();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  // 5. Launch both bots concurrently without awaiting individually —
  //    bot.launch() resolves only when the bot stops, so awaiting it serially
  //    would block the second bot from ever starting.
  const launches: Promise<void>[] = [
    bot.launch().then(() => logger.info("Main bot stopped")),
  ];

  if (adminBot) {
    launches.push(adminBot.launch().then(() => logger.info("Admin bot stopped")));
  }

  logger.info("Main bot started (long polling)");
  if (adminBot) logger.info("Admin bot started (long polling)");

  await Promise.all(launches);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
