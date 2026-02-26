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
  // next migration example:
  // { version: 2, sql: `ALTER TABLE sessions ADD COLUMN updated_at INTEGER;` },
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
