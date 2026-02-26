/**
 * Simple key-value store backed by SQLite sessions table.
 * Replaces the Redis abstraction — all calls are synchronous.
 */
import { db } from './index'

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

export function kvGet(key: string): string | null {
  const row = db.prepare('SELECT value, expires_at FROM sessions WHERE key = ?').get(key) as any
  if (!row) return null
  if (isExpired(row.expires_at)) {
    db.prepare('DELETE FROM sessions WHERE key = ?').run(key)
    return null
  }
  return row.value
}

export function kvSet(key: string, value: string, ttlSeconds?: number): void {
  const expiresAt = ttlSeconds
    ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
    : null
  db.prepare(
    `INSERT OR REPLACE INTO sessions (key, value, expires_at, updated_at) VALUES (?, ?, ?, datetime('now'))`
  ).run(key, value, expiresAt)
}

export function kvDel(key: string): void {
  db.prepare('DELETE FROM sessions WHERE key = ?').run(key)
}

export function kvIncr(key: string): number {
  const row = db.prepare('SELECT value, expires_at FROM sessions WHERE key = ?').get(key) as any
  const val = parseInt(row?.value ?? '0') + 1
  db.prepare(
    `INSERT OR REPLACE INTO sessions (key, value, expires_at, updated_at) VALUES (?, ?, ?, datetime('now'))`
  ).run(key, String(val), row?.expires_at ?? null)
  return val
}

export function kvExpire(key: string, seconds: number): void {
  const expiresAt = new Date(Date.now() + seconds * 1000).toISOString()
  db.prepare('UPDATE sessions SET expires_at = ? WHERE key = ?').run(expiresAt, key)
}
