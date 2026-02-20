# Orchestration: Google Sheets + Google Calendar Design

## Google Sheets: SheetsService

### Инициализация

```typescript
// services/sheets.service.ts

import { google } from 'googleapis'
import { v4 as uuidv4 } from 'uuid'

const SHEETS_ID = process.env.GOOGLE_SHEETS_ID!
const LEADS_SHEET = 'leads'
const LOG_SHEET = 'admin_log'

// Инициализация Google Auth через Service Account
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!),
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar'
  ]
})

const sheets = google.sheets({ version: 'v4', auth })
```

### Структура колонок (индексы)

```typescript
// Порядок колонок в листе "leads"
const COLS = {
  id: 0,                // A
  created_at: 1,        // B
  name: 2,              // C
  phone: 3,             // D
  email: 4,             // E
  child_age: 5,         // F
  tg_id: 6,             // G
  tg_username: 7,       // H
  source: 8,            // I
  bot_activated: 9,     // J
  bot_activated_at: 10, // K
  lesson_date: 11,      // L
  lesson_time: 12,      // M
  lesson_datetime: 13,  // N
  zoom_link: 14,        // O
  zoom_meeting_id: 15,  // P
  confirmed: 16,        // Q
  confirmed_at: 17,     // R
  email_1_sent: 18,     // S
  email_1_sent_at: 19,  // T
  email_2_sent: 20,     // U
  email_2_sent_at: 21,  // V
  gdpr_accepted: 22,    // W
  gdpr_accepted_at: 23, // X
  status: 24,           // Y
  manager_notes: 25,    // Z
  last_updated: 26,     // AA
}
```

### Основные методы

```typescript
class SheetsService {

  // Создать или обновить лид (по email или tg_id)
  async upsertLead(data: Partial<Lead>): Promise<string> {
    // Поиск существующего
    const existing = data.email
      ? await this.findByEmail(data.email)
      : data.tg_id
        ? await this.findByTgId(data.tg_id)
        : null

    if (existing) {
      // Обновить существующий
      await this.updateLead(existing.id, data)
      return existing.id
    }

    // Создать новый
    const leadId = uuidv4()
    const now = new Date().toISOString()
    const row = this.buildRow({ ...data, id: leadId, created_at: now, status: 'NEW' })

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: `${LEADS_SHEET}!A:AA`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    })

    await this.appendLog(leadId, 'LEAD_CREATED', { source: data.source })
    return leadId
  }

  // Найти лид по row index (внутренний метод)
  private async getAllRows(): Promise<string[][]> {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: `${LEADS_SHEET}!A:AA`
    })
    return res.data.values || []
  }

  async findById(id: string): Promise<Lead | null> {
    const rows = await this.getAllRows()
    const row = rows.find(r => r[COLS.id] === id)
    return row ? this.rowToLead(row) : null
  }

  async findByTgId(tgId: number): Promise<Lead | null> {
    const rows = await this.getAllRows()
    const row = rows.find(r => r[COLS.tg_id] === tgId.toString())
    return row ? this.rowToLead(row) : null
  }

  async findByEmail(email: string): Promise<Lead | null> {
    const rows = await this.getAllRows()
    const row = rows.find(r => r[COLS.email]?.toLowerCase() === email.toLowerCase())
    return row ? this.rowToLead(row) : null
  }

  async updateField(leadId: string, field: keyof typeof COLS, value: any): Promise<void> {
    const rows = await this.getAllRows()
    const rowIndex = rows.findIndex(r => r[COLS.id] === leadId)
    if (rowIndex === -1) throw new Error(`Lead ${leadId} not found`)

    const colLetter = String.fromCharCode(65 + COLS[field]) // A=65, B=66...
    const range = `${LEADS_SHEET}!${colLetter}${rowIndex + 1}` // +1 для 1-based rows

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [[value?.toString() ?? '']] }
    })

    // Обновить last_updated
    const lastUpdatedRange = `${LEADS_SHEET}!AA${rowIndex + 1}`
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID,
      range: lastUpdatedRange,
      valueInputOption: 'RAW',
      requestBody: { values: [[new Date().toISOString()]] }
    })
  }

  async updateLead(leadId: string, data: Partial<Lead>): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && key in COLS) {
        await this.updateField(leadId, key as keyof typeof COLS, value)
      }
    }
  }

  async appendLog(leadId: string, eventType: string, details: object): Promise<void> {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: `${LOG_SHEET}!A:E`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toISOString(),
          leadId,
          eventType,
          JSON.stringify(details),
          'bot'
        ]]
      }
    })
  }

  // Конвертация row → Lead object
  private rowToLead(row: string[]): Lead {
    return {
      id: row[COLS.id],
      created_at: row[COLS.created_at],
      name: row[COLS.name],
      phone: row[COLS.phone],
      email: row[COLS.email],
      child_age: parseInt(row[COLS.child_age] || '0'),
      tg_id: parseInt(row[COLS.tg_id] || '0'),
      tg_username: row[COLS.tg_username],
      source: row[COLS.source] as 'tilda' | 'direct_bot',
      bot_activated: row[COLS.bot_activated] === 'true',
      bot_activated_at: row[COLS.bot_activated_at],
      lesson_date: row[COLS.lesson_date],
      lesson_time: row[COLS.lesson_time],
      lesson_datetime: row[COLS.lesson_datetime],
      zoom_link: row[COLS.zoom_link],
      zoom_meeting_id: row[COLS.zoom_meeting_id],
      confirmed: row[COLS.confirmed] === 'true',
      confirmed_at: row[COLS.confirmed_at],
      email_1_sent: row[COLS.email_1_sent] === 'true',
      email_2_sent: row[COLS.email_2_sent] === 'true',
      gdpr_accepted: row[COLS.gdpr_accepted] === 'true',
      status: row[COLS.status] as LeadStatus,
      manager_notes: row[COLS.manager_notes],
      last_updated: row[COLS.last_updated],
    }
  }
}
```

### Кэширование (Redis, 30 сек)

```typescript
// Для часто читаемых данных (проверка bot_activated в workers)
async findByIdCached(leadId: string): Promise<Lead | null> {
  const cacheKey = `lead_cache:${leadId}`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const lead = await this.findById(leadId)
  if (lead) await redis.set(cacheKey, JSON.stringify(lead), 'EX', 30)
  return lead
}

async invalidateCache(leadId: string): Promise<void> {
  await redis.del(`lead_cache:${leadId}`)
}
```

---

## Google Calendar: CalendarService

### Инициализация

```typescript
// services/calendar.service.ts

const calendar = google.calendar({ version: 'v3', auth })
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!
```

### Получение доступных слотов

```typescript
class CalendarService {

  // Получить свободные слоты на ближайшие N дней
  async getAvailableSlots(daysAhead: number): Promise<CalendarSlot[]> {
    const now = new Date()
    const timeMin = new Date(now.getTime() + 2 * 60 * 60 * 1000) // +2ч от сейчас
    const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      // Фильтр: только события с пометкой "Пробный урок" и статусом free
    })

    const events = res.data.items || []

    return events
      .filter(event => {
        // Только события обозначенные как Free (доступные)
        const isAvailable = event.transparency === 'transparent' || !event.transparency
        const isFuture = new Date(event.start?.dateTime || '') > timeMin
        const hasTitle = event.summary?.includes('Пробный урок') || event.summary?.includes('#trial')
        return isAvailable && isFuture && hasTitle
      })
      .map(event => ({
        eventId: event.id!,
        date: event.start!.dateTime!.split('T')[0], // "2026-02-25"
        time: formatTime(event.start!.dateTime!),    // "15:00"
        startDatetime: event.start!.dateTime!,
        endDatetime: event.end!.dateTime!,
      }))
  }

  // Получить слоты для конкретной даты
  async getSlotsForDate(date: string): Promise<CalendarSlot[]> {
    const all = await this.getAvailableSlots(14)
    return all.filter(s => s.date === date)
  }

  // Пометить слот занятым после записи клиента
  async markSlotBusy(eventId: string, clientInfo: { name: string; phone: string; tgId: number }): Promise<void> {
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: {
        transparency: 'opaque', // Busy
        description: `Клиент: ${clientInfo.name}\nТел: ${clientInfo.phone}\nTelegram ID: ${clientInfo.tgId}`,
        colorId: '11' // красный цвет — занято
      }
    })
  }

  // Освободить слот (при переносе)
  async markSlotFree(eventId: string): Promise<void> {
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: {
        transparency: 'transparent', // Free
        description: '',
        colorId: '2' // зелёный — свободно
      }
    })
  }
}

function formatTime(datetime: string): string {
  // "2026-02-25T15:00:00+02:00" → "15:00"
  return datetime.split('T')[1].substring(0, 5)
}
```

### Настройка Google Calendar для менеджера

Инструкции для менеджера:
1. Открыть Google Calendar (calendar.google.com)
2. Создать событие с названием "Пробный урок" на нужную дату и время
3. Продолжительность: 60 минут
4. Статус: **Свободен** (Free) — для доступного слота
5. Повторять для каждого доступного слота

Бот автоматически найдёт все события с названием "Пробный урок" и статусом "Свободен".
После записи клиента событие автоматически станет "Занятым".

---

## Скрипт первоначальной настройки GSheets

```typescript
// scripts/setup_gsheets.ts

async function setupSheets() {
  // 1. Создать заголовки листа leads
  const HEADERS = [
    'id', 'created_at', 'name', 'phone', 'email', 'child_age',
    'tg_id', 'tg_username', 'source', 'bot_activated', 'bot_activated_at',
    'lesson_date', 'lesson_time', 'lesson_datetime', 'zoom_link', 'zoom_meeting_id',
    'confirmed', 'confirmed_at', 'email_1_sent', 'email_1_sent_at',
    'email_2_sent', 'email_2_sent_at', 'gdpr_accepted', 'gdpr_accepted_at',
    'status', 'manager_notes', 'last_updated'
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: 'leads!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] }
  })

  // 2. Создать заголовки листа admin_log
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: 'admin_log!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [['timestamp', 'lead_id', 'event_type', 'details', 'actor']] }
  })

  console.log('✅ Google Sheets setup complete')
}
```
