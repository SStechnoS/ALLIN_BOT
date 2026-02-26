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
}

export interface BookingRow {
  id: number;
  user_id: number;
  calendar_event_id: string;
  booked_at: number;
  event_start: number;
  event_end: number;
  zoom_link: string | null;
}

export interface CreateUserInput {
  telegramId: number;
  telegramName: string | null;
  phone: string | null;
  email: string | null;
  name: string;
}

export interface CreateBookingInput {
  userId: number;
  calendarEventId: string;
  eventStart: number;
  eventEnd: number;
  zoomLink?: string;
}

export function getUserByTelegramId(telegramId: number): UserRow | undefined {
  return getDb()
    .prepare<[number], UserRow>('SELECT * FROM users WHERE telegram_id = ?')
    .get(telegramId);
}

export function createUser(data: CreateUserInput): UserRow {
  const result = getDb()
    .prepare<[number, string | null, string | null, string | null, string], UserRow>(
      `INSERT INTO users (telegram_id, telegram_name, phone, email, name, consent_at)
       VALUES (?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(telegram_id) DO UPDATE SET
         telegram_name = excluded.telegram_name,
         phone         = excluded.phone,
         email         = excluded.email,
         name          = excluded.name,
         consent_at    = excluded.consent_at
       RETURNING *`,
    )
    .get(data.telegramId, data.telegramName, data.phone, data.email, data.name);

  if (!result) throw new Error('createUser: RETURNING returned nothing');
  return result;
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
      `INSERT INTO bookings (user_id, calendar_event_id, event_start, event_end, zoom_link)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(data.userId, data.calendarEventId, data.eventStart, data.eventEnd, data.zoomLink ?? null);
}
