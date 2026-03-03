"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initClientTelegram = initClientTelegram;
exports.getClientTelegram = getClientTelegram;
let _telegram = null;
/** Call once inside createBot() to register the client bot's Telegram instance. */
function initClientTelegram(telegram) {
    _telegram = telegram;
}
/**
 * Returns the client bot's Telegram instance.
 * Returns null if the client bot hasn't been initialised yet (safe to handle at call site).
 */
function getClientTelegram() {
    return _telegram;
}
//# sourceMappingURL=telegram.js.map