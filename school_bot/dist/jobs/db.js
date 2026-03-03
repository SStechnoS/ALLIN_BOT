"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertJob = insertJob;
exports.getDueJobs = getDueJobs;
exports.markJobSent = markJobSent;
exports.cancelJobsByTypes = cancelJobsByTypes;
const client_1 = require("../db/client");
function insertJob(type, tgId, scheduledAt, payload = {}) {
    (0, client_1.getDb)()
        .prepare('INSERT INTO jobs (type, tg_id, scheduled_at, payload) VALUES (?, ?, ?, ?)')
        .run(type, tgId, scheduledAt, JSON.stringify(payload));
}
function getDueJobs() {
    const now = Math.floor(Date.now() / 1000);
    return (0, client_1.getDb)()
        .prepare(`SELECT * FROM jobs
       WHERE scheduled_at <= ? AND sent_at IS NULL AND cancelled_at IS NULL
       ORDER BY scheduled_at ASC
       LIMIT 50`)
        .all(now);
}
function markJobSent(id) {
    (0, client_1.getDb)().prepare('UPDATE jobs SET sent_at = unixepoch() WHERE id = ?').run(id);
}
function cancelJobsByTypes(tgId, types) {
    if (!types.length)
        return;
    const placeholders = types.map(() => '?').join(',');
    (0, client_1.getDb)()
        .prepare(`UPDATE jobs SET cancelled_at = unixepoch()
       WHERE tg_id = ? AND type IN (${placeholders})
         AND sent_at IS NULL AND cancelled_at IS NULL`)
        .run(tgId, ...types);
}
//# sourceMappingURL=db.js.map