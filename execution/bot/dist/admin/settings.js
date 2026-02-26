"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSetting = getSetting;
exports.setSetting = setSetting;
exports.deleteSetting = deleteSetting;
/**
 * SQLite-backed settings store — persists across restarts.
 * Admin bot writes here; main bot reads dynamically every call.
 */
const db_1 = require("../db");
function getSetting(key) {
    const row = db_1.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row?.value ?? null;
}
function setSetting(key, value) {
    db_1.db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`).run(key, value);
}
function deleteSetting(key) {
    db_1.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}
//# sourceMappingURL=settings.js.map