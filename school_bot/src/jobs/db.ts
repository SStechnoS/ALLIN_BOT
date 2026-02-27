import { getDb } from '../db/client';

export type JobType = 'nudge' | 'remind_24h' | 'remind_5h' | 'remind_30min' | 'admin_alert_4h';

export interface JobRow {
  id: number;
  type: string;
  tg_id: number;
  scheduled_at: number;
  payload: string;
  sent_at: number | null;
  cancelled_at: number | null;
}

export function insertJob(
  type: JobType,
  tgId: number,
  scheduledAt: number,
  payload: object = {},
): void {
  getDb()
    .prepare(
      'INSERT INTO jobs (type, tg_id, scheduled_at, payload) VALUES (?, ?, ?, ?)',
    )
    .run(type, tgId, scheduledAt, JSON.stringify(payload));
}

export function getDueJobs(): JobRow[] {
  const now = Math.floor(Date.now() / 1000);
  return getDb()
    .prepare<[number], JobRow>(
      `SELECT * FROM jobs
       WHERE scheduled_at <= ? AND sent_at IS NULL AND cancelled_at IS NULL
       ORDER BY scheduled_at ASC
       LIMIT 50`,
    )
    .all(now);
}

export function markJobSent(id: number): void {
  getDb().prepare('UPDATE jobs SET sent_at = unixepoch() WHERE id = ?').run(id);
}

export function cancelJobsByTypes(tgId: number, types: JobType[]): void {
  if (!types.length) return;
  const placeholders = types.map(() => '?').join(',');
  getDb()
    .prepare(
      `UPDATE jobs SET cancelled_at = unixepoch()
       WHERE tg_id = ? AND type IN (${placeholders})
         AND sent_at IS NULL AND cancelled_at IS NULL`,
    )
    .run(tgId, ...types);
}
