/**
 * In-memory session store — replaces Redis/ioredis.
 * Sessions persist only during process lifetime (reset on restart).
 * For a small school bot this is acceptable.
 */
import { logger } from './logger'

const store = new Map<string, string>()
const expireTimers = new Map<string, NodeJS.Timeout>()

export const redis = {
  get: (key: string): Promise<string | null> =>
    Promise.resolve(store.get(key) ?? null),

  set: (key: string, value: string, ..._args: any[]): Promise<string> => {
    store.set(key, value)
    return Promise.resolve('OK')
  },

  del: (key: string): Promise<number> => {
    const existed = store.delete(key)
    return Promise.resolve(existed ? 1 : 0)
  },

  incr: (key: string): Promise<number> => {
    const val = parseInt(store.get(key) ?? '0') + 1
    store.set(key, String(val))
    return Promise.resolve(val)
  },

  expire: (key: string, seconds: number): Promise<number> => {
    const existing = expireTimers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => { store.delete(key); expireTimers.delete(key) }, seconds * 1000)
    expireTimers.set(key, timer)
    return Promise.resolve(1)
  },

  quit: (): Promise<void> => {
    store.clear()
    logger.info('Session store cleared')
    return Promise.resolve()
  },
}
