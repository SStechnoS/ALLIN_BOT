import { getDb } from '../db/client';

export interface AdminRow {
  id: number;
  telegram_id: number;
  telegram_name: string | null;
  created_at: number;
}

export interface UserWithBooking {
  id: number;
  telegram_id: number;
  telegram_name: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  created_at: number;
  sheets_row: number | null;
  // nullable — from LEFT JOIN with most-recent booking
  booking_id: number | null;
  event_start: number | null;
  event_end: number | null;
  lesson_confirmed_at: number | null;
  attended: number | null; // 1 = yes, 0 = no, null = unknown
}

export interface ScheduleRow {
  name: string | null;
  phone: string | null;
  email: string | null;
  telegram_name: string | null;
  telegram_id: number;
  event_start: number;
  event_end: number;
  zoom_link: string | null;
  lesson_confirmed_at: number | null;
}

export interface PeriodStats {
  new_users: number;
  new_bookings: number;
  attended: number;
  not_attended: number;
  upcoming: number;
}

// ── Admin CRUD ────────────────────────────────────────────────────────────────

export function getAdminByTelegramId(telegramId: number): AdminRow | undefined {
  return getDb()
    .prepare<[number], AdminRow>('SELECT * FROM admins WHERE telegram_id = ?')
    .get(telegramId);
}

export function createAdmin(telegramId: number, telegramName: string | null): void {
  getDb()
    .prepare(
      `INSERT INTO admins (telegram_id, telegram_name)
       VALUES (?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET telegram_name = excluded.telegram_name`,
    )
    .run(telegramId, telegramName);
}

export function getAllAdmins(): AdminRow[] {
  return getDb().prepare<[], AdminRow>('SELECT * FROM admins').all();
}

// ── Period stats ──────────────────────────────────────────────────────────────

/**
 * Returns stats for a time period.
 * Pass since=undefined for all-time (no date filter).
 */
export function getStatsByPeriod(since?: number, until?: number): PeriodStats {
  const db = getDb();
  const end = until ?? Math.floor(Date.now() / 1000);

  const count = (sql: string): number =>
    (db.prepare<[], { n: number }>(sql).get()?.n) ?? 0;

  const countRange = (sql: string, s: number, e: number): number =>
    (db.prepare<[number, number], { n: number }>(sql).get(s, e)?.n) ?? 0;

  const upcoming = count(
    'SELECT COUNT(*) as n FROM bookings WHERE event_start > unixepoch()',
  );

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
    new_users: countRange(
      'SELECT COUNT(*) as n FROM users WHERE name IS NOT NULL AND consent_at >= ? AND consent_at <= ?',
      since, end,
    ),
    new_bookings: countRange(
      'SELECT COUNT(*) as n FROM bookings WHERE booked_at >= ? AND booked_at <= ?',
      since, end,
    ),
    attended: countRange(
      'SELECT COUNT(*) as n FROM bookings WHERE event_start >= ? AND event_start <= ? AND attended = 1',
      since, end,
    ),
    not_attended: countRange(
      'SELECT COUNT(*) as n FROM bookings WHERE event_start >= ? AND event_start <= ? AND attended = 0',
      since, end,
    ),
    upcoming,
  };
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export function getUpcomingSchedule(): ScheduleRow[] {
  return getDb()
    .prepare<[], ScheduleRow>(
      `SELECT u.name, u.phone, u.email, u.telegram_name, u.telegram_id,
              b.event_start, b.event_end, b.zoom_link, b.lesson_confirmed_at
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       WHERE b.event_start > unixepoch()
       ORDER BY b.event_start ASC
       LIMIT 20`,
    )
    .all();
}

// ── User pagination ───────────────────────────────────────────────────────────

export function getRegisteredUserCount(): number {
  return (
    getDb()
      .prepare<[], { n: number }>("SELECT COUNT(*) as n FROM users WHERE name IS NOT NULL")
      .get()?.n ?? 0
  );
}

export function getUserAtOffset(offset: number): UserWithBooking | undefined {
  return getDb()
    .prepare<[number], UserWithBooking>(
      `SELECT u.id, u.telegram_id, u.telegram_name, u.name, u.phone, u.email,
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
       LIMIT 1 OFFSET ?`,
    )
    .get(offset);
}

export function setAttended(bookingId: number, attended: boolean): void {
  getDb()
    .prepare('UPDATE bookings SET attended = ? WHERE id = ?')
    .run(attended ? 1 : 0, bookingId);
}

// ── Search ────────────────────────────────────────────────────────────────────

export function searchUsers(query: string): UserWithBooking[] {
  const like = `%${query}%`;
  return getDb()
    .prepare<[string, string, string, string, string], UserWithBooking>(
      `SELECT u.id, u.telegram_id, u.telegram_name, u.name, u.phone, u.email,
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
       LIMIT 10`,
    )
    .all(like, like, like, like, query);
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

export function getUsersForBroadcast(target: 'all' | 'unconfirmed'): { telegram_id: number }[] {
  if (target === 'all') {
    return getDb()
      .prepare<[], { telegram_id: number }>(
        "SELECT telegram_id FROM users WHERE name IS NOT NULL",
      )
      .all();
  }
  return getDb()
    .prepare<[], { telegram_id: number }>(
      `SELECT DISTINCT u.telegram_id FROM users u
       JOIN bookings b ON b.user_id = u.id
       WHERE b.event_start < unixepoch() AND b.lesson_confirmed_at IS NULL`,
    )
    .all();
}
