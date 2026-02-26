import { getDb } from '../db/client';

export interface UserRow {
  id: number;
  telegram_id: number;
  telegram_name: string | null;
  phone: string | null;
  email: string | null;
  name: string | null;
  consent_at: number | null;
  created_at: number;
  sheets_row: number | null;
}

export interface BookingRow {
  id: number;
  user_id: number;
  calendar_event_id: string;
  booked_at: number;
  event_start: number;
  event_end: number;
  zoom_link: string | null;
  zoom_meeting_id: string | null;
}

export interface CreateBookingInput {
  userId: number;
  calendarEventId: string;
  eventStart: number;
  eventEnd: number;
  zoomLink?: string;
  zoomMeetingId?: string;
}

export function getUserByTelegramId(telegramId: number): UserRow | undefined {
  return getDb()
    .prepare<[number], UserRow>('SELECT * FROM users WHERE telegram_id = ?')
    .get(telegramId);
}

/**
 * Inserts a minimal user row on first contact (telegram data only).
 * If the user already exists, updates telegram_name and returns the existing record.
 */
export function createOrGetUser(telegramId: number, telegramName: string | null): UserRow {
  const result = getDb()
    .prepare<[number, string | null], UserRow>(
      `INSERT INTO users (telegram_id, telegram_name)
       VALUES (?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET telegram_name = excluded.telegram_name
       RETURNING *`,
    )
    .get(telegramId, telegramName);

  if (!result) throw new Error('createOrGetUser: RETURNING returned nothing');
  return result;
}

/**
 * Completes the user's profile after onboarding collects phone, email, and name.
 */
export function finalizeUser(
  userId: number,
  data: { phone: string | null; email: string | null; name: string },
): void {
  getDb()
    .prepare(
      `UPDATE users SET phone = ?, email = ?, name = ?, consent_at = unixepoch() WHERE id = ?`,
    )
    .run(data.phone, data.email, data.name, userId);
}

export function updateUserSheetsRow(userId: number, sheetsRow: number): void {
  getDb()
    .prepare('UPDATE users SET sheets_row = ? WHERE id = ?')
    .run(sheetsRow, userId);
}

export function getUserBooking(userId: number): BookingRow | undefined {
  return getDb()
    .prepare<[number], BookingRow>(
      'SELECT * FROM bookings WHERE user_id = ? ORDER BY booked_at DESC LIMIT 1',
    )
    .get(userId);
}

export function deleteUserBooking(userId: number): void {
  getDb().prepare('DELETE FROM bookings WHERE user_id = ?').run(userId);
}

export function createBooking(data: CreateBookingInput): void {
  getDb()
    .prepare(
      `INSERT INTO bookings (user_id, calendar_event_id, event_start, event_end, zoom_link, zoom_meeting_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.userId,
      data.calendarEventId,
      data.eventStart,
      data.eventEnd,
      data.zoomLink ?? null,
      data.zoomMeetingId ?? null,
    );
}
