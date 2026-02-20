import 'dotenv/config'

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function optional(key: string, defaultValue = ''): string {
  return process.env[key] || defaultValue
}

export const config = {
  // Telegram
  BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  ADMIN_GROUP_ID: required('TELEGRAM_ADMIN_GROUP_ID'),
  MANAGER_USERNAME: required('TELEGRAM_MANAGER_USERNAME'),
  BOT_LINK: optional('BOT_LINK'),
  WELCOME_VIDEO_FILE_ID: optional('WELCOME_VIDEO_FILE_ID'),

  // OpenAI
  OPENAI_API_KEY: required('OPENAI_API_KEY'),

  // Zoom (optional в development — настраивается на этапе деплоя)
  ZOOM_ACCOUNT_ID: optional('ZOOM_ACCOUNT_ID'),
  ZOOM_CLIENT_ID: optional('ZOOM_CLIENT_ID'),
  ZOOM_CLIENT_SECRET: optional('ZOOM_CLIENT_SECRET'),

  // Google
  GOOGLE_SERVICE_ACCOUNT_JSON: required('GOOGLE_SERVICE_ACCOUNT_JSON'),
  GOOGLE_SHEETS_ID: required('GOOGLE_SHEETS_ID'),
  GOOGLE_CALENDAR_ID: required('GOOGLE_CALENDAR_ID'),

  // Resend
  RESEND_API_KEY: required('RESEND_API_KEY'),
  RESEND_FROM_EMAIL: optional('RESEND_FROM_EMAIL', 'hello@allinacademy.ee'),
  RESEND_FROM_NAME: optional('RESEND_FROM_NAME', 'All In Academy'),

  // App
  NODE_ENV: optional('NODE_ENV', 'development'),
  APP_PORT: parseInt(optional('APP_PORT', '3000')),
  WEBHOOK_HOST: optional('WEBHOOK_HOST'),
  TILDA_WEBHOOK_SECRET: required('TILDA_WEBHOOK_SECRET'),
  INTERNAL_SECRET: required('INTERNAL_SECRET'),

  // Computed
  get IS_PRODUCTION() { return this.NODE_ENV === 'production' },
  get MANAGER_LINK() { return `https://t.me/${this.MANAGER_USERNAME.replace('@', '')}` },
} as const
