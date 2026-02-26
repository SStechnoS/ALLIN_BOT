/**
 * One-way sync: SQLite → Google Sheets
 * Called fire-and-forget after every lead create/update.
 * Errors are logged but never propagate to the main flow.
 */
import { google } from 'googleapis'
import { config } from '../config'
import { logger } from '../logger'
import type { Lead } from '../types'

// Column headers (must match LEAD_ROW order below)
const HEADERS = [
  'ID', 'Создан', 'Имя', 'Телефон', 'Email', 'Возраст ребёнка',
  'Telegram ID', 'Username', 'Источник',
  'Бот активирован', 'Бот активирован (время)',
  'Дата урока', 'Время урока', 'Zoom ссылка',
  'Подтвердил', 'Подтвердил (время)',
  'Email 1 отправлен', 'Email 2 отправлен',
  'GDPR', 'Статус', 'Пушей', 'Пришёл', 'Заметки учителя',
  'Заметки менеджера', 'Обновлён'
]

const SHEET_NAME = 'leads'

function leadToRow(lead: Lead): string[] {
  return [
    lead.id,
    lead.created_at,
    lead.name,
    lead.phone,
    lead.email,
    String(lead.child_age || ''),
    lead.tg_id ? String(lead.tg_id) : '',
    lead.tg_username || '',
    lead.source,
    lead.bot_activated ? 'TRUE' : 'FALSE',
    lead.bot_activated_at || '',
    lead.lesson_date || '',
    lead.lesson_time || '',
    lead.zoom_link || '',
    lead.confirmed ? 'TRUE' : 'FALSE',
    lead.confirmed_at || '',
    lead.email_1_sent ? 'TRUE' : 'FALSE',
    lead.email_2_sent ? 'TRUE' : 'FALSE',
    lead.gdpr_accepted ? 'TRUE' : 'FALSE',
    lead.status,
    String(lead.push_count || 0),
    lead.attended ? 'TRUE' : 'FALSE',
    lead.teacher_notes || '',
    lead.manager_notes || '',
    lead.last_updated || '',
  ]
}

class GSheetsSyncService {
  private sheetsApi: any = null

  private getApi() {
    if (this.sheetsApi) return this.sheetsApi
    if (!config.GOOGLE_SERVICE_ACCOUNT_JSON || !config.GOOGLE_SHEETS_ID) return null
    try {
      const creds = JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON)
      const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
      this.sheetsApi = google.sheets({ version: 'v4', auth })
      return this.sheetsApi
    } catch {
      return null
    }
  }

  // Ensure header row exists
  private async ensureHeaders(sheets: any): Promise<void> {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.GOOGLE_SHEETS_ID,
      range: `${SHEET_NAME}!A1:A1`,
    })
    if (!res.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.GOOGLE_SHEETS_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      })
    }
  }

  // Find row number by lead ID (column A), returns 1-based row index or -1
  private async findRowById(sheets: any, leadId: string): Promise<number> {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.GOOGLE_SHEETS_ID,
      range: `${SHEET_NAME}!A:A`,
    })
    const rows: string[][] = res.data.values || []
    for (let i = 1; i < rows.length; i++) { // skip header row (i=0)
      if (rows[i][0] === leadId) return i + 1 // 1-based
    }
    return -1
  }

  // Public: upsert lead to Sheets (fire-and-forget)
  async syncLead(lead: Lead): Promise<void> {
    const sheets = this.getApi()
    if (!sheets) return // Sheets not configured — skip silently

    try {
      await this.ensureHeaders(sheets)
      const rowData = leadToRow(lead)
      const rowIndex = await this.findRowById(sheets, lead.id)

      if (rowIndex === -1) {
        // Append new row
        await sheets.spreadsheets.values.append({
          spreadsheetId: config.GOOGLE_SHEETS_ID,
          range: `${SHEET_NAME}!A1`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [rowData] },
        })
      } else {
        // Update existing row
        await sheets.spreadsheets.values.update({
          spreadsheetId: config.GOOGLE_SHEETS_ID,
          range: `${SHEET_NAME}!A${rowIndex}`,
          valueInputOption: 'RAW',
          requestBody: { values: [rowData] },
        })
      }
    } catch (err) {
      logger.warn({ err, leadId: lead.id }, 'GSheets sync failed (non-fatal)')
    }
  }
}

export const gsheetsSyncService = new GSheetsSyncService()
