import Database from 'better-sqlite3';
import { config } from '../config';
import { logger } from '../logger';
import { runMigrations } from './migrations';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) throw new Error('DB not initialised. Call initDb() first.');
  return _db;
}

export function initDb(): Database.Database {
  _db = new Database(config.db.path);

  // WAL mode: better concurrency + crash safety for SQLite
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  runMigrations(_db);
  logger.info('Database ready', { path: config.db.path });

  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
