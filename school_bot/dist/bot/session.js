"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSessionMiddleware = buildSessionMiddleware;
const telegraf_1 = require("telegraf");
const client_1 = require("../db/client");
/**
 * SQLite-backed session store for Telegraf.
 * Implements the { get, set, delete } interface expected by telegraf session().
 */
function createSqliteStore() {
    return {
        get(key) {
            const db = (0, client_1.getDb)();
            const row = db
                .prepare('SELECT data FROM sessions WHERE key = ?')
                .get(key);
            if (!row)
                return undefined;
            try {
                return JSON.parse(row.data);
            }
            catch {
                return undefined;
            }
        },
        set(key, value) {
            (0, client_1.getDb)()
                .prepare('INSERT INTO sessions (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data')
                .run(key, JSON.stringify(value));
        },
        delete(key) {
            (0, client_1.getDb)().prepare('DELETE FROM sessions WHERE key = ?').run(key);
        },
    };
}
function buildSessionMiddleware() {
    return (0, telegraf_1.session)({ store: createSqliteStore() });
}
//# sourceMappingURL=session.js.map