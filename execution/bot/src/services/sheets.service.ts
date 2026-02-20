import { google } from 'googleapis'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'
import { redis } from '../redis'
import { logger } from '../logger'
import type { Lead, LeadStatus } from '../types'

const SHEETS_ID = config.GOOGLE_SHEETS_ID
const LEADS_SHEET = 'leads'
const LOG_SHEET = 'admin_log'
const CACHE_TTL = 30 // секунд

// Порядок колонок (0-based index)
const COLS = {
  id: 0, created_at: 1, name: 2, phone: 3, email: 4, child_age: 5,
  tg_id: 6, tg_username: 7, source: 8, bot_activated: 9, bot_activated_at: 10,
  lesson_date: 11, lesson_time: 12, lesson_datetime: 13, zoom_link: 14, zoom_meeting_id: 15,
  confirmed: 16, confirmed_at: 17, email_1_sent: 18, email_1_sent_at: 19,
  email_2_sent: 20, email_2_sent_at: 21, gdpr_accepted: 22, gdpr_accepted_at: 23,
  status: 24, manager_notes: 25, last_updated: 26,
  calendar_event_id: 27,
} as const

type ColName = keyof typeof COLS

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })
}

class SheetsService {
  private sheets = google.sheets({ version: 'v4', auth: getAuth() })

  private rowToLead(row: string[]): Lead {
    return {
      id: row[COLS.id] || '',
      created_at: row[COLS.created_at] || '',
      name: row[COLS.name] || '',
      phone: row[COLS.phone] || '',
      email: row[COLS.email] || '',
      child_age: parseInt(row[COLS.child_age] || '0'),
      tg_id: parseInt(row[COLS.tg_id] || '0'),
      tg_username: row[COLS.tg_username] || '',
      source: (row[COLS.source] as 'tilda' | 'direct_bot') || 'direct_bot',
      bot_activated: row[COLS.bot_activated] === 'true',
      bot_activated_at: row[COLS.bot_activated_at] || '',
      lesson_date: row[COLS.lesson_date] || '',
      lesson_time: row[COLS.lesson_time] || '',
      lesson_datetime: row[COLS.lesson_datetime] || '',
      zoom_link: row[COLS.zoom_link] || '',
      zoom_meeting_id: row[COLS.zoom_meeting_id] || '',
      calendar_event_id: row[COLS.calendar_event_id] || '',
      confirmed: row[COLS.confirmed] === 'true',
      confirmed_at: row[COLS.confirmed_at] || '',
      email_1_sent: row[COLS.email_1_sent] === 'true',
      email_1_sent_at: row[COLS.email_1_sent_at] || '',
      email_2_sent: row[COLS.email_2_sent] === 'true',
      email_2_sent_at: row[COLS.email_2_sent_at] || '',
      gdpr_accepted: row[COLS.gdpr_accepted] === 'true',
      gdpr_accepted_at: row[COLS.gdpr_accepted_at] || '',
      status: (row[COLS.status] as LeadStatus) || 'NEW',
      manager_notes: row[COLS.manager_notes] || '',
      last_updated: row[COLS.last_updated] || '',
    }
  }

  private buildRow(lead: Partial<Lead> & { id: string }): string[] {
    const now = new Date().toISOString()
    const row = new Array(28).fill('')
    row[COLS.id] = lead.id
    row[COLS.created_at] = lead.created_at || now
    row[COLS.name] = lead.name || ''
    row[COLS.phone] = lead.phone || ''
    row[COLS.email] = lead.email || ''
    row[COLS.child_age] = lead.child_age?.toString() || ''
    row[COLS.tg_id] = lead.tg_id?.toString() || ''
    row[COLS.tg_username] = lead.tg_username || ''
    row[COLS.source] = lead.source || 'direct_bot'
    row[COLS.bot_activated] = (lead.bot_activated ?? false).toString()
    row[COLS.bot_activated_at] = lead.bot_activated_at || ''
    row[COLS.status] = lead.status || 'NEW'
    row[COLS.gdpr_accepted] = (lead.gdpr_accepted ?? false).toString()
    row[COLS.gdpr_accepted_at] = lead.gdpr_accepted_at || ''
    row[COLS.last_updated] = now
    return row
  }

  private async getAllRows(): Promise<string[][]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: `${LEADS_SHEET}!A:AB`
    })
    const rows = res.data.values || []
    return rows.slice(1) // skip header row
  }

  async findById(id: string): Promise<Lead | null> {
    const cacheKey = `lead:${id}`
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const rows = await this.getAllRows()
    const row = rows.find(r => r[COLS.id] === id)
    if (!row) return null

    const lead = this.rowToLead(row)
    await redis.set(cacheKey, JSON.stringify(lead), 'EX', CACHE_TTL)
    return lead
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

  async upsertLead(data: {
    name?: string; phone?: string; email?: string; child_age?: number
    tg_id?: number; tg_username?: string; source?: 'tilda' | 'direct_bot'
    gdprAccepted?: boolean
  }): Promise<string> {
    // Найти существующий
    const existing = data.email
      ? await this.findByEmail(data.email)
      : data.tg_id ? await this.findByTgId(data.tg_id) : null

    if (existing) {
      await this.updateLead(existing.id, {
        ...(data.name && { name: data.name }),
        ...(data.phone && { phone: data.phone }),
        ...(data.tg_id && { tg_id: data.tg_id }),
        ...(data.tg_username && { tg_username: data.tg_username }),
        ...(data.gdprAccepted !== undefined && {
          gdpr_accepted: data.gdprAccepted,
          gdpr_accepted_at: new Date().toISOString()
        }),
        bot_activated: true,
        bot_activated_at: existing.bot_activated_at || new Date().toISOString(),
        status: 'BOT_ACTIVE' as LeadStatus,
      })
      return existing.id
    }

    // Создать новый
    const leadId = uuidv4()
    const now = new Date().toISOString()
    const row = this.buildRow({
      id: leadId,
      created_at: now,
      name: data.name,
      phone: data.phone,
      email: data.email,
      child_age: data.child_age,
      tg_id: data.tg_id,
      tg_username: data.tg_username,
      source: data.source || 'direct_bot',
      gdpr_accepted: data.gdprAccepted,
      gdpr_accepted_at: data.gdprAccepted ? now : undefined,
      status: 'NEW',
    })

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: `${LEADS_SHEET}!A:AB`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    })

    await this.appendLog(leadId, 'LEAD_CREATED', { source: data.source })
    logger.info({ leadId, source: data.source }, 'Lead created')
    return leadId
  }

  async updateField(leadId: string, field: ColName, value: string | boolean | number): Promise<void> {
    const rows = await this.getAllRows()
    const rowIndex = rows.findIndex(r => r[COLS.id] === leadId)
    if (rowIndex === -1) throw new Error(`Lead not found: ${leadId}`)

    // +2: +1 для header, +1 для 1-based index
    const sheetRow = rowIndex + 2
    const colLetter = this.colIndexToLetter(COLS[field])

    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEETS_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `${LEADS_SHEET}!${colLetter}${sheetRow}`, values: [[value.toString()]] },
          { range: `${LEADS_SHEET}!AA${sheetRow}`, values: [[new Date().toISOString()]] },
        ]
      }
    })

    // Инвалидировать кэш
    await redis.del(`lead:${leadId}`)
  }

  async updateLead(leadId: string, data: Partial<Omit<Lead, 'id'>>): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && key in COLS) {
        await this.updateField(leadId, key as ColName, value as string | boolean | number)
      }
    }
  }

  async appendLog(leadId: string, eventType: string, details: object, actor = 'bot'): Promise<void> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_ID,
      range: `${LOG_SHEET}!A:E`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[new Date().toISOString(), leadId, eventType, JSON.stringify(details), actor]]
      }
    })
  }

  private colIndexToLetter(index: number): string {
    if (index < 26) return String.fromCharCode(65 + index) // A-Z
    // AA, AB, etc.
    return String.fromCharCode(64 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26))
  }
}

export const sheetsService = new SheetsService()
