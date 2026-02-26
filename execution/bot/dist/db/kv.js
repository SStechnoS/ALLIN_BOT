"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kvGet = kvGet;
exports.kvSet = kvSet;
exports.kvDel = kvDel;
exports.kvIncr = kvIncr;
exports.kvExpire = kvExpire;
/**
 * Simple key-value store backed by SQLite sessions table.
 * Replaces the Redis abstraction — all calls are synchronous.
 */
const index_1 = require("./index");
function isExpired(expiresAt) {
    if (!expiresAt)
        return false;
    return new Date(expiresAt) < new Date();
}
function kvGet(key) {
    const row = index_1.db.prepare('SELECT value, expires_at FROM sessions WHERE key = ?').get(key);
    if (!row)
        return null;
    if (isExpired(row.expires_at)) {
        index_1.db.prepare('DELETE FROM sessions WHERE key = ?').run(key);
        return null;
    }
    return row.value;
}
function kvSet(key, value, ttlSeconds) {
    const expiresAt = ttlSeconds
        ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
        : null;
    index_1.db.prepare(`INSERT OR REPLACE INTO sessions (key, value, expires_at, updated_at) VALUES (?, ?, ?, datetime('now'))`).run(key, value, expiresAt);
}
function kvDel(key) {
    index_1.db.prepare('DELETE FROM sessions WHERE key = ?').run(key);
}
function kvIncr(key) {
    const row = index_1.db.prepare('SELECT value, expires_at FROM sessions WHERE key = ?').get(key);
    const val = parseInt(row?.value ?? '0') + 1;
    index_1.db.prepare(`INSERT OR REPLACE INTO sessions (key, value, expires_at, updated_at) VALUES (?, ?, ?, datetime('now'))`).run(key, String(val), row?.expires_at ?? null);
    return val;
}
function kvExpire(key, seconds) {
    const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
    index_1.db.prepare('UPDATE sessions SET expires_at = ? WHERE key = ?').run(expiresAt, key);
}
//# sourceMappingURL=kv.js.map