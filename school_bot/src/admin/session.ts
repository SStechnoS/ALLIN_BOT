import { session, Scenes } from 'telegraf';
import { getDb } from '../db/client';
import type { AdminSession, AdminBotContext } from './types';

function createAdminSqliteStore() {
  return {
    get(key: string): AdminSession | undefined {
      const row = getDb()
        .prepare<[string], { data: string }>('SELECT data FROM sessions_admin WHERE key = ?')
        .get(key);
      if (!row) return undefined;
      try {
        return JSON.parse(row.data) as AdminSession;
      } catch {
        return undefined;
      }
    },

    set(key: string, value: AdminSession): void {
      getDb()
        .prepare(
          `INSERT INTO sessions_admin (key, data) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET data = excluded.data`,
        )
        .run(key, JSON.stringify(value));
    },

    delete(key: string): void {
      getDb().prepare('DELETE FROM sessions_admin WHERE key = ?').run(key);
    },
  };
}

export function buildAdminSessionMiddleware() {
  return session<Scenes.SceneSession, AdminBotContext>({ store: createAdminSqliteStore() });
}
