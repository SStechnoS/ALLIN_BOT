"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminByTelegramId = getAdminByTelegramId;
exports.createAdmin = createAdmin;
exports.getAllAdmins = getAllAdmins;
exports.getStatsByPeriod = getStatsByPeriod;
exports.getUpcomingSchedule = getUpcomingSchedule;
exports.getRegisteredUserCount = getRegisteredUserCount;
exports.getUserAtOffset = getUserAtOffset;
exports.setAttended = setAttended;
exports.getFilteredUserCount = getFilteredUserCount;
exports.getUserAtOffsetFiltered = getUserAtOffsetFiltered;
exports.searchUsers = searchUsers;
exports.getUserEmailsForBroadcast = getUserEmailsForBroadcast;
exports.getUsersForBroadcast = getUsersForBroadcast;
const client_1 = require("../db/client");
// ── Admin CRUD ────────────────────────────────────────────────────────────────
function getAdminByTelegramId(telegramId) {
    return (0, client_1.getDb)()
        .prepare('SELECT * FROM admins WHERE telegram_id = ?')
        .get(telegramId);
}
function createAdmin(telegramId, telegramName) {
    (0, client_1.getDb)()
        .prepare(`INSERT INTO admins (telegram_id, telegram_name)
       VALUES (?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET telegram_name = excluded.telegram_name`)
        .run(telegramId, telegramName);
}
function getAllAdmins() {
    return (0, client_1.getDb)().prepare('SELECT * FROM admins').all();
}
// ── Period stats ──────────────────────────────────────────────────────────────
/**
 * Returns stats for a time period.
 * Pass since=undefined for all-time (no date filter).
 */
function getStatsByPeriod(since, until) {
    const db = (0, client_1.getDb)();
    const end = until ?? Math.floor(Date.now() / 1000);
    const count = (sql) => (db.prepare(sql).get()?.n) ?? 0;
    const countRange = (sql, s, e) => (db.prepare(sql).get(s, e)?.n) ?? 0;
    const upcoming = count('SELECT COUNT(*) as n FROM bookings WHERE event_start > unixepoch()');
    if (since === undefined) {
        return {
            new_users: count("SELECT COUNT(*) as n FROM users WHERE name IS NOT NULL"),
            new_bookings: count('SELECT COUNT(*) as n FROM bookings'),
            attended: count('SELECT COUNT(*) as n FROM bookings WHERE attended = 1'),
            not_attended: count('SELECT COUNT(*) as n FROM bookings WHERE attended = 0'),
            upcoming,
        };
    }
    return {
        new_users: countRange('SELECT COUNT(*) as n FROM users WHERE name IS NOT NULL AND consent_at >= ? AND consent_at <= ?', since, end),
        new_bookings: countRange('SELECT COUNT(*) as n FROM bookings WHERE booked_at >= ? AND booked_at <= ?', since, end),
        attended: countRange('SELECT COUNT(*) as n FROM bookings WHERE event_start >= ? AND event_start <= ? AND attended = 1', since, end),
        not_attended: countRange('SELECT COUNT(*) as n FROM bookings WHERE event_start >= ? AND event_start <= ? AND attended = 0', since, end),
        upcoming,
    };
}
// ── Schedule ──────────────────────────────────────────────────────────────────
function getUpcomingSchedule() {
    return (0, client_1.getDb)()
        .prepare(`SELECT u.name, u.phone, u.email, u.telegram_name, u.telegram_id,
              b.event_start, b.event_end, b.zoom_link, b.lesson_confirmed_at
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       WHERE b.event_start > unixepoch()
       ORDER BY b.event_start ASC
       LIMIT 20`)
        .all();
}
// ── User pagination ───────────────────────────────────────────────────────────
function getRegisteredUserCount() {
    return ((0, client_1.getDb)()
        .prepare("SELECT COUNT(*) as n FROM users WHERE name IS NOT NULL")
        .get()?.n ?? 0);
}
function getUserAtOffset(offset) {
    return (0, client_1.getDb)()
        .prepare(`SELECT u.id, u.telegram_id, u.telegram_name, u.name, u.phone, u.email,
              u.created_at, u.sheets_row,
              b.id   AS booking_id,
              b.event_start, b.event_end,
              b.lesson_confirmed_at, b.attended
       FROM users u
       LEFT JOIN bookings b ON b.id = (
         SELECT id FROM bookings bsub
         WHERE bsub.user_id = u.id
         ORDER BY bsub.booked_at DESC LIMIT 1
       )
       WHERE u.name IS NOT NULL
       ORDER BY u.created_at DESC
       LIMIT 1 OFFSET ?`)
        .get(offset);
}
function setAttended(bookingId, attended) {
    (0, client_1.getDb)()
        .prepare('UPDATE bookings SET attended = ? WHERE id = ?')
        .run(attended ? 1 : 0, bookingId);
}
// ── Filtered user pagination (by booking period) ─────────────────────────────
function getFilteredUserCount(since, until) {
    if (since === undefined)
        return getRegisteredUserCount();
    return ((0, client_1.getDb)()
        .prepare(`SELECT COUNT(DISTINCT u.id) as n FROM users u
         JOIN bookings b ON b.user_id = u.id
         WHERE u.name IS NOT NULL AND b.event_start >= ? AND b.event_start <= ?`)
        .get(since, until)?.n ?? 0);
}
function getUserAtOffsetFiltered(offset, since, until) {
    if (since === undefined)
        return getUserAtOffset(offset);
    return (0, client_1.getDb)()
        .prepare(`SELECT u.id, u.telegram_id, u.telegram_name, u.name, u.phone, u.email,
              u.created_at, u.sheets_row,
              b.id   AS booking_id,
              b.event_start, b.event_end,
              b.lesson_confirmed_at, b.attended
       FROM users u
       JOIN bookings b ON b.user_id = u.id
       WHERE u.name IS NOT NULL AND b.event_start >= ? AND b.event_start <= ?
       ORDER BY u.created_at DESC
       LIMIT 1 OFFSET ?`)
        .get(since, until, offset);
}
// ── Search ────────────────────────────────────────────────────────────────────
function searchUsers(query) {
    const like = `%${query}%`;
    return (0, client_1.getDb)()
        .prepare(`SELECT u.id, u.telegram_id, u.telegram_name, u.name, u.phone, u.email,
              u.created_at, u.sheets_row,
              b.id   AS booking_id,
              b.event_start, b.event_end,
              b.lesson_confirmed_at, b.attended
       FROM users u
       LEFT JOIN bookings b ON b.id = (
         SELECT id FROM bookings bsub
         WHERE bsub.user_id = u.id
         ORDER BY bsub.booked_at DESC LIMIT 1
       )
       WHERE u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?
          OR u.telegram_name LIKE ? OR CAST(u.telegram_id AS TEXT) = ?
       ORDER BY u.created_at DESC
       LIMIT 10`)
        .all(like, like, like, like, query);
}
function getUserEmailsForBroadcast(target) {
    if (target === "all") {
        return (0, client_1.getDb)()
            .prepare("SELECT email, name FROM users WHERE name IS NOT NULL AND email IS NOT NULL")
            .all();
    }
    return (0, client_1.getDb)()
        .prepare(`SELECT DISTINCT u.email, u.name FROM users u
       JOIN bookings b ON b.user_id = u.id
       WHERE b.event_start < unixepoch() AND b.lesson_confirmed_at IS NULL
         AND u.email IS NOT NULL`)
        .all();
}
function getUsersForBroadcast(target) {
    if (target === 'all') {
        return (0, client_1.getDb)()
            .prepare("SELECT telegram_id FROM users WHERE name IS NOT NULL")
            .all();
    }
    return (0, client_1.getDb)()
        .prepare(`SELECT DISTINCT u.telegram_id FROM users u
       JOIN bookings b ON b.user_id = u.id
       WHERE b.event_start < unixepoch() AND b.lesson_confirmed_at IS NULL`)
        .all();
}
//# sourceMappingURL=db.js.map