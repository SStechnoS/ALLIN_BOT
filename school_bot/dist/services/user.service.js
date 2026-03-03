"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserByTelegramId = getUserByTelegramId;
exports.createOrGetUser = createOrGetUser;
exports.finalizeUser = finalizeUser;
exports.updateUserSheetsRow = updateUserSheetsRow;
exports.getUserBooking = getUserBooking;
exports.deleteUserBooking = deleteUserBooking;
exports.confirmLesson = confirmLesson;
exports.createBooking = createBooking;
const client_1 = require("../db/client");
function getUserByTelegramId(telegramId) {
    return (0, client_1.getDb)()
        .prepare('SELECT * FROM users WHERE telegram_id = ?')
        .get(telegramId);
}
/**
 * Inserts a minimal user row on first contact (telegram data only).
 * If the user already exists, updates telegram_name and returns the existing record.
 */
function createOrGetUser(telegramId, telegramName) {
    const result = (0, client_1.getDb)()
        .prepare(`INSERT INTO users (telegram_id, telegram_name)
       VALUES (?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET telegram_name = excluded.telegram_name
       RETURNING *`)
        .get(telegramId, telegramName);
    if (!result)
        throw new Error('createOrGetUser: RETURNING returned nothing');
    return result;
}
/**
 * Completes the user's profile after onboarding collects phone, email, and name.
 */
function finalizeUser(userId, data) {
    (0, client_1.getDb)()
        .prepare(`UPDATE users SET phone = ?, email = ?, name = ?, consent_at = unixepoch() WHERE id = ?`)
        .run(data.phone, data.email, data.name, userId);
}
function updateUserSheetsRow(userId, sheetsRow) {
    (0, client_1.getDb)()
        .prepare('UPDATE users SET sheets_row = ? WHERE id = ?')
        .run(sheetsRow, userId);
}
function getUserBooking(userId) {
    return (0, client_1.getDb)()
        .prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY booked_at DESC LIMIT 1')
        .get(userId);
}
function deleteUserBooking(userId) {
    (0, client_1.getDb)().prepare('DELETE FROM bookings WHERE user_id = ?').run(userId);
}
function confirmLesson(userId) {
    (0, client_1.getDb)()
        .prepare('UPDATE bookings SET lesson_confirmed_at = unixepoch() WHERE user_id = ?')
        .run(userId);
}
function createBooking(data) {
    (0, client_1.getDb)()
        .prepare(`INSERT INTO bookings (user_id, calendar_event_id, event_start, event_end, zoom_link, zoom_meeting_id)
       VALUES (?, ?, ?, ?, ?, ?)`)
        .run(data.userId, data.calendarEventId, data.eventStart, data.eventEnd, data.zoomLink ?? null, data.zoomMeetingId ?? null);
}
//# sourceMappingURL=user.service.js.map