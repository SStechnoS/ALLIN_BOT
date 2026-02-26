import 'dotenv/config';
import path from 'path';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  bot: {
    token: required('BOT_TOKEN'),
  },
  db: {
    path: path.resolve(process.env['DB_PATH'] ?? './data/bot.db'),
  },
  env: (process.env['NODE_ENV'] ?? 'development') as 'development' | 'production',
  isDev: (process.env['NODE_ENV'] ?? 'development') === 'development',
} as const;
