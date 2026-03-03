import type { BotContext } from "../types";
export declare const MAIN_MENU_BTN = "\uD83D\uDCCB \u041C\u043E\u0451 \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435";
export declare const RESCHEDULE_BTN = "\uD83D\uDD04 \u041F\u0435\u0440\u0435\u043D\u0435\u0441\u0442\u0438 \u0437\u0430\u043F\u0438\u0441\u044C";
export declare const CONTACT_MANAGER_BTN = "\uD83D\uDCAC \u0421\u0432\u044F\u0437\u0430\u0442\u044C\u0441\u044F \u0441 \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u043E\u043C";
export declare const USE_AI = "\uD83E\uDD16 \u0421\u043F\u0440\u043E\u0441\u0438\u0442\u044C AI";
export declare const EXIT_AI_BTN = "\u2190 \u0412\u044B\u0439\u0442\u0438 \u0438\u0437 AI";
export declare function sendMainMenu(ctx: BotContext, text: string): Promise<void>;
export declare function sendAiMenu(ctx: BotContext, text: string): Promise<void>;
//# sourceMappingURL=keyboards.d.ts.map