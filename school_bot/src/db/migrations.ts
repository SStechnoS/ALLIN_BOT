import Database from 'better-sqlite3';
import { logger } from '../logger';

/**
 * Add new migrations to the END of this array only.
 * Never edit or remove existing entries — increment version instead.
 */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        key   TEXT PRIMARY KEY,
        data  TEXT NOT NULL DEFAULT '{}'
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id   INTEGER UNIQUE NOT NULL,
        telegram_name TEXT,
        phone         TEXT,
        email         TEXT,
        name          TEXT,
        consent_at    INTEGER,
        created_at    INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id            INTEGER NOT NULL REFERENCES users(id),
        calendar_event_id  TEXT NOT NULL,
        booked_at          INTEGER NOT NULL DEFAULT (unixepoch()),
        event_start        INTEGER NOT NULL,
        event_end          INTEGER NOT NULL
      );
    `,
  },
  {
    version: 3,
    sql: `ALTER TABLE bookings ADD COLUMN zoom_link TEXT;`,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE users ADD COLUMN sheets_row INTEGER;
      ALTER TABLE bookings ADD COLUMN zoom_meeting_id TEXT;
    `,
  },
  {
    version: 5,
    sql: `
      ALTER TABLE bookings ADD COLUMN lesson_confirmed_at INTEGER;

      CREATE TABLE IF NOT EXISTS jobs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        type         TEXT NOT NULL,
        tg_id        INTEGER NOT NULL,
        scheduled_at INTEGER NOT NULL,
        payload      TEXT NOT NULL DEFAULT '{}',
        sent_at      INTEGER,
        cancelled_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_due
        ON jobs (scheduled_at)
        WHERE sent_at IS NULL AND cancelled_at IS NULL;
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const getApplied = db.prepare<[], { version: number }>(
    'SELECT version FROM _migrations ORDER BY version',
  );
  const applied = new Set(getApplied.all().map((r) => r.version));

  const insert = db.prepare('INSERT INTO _migrations (version) VALUES (?)');

  const pending = MIGRATIONS.filter((m) => !applied.has(m.version));
  if (!pending.length) return;

  const runAll = db.transaction(() => {
    for (const m of pending) {
      db.exec(m.sql);
      insert.run(m.version);
      logger.info(`Migration applied`, { version: m.version });
    }
  });

  runAll();
}
