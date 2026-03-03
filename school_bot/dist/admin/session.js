"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAdminSessionMiddleware = buildAdminSessionMiddleware;
const telegraf_1 = require("telegraf");
const client_1 = require("../db/client");
function createAdminSqliteStore() {
    return {
        get(key) {
            const row = (0, client_1.getDb)()
                .prepare('SELECT data FROM sessions_admin WHERE key = ?')
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
                .prepare(`INSERT INTO sessions_admin (key, data) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET data = excluded.data`)
                .run(key, JSON.stringify(value));
        },
        delete(key) {
            (0, client_1.getDb)().prepare('DELETE FROM sessions_admin WHERE key = ?').run(key);
        },
    };
}
function buildAdminSessionMiddleware() {
    return (0, telegraf_1.session)({ store: createAdminSqliteStore() });
}
//# sourceMappingURL=session.js.map