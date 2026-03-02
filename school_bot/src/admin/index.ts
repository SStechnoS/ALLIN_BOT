import { Telegraf, Scenes } from "telegraf";
import type { AdminBotContext } from "./types";
import { buildAdminSessionMiddleware } from "./session";
import { getAdminByTelegramId } from "./db";
import { initAdminNotifier } from "./notifications";
import { adminAuthScene, SCENE_ADMIN_AUTH } from "./scenes/auth.scene";
import { broadcastScene } from "./scenes/broadcast.scene";
import { adminSearchScene } from "./scenes/search.scene";
import { adminClientsScene } from "./scenes/clients.scene";
import { adminMessagesScene } from "./scenes/messages.scene";
import { adminEmailScene } from "./scenes/email.scene";
import {
  registerAdminMenuHandlers,
  sendAdminMenu,
} from "./handlers/menu.handler";
import { config } from "../config";
import { logger } from "../logger";

export function createAdminBot(): Telegraf<AdminBotContext> {
  const bot = new Telegraf<AdminBotContext>(config.adminBot.token);

  // ── Middleware ────────────────────────────────────────────────────────────
  bot.use(buildAdminSessionMiddleware());

  const stage = new Scenes.Stage<AdminBotContext>([
    adminAuthScene,
    broadcastScene,
    adminSearchScene,
    adminClientsScene,
    adminMessagesScene,
    adminEmailScene,
  ]);
  bot.use(stage.middleware());

  // Global error handler
  bot.catch((err, ctx) => {
    logger.error("Unhandled admin bot error", {
      error: err instanceof Error ? err.message : String(err),
      update: ctx.update,
    });
  });

  // ── /start ────────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    if (!ctx.from) return;
    await ctx.scene.leave();

    const admin = getAdminByTelegramId(ctx.from.id);
    if (admin) {
      return sendAdminMenu(ctx, `С возвращением, ${ctx.from.first_name}!`);
    }

    // Not yet authorised — enter silent auth scene
    return ctx.scene.enter(SCENE_ADMIN_AUTH);
  });

  registerAdminMenuHandlers(bot);

  // Initialise the notifier singleton with this bot's Telegram instance
  initAdminNotifier(bot.telegram);

  return bot;
}
