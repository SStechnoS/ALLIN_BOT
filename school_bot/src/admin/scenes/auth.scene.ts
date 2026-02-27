import { Scenes } from "telegraf";
import type { AdminBotContext } from "../types";
import { createAdmin } from "../db";
import { config } from "../../config";

export const SCENE_ADMIN_AUTH = "admin_auth";

export const adminAuthScene = new Scenes.BaseScene<AdminBotContext>(
  SCENE_ADMIN_AUTH,
);

// Silent entry — no reply, just wait for password
adminAuthScene.enter(async (_ctx) => {
  // Intentionally empty
});

adminAuthScene.on("message", async (ctx) => {
  if (!ctx.from || !("text" in ctx.message)) return;

  if (ctx.message.text !== config.adminBot.password) {
    // Wrong password — silently ignore
    return;
  }

  createAdmin(ctx.from.id, ctx.from.username ?? null);
  await ctx.scene.leave();

  await ctx.reply(`✅ Добро пожаловать!\n\nВы авторизованы как администратор.`);

  // Import here to avoid circular dependency at module load time
  const { sendAdminMenu } = await import("../handlers/menu.handler");
  await sendAdminMenu(ctx);
});
