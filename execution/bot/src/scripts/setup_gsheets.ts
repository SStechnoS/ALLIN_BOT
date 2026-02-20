/**
 * Первоначальная настройка Google Sheets
 * Запуск: npm run setup:sheets
 */
import 'dotenv/config'
import { google } from 'googleapis'
import { config } from '../config'

const LEADS_HEADERS = [
  'id', 'created_at', 'name', 'phone', 'email', 'child_age',
  'tg_id', 'tg_username', 'source', 'bot_activated', 'bot_activated_at',
  'lesson_date', 'lesson_time', 'lesson_datetime', 'zoom_link', 'zoom_meeting_id',
  'confirmed', 'confirmed_at', 'email_1_sent', 'email_1_sent_at',
  'email_2_sent', 'email_2_sent_at', 'gdpr_accepted', 'gdpr_accepted_at',
  'status', 'manager_notes', 'last_updated'
]

const LOG_HEADERS = ['timestamp', 'lead_id', 'event_type', 'details', 'actor']

async function setup() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })

  const sheets = google.sheets({ version: 'v4', auth })

  console.log('Setting up Google Sheets headers...')

  // Заголовки leads
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.GOOGLE_SHEETS_ID,
    range: 'leads!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [LEADS_HEADERS] }
  })
  console.log('✅ leads sheet headers set')

  // Заголовки admin_log
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.GOOGLE_SHEETS_ID,
    range: 'admin_log!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [LOG_HEADERS] }
  })
  console.log('✅ admin_log sheet headers set')

  console.log('\nSetup complete! Now:')
  console.log('1. Open the Google Sheets document')
  console.log('2. Rename Sheet1 to "leads"')
  console.log('3. Create a new sheet called "admin_log"')
  console.log('4. Apply conditional formatting for status column (Y)')
}

setup().catch(console.error)
