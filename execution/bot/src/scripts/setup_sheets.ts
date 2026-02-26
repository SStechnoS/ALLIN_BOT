/**
 * Однократный скрипт: настройка листов Google Sheets
 *
 * Запуск: npm run setup:sheets
 *
 * Что делает:
 * 1. Проверяет/создаёт лист 'leads' с заголовками
 * 2. Создаёт лист 'manager_view' с формулой (только важные поля)
 * 3. Создаёт лист 'admin_log' для истории событий
 * 4. Создаёт лист 'system' — оставляет пустым (технические данные)
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
  'status', 'manager_notes', 'last_updated', 'calendar_event_id',
  'push_count', 'attended', 'teacher_notes',
]

const LOG_HEADERS = ['timestamp', 'lead_id', 'event_type', 'details', 'actor']

// Формула manager_view: только нужные менеджеру колонки из leads
// Колонки: name(C), phone(D), email(E), child_age(F), tg_username(H),
//          status(Y), lesson_date(L), lesson_time(M), zoom_link(O), manager_notes(Z), created_at(B)
// Используем ; как разделитель аргументов (европейская/русская локаль Google Sheets)
// Внутри строки QUERY используются , (это SQL-синтаксис, не разделитель аргументов)
const MANAGER_VIEW_FORMULA = `=IFERROR(QUERY(leads!A:AB;"SELECT B,C,D,E,F,H,I,Y,L,M,O,Z ORDER BY B DESC LABEL B 'Создан',C 'Имя',D 'Телефон',E 'Email',F 'Возраст',H 'TG @username',I 'Источник',Y 'Статус',L 'Дата урока',M 'Время',O 'Zoom ссылка',Z 'Заметки'";1);"Нет данных")`

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = config.GOOGLE_SHEETS_ID

  // Получить список существующих листов
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existingSheets = meta.data.sheets?.map(s => s.properties?.title) || []
  console.log('Existing sheets:', existingSheets)

  const requests: any[] = []

  // Создать листы если их нет
  for (const title of ['leads', 'manager_view', 'admin_log', 'system']) {
    if (!existingSheets.includes(title)) {
      requests.push({ addSheet: { properties: { title } } })
      console.log(`Will create sheet: ${title}`)
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
    console.log('Sheets created')
  }

  // Добавить заголовки в leads (строка 1)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'leads!A1:AE1',
    valueInputOption: 'RAW',
    requestBody: { values: [LEADS_HEADERS] },
  })
  console.log('leads headers set')

  // Добавить заголовки в admin_log
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'admin_log!A1:E1',
    valueInputOption: 'RAW',
    requestBody: { values: [LOG_HEADERS] },
  })
  console.log('admin_log headers set')

  // Установить формулу в manager_view (A1)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'manager_view!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[MANAGER_VIEW_FORMULA]] },
  })
  console.log('manager_view formula set')

  console.log('\n✅ Sheets setup complete!')
  console.log('\nЛисты:')
  console.log('  📊 leads        — все данные (27 колонок, для системы)')
  console.log('  👤 manager_view — чистый вид для менеджера (авто-обновляется)')
  console.log('  📋 admin_log    — история событий (append only)')
  console.log('  ⚙️  system       — технические данные (пока пустой)')
}

main().catch((err) => {
  console.error('❌ Setup failed:', err.message)
  process.exit(1)
})
