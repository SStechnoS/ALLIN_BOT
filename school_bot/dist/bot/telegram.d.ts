import type { Telegram } from 'telegraf';
/** Call once inside createBot() to register the client bot's Telegram instance. */
export declare function initClientTelegram(telegram: Telegram): void;
/**
 * Returns the client bot's Telegram instance.
 * Returns null if the client bot hasn't been initialised yet (safe to handle at call site).
 */
export declare function getClientTelegram(): Telegram | null;
//# sourceMappingURL=telegram.d.ts.map