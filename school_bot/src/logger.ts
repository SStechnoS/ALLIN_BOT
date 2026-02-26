import { config } from './config';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, msg: string, meta?: unknown): void {
  if (level === 'debug' && !config.isDev) return;

  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  const line = meta !== undefined ? `${prefix} ${msg} ${JSON.stringify(meta)}` : `${prefix} ${msg}`;

  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
  debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
};
