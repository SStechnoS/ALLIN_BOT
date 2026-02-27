import type { Telegram } from 'telegraf';

let _telegram: Telegram | null = null;

/** Call once inside createBot() to register the client bot's Telegram instance. */
export function initClientTelegram(telegram: Telegram): void {
  _telegram = telegram;
}

/**
 * Returns the client bot's Telegram instance.
 * Returns null if the client bot hasn't been initialised yet (safe to handle at call site).
 */
export function getClientTelegram(): Telegram | null {
  return _telegram;
}
