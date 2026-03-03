"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const logger_1 = require("../logger");
/**
 * Add new migrations to the END of this array only.
 * Never edit or remove existing entries — increment version instead.
 */
const MIGRATIONS = [
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
    {
        version: 6,
        sql: `
      CREATE TABLE IF NOT EXISTS admins (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER UNIQUE NOT NULL,
        telegram_name TEXT,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS sessions_admin (
        key   TEXT PRIMARY KEY,
        data  TEXT NOT NULL DEFAULT '{}'
      );
    `,
    },
    {
        version: 7,
        sql: `
      ALTER TABLE bookings ADD COLUMN attended INTEGER;

      CREATE TABLE IF NOT EXISTS bot_messages (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );

      INSERT OR IGNORE INTO bot_messages (key, value) VALUES
        ('welcome_text', 'Добро пожаловать!\n\nДля записи на пробный урок нам необходимо сохранить ваши данные. Нажимая «Подтвердить», вы соглашаетесь с нашей политикой конфиденциальности.'),
        ('welcome_video_note_id', '');
    `,
    },
];
function runMigrations(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
    const getApplied = db.prepare('SELECT version FROM _migrations ORDER BY version');
    const applied = new Set(getApplied.all().map((r) => r.version));
    const insert = db.prepare('INSERT INTO _migrations (version) VALUES (?)');
    const pending = MIGRATIONS.filter((m) => !applied.has(m.version));
    if (!pending.length)
        return;
    const runAll = db.transaction(() => {
        for (const m of pending) {
            db.exec(m.sql);
            insert.run(m.version);
            logger_1.logger.info(`Migration applied`, { version: m.version });
        }
    });
    runAll();
}
//# sourceMappingURL=migrations.js.map