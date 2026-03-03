import { type Telegraf } from "telegraf";
import type { AdminBotContext } from "../types";
export declare const ADMIN_BTN_STATS = "\uD83D\uDCCA \u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430";
export declare const ADMIN_BTN_SCHEDULE = "\uD83D\uDCC5 \u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435";
export declare const ADMIN_BTN_CLIENTS = "\uD83D\uDC65 \u041A\u043B\u0438\u0435\u043D\u0442\u044B";
export declare const ADMIN_BTN_SEARCH = "\uD83D\uDD0D \u041D\u0430\u0439\u0442\u0438 \u043A\u043B\u0438\u0435\u043D\u0442\u0430";
export declare const ADMIN_BTN_BROADCAST = "\uD83D\uDCE2 \u0420\u0430\u0441\u0441\u044B\u043B\u043A\u0430";
export declare const ADMIN_BTN_MESSAGES = "\uD83D\uDCDD \u0422\u0435\u043A\u0441\u0442\u044B \u0431\u043E\u0442\u0430";
export declare const ADMIN_BTN_EMAIL = "\uD83D\uDCE7 Email \u0440\u0430\u0441\u0441\u044B\u043B\u043A\u0430";
export declare function sendAdminMenu(ctx: AdminBotContext, text?: string): Promise<void>;
export declare function registerAdminMenuHandlers(bot: Telegraf<AdminBotContext>): void;
//# sourceMappingURL=menu.handler.d.ts.map