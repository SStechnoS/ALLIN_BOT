import { session, Scenes } from 'telegraf';
import { getDb } from '../db/client';
import type { SessionData, BotContext } from '../types';

type StoreSession = Scenes.SceneSession<SessionData>;

/**
 * SQLite-backed session store for Telegraf.
 * Implements the { get, set, delete } interface expected by telegraf session().
 */
function createSqliteStore() {
  return {
    get(key: string): StoreSession | undefined {
      const db = getDb();
      const row = db
        .prepare<[string], { data: string }>('SELECT data FROM sessions WHERE key = ?')
        .get(key);
      if (!row) return undefined;
      try {
        return JSON.parse(row.data) as StoreSession;
      } catch {
        return undefined;
      }
    },

    set(key: string, value: StoreSession): void {
      getDb()
        .prepare('INSERT INTO sessions (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data')
        .run(key, JSON.stringify(value));
    },

    delete(key: string): void {
      getDb().prepare('DELETE FROM sessions WHERE key = ?').run(key);
    },
  };
}

export function buildSessionMiddleware() {
  return session<StoreSession, BotContext>({ store: createSqliteStore() });
}
