"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
/**
 * In-memory session store — replaces Redis/ioredis.
 * Sessions persist only during process lifetime (reset on restart).
 * For a small school bot this is acceptable.
 */
const logger_1 = require("./logger");
const store = new Map();
const expireTimers = new Map();
exports.redis = {
    get: (key) => Promise.resolve(store.get(key) ?? null),
    set: (key, value, ..._args) => {
        store.set(key, value);
        return Promise.resolve('OK');
    },
    del: (key) => {
        const existed = store.delete(key);
        return Promise.resolve(existed ? 1 : 0);
    },
    incr: (key) => {
        const val = parseInt(store.get(key) ?? '0') + 1;
        store.set(key, String(val));
        return Promise.resolve(val);
    },
    expire: (key, seconds) => {
        const existing = expireTimers.get(key);
        if (existing)
            clearTimeout(existing);
        const timer = setTimeout(() => { store.delete(key); expireTimers.delete(key); }, seconds * 1000);
        expireTimers.set(key, timer);
        return Promise.resolve(1);
    },
    quit: () => {
        store.clear();
        logger_1.logger.info('Session store cleared');
        return Promise.resolve();
    },
};
//# sourceMappingURL=redis.js.map