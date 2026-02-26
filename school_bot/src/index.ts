import { initDb, closeDb } from './db/client';
import { createBot } from './bot';
import { logger } from './logger';

async function main(): Promise<void> {
  // 1. Validate config (throws on missing vars) + init DB
  initDb();

  // 2. Build bot
  const bot = createBot();

  // 3. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down…`);
    bot.stop(signal);
    closeDb();
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  // 4. Launch
  await bot.launch();
  logger.info('Bot started (long polling)');
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
