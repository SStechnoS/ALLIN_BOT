import 'dotenv/config';
import path from 'path';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function requiredJson(key: string): string {
  const value = required(key);
  try {
    JSON.parse(value);
  } catch {
    throw new Error(`Env var ${key} must be valid JSON`);
  }
  return value;
}

export const config = {
  bot: {
    token: required('BOT_TOKEN'),
  },
  db: {
    path: path.resolve(process.env['DB_PATH'] ?? './data/bot.db'),
  },
  google: {
    calendarId: required('GOOGLE_CALENDAR_ID'),
    serviceAccountJson: requiredJson('GOOGLE_SERVICE_ACCOUNT_JSON'),
    sheetsId: process.env['GOOGLE_SHEETS_ID'] ?? '',
  },
  zoom: {
    accountId: required('ZOOM_ACCOUNT_ID'),
    clientId: required('ZOOM_CLIENT_ID'),
    clientSecret: required('ZOOM_CLIENT_SECRET'),
  },
  privacyPolicyUrl: required('PRIVACY_POLICY_URL'),
  timezone: process.env['TIMEZONE'] ?? 'Europe/Moscow',
  env: (process.env['NODE_ENV'] ?? 'development') as 'development' | 'production',
  isDev: (process.env['NODE_ENV'] ?? 'development') === 'development',
} as const;
