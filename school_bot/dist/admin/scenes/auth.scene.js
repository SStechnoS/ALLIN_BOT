"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuthScene = exports.SCENE_ADMIN_AUTH = void 0;
const telegraf_1 = require("telegraf");
const db_1 = require("../db");
const config_1 = require("../../config");
exports.SCENE_ADMIN_AUTH = "admin_auth";
exports.adminAuthScene = new telegraf_1.Scenes.BaseScene(exports.SCENE_ADMIN_AUTH);
// Silent entry — no reply, just wait for password
exports.adminAuthScene.enter(async (_ctx) => {
    // Intentionally empty
});
exports.adminAuthScene.on("message", async (ctx) => {
    if (!ctx.from || !("text" in ctx.message))
        return;
    if (ctx.message.text !== config_1.config.adminBot.password) {
        // Wrong password — silently ignore
        return;
    }
    (0, db_1.createAdmin)(ctx.from.id, ctx.from.username ?? null);
    await ctx.scene.leave();
    await ctx.reply(`✅ Добро пожаловать!\n\nВы авторизованы как администратор.`);
    // Import here to avoid circular dependency at module load time
    const { sendAdminMenu } = await Promise.resolve().then(() => __importStar(require("../handlers/menu.handler")));
    await sendAdminMenu(ctx);
});
//# sourceMappingURL=auth.scene.js.map