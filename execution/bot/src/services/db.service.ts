import { v4 as uuidv4 } from 'uuid'
import { db } from '../db'
import { logger } from '../logger'
import { gsheetsSyncService } from './gsheets.sync'
import type { Lead, LeadStatus } from '../types'

function nowIso(): string {
  return new Date().toISOString()
}

class DbService {
  // ── Row → Lead ──────────────────────────────────────────────
  rowToLead(row: any): Lead {
    return {
      id:                row.id                || '',
      created_at:        row.created_at        || '',
      name:              row.name              || '',
      phone:             row.phone             || '',
      email:             row.email             || '',
      child_age:         row.child_age         || 0,
      tg_id:             row.tg_id             || 0,
      tg_username:       row.tg_username       || '',
      source:            (row.source as 'tilda' | 'direct_bot') || 'direct_bot',
      bot_activated:     Boolean(row.bot_activated),
      bot_activated_at:  row.bot_activated_at  || '',
      lesson_date:       row.lesson_date       || '',
      lesson_time:       row.lesson_time       || '',
      lesson_datetime:   row.lesson_datetime   || '',
      zoom_link:         row.zoom_link         || '',
      zoom_meeting_id:   row.zoom_meeting_id   || '',
      calendar_event_id: row.calendar_event_id || '',
      confirmed:         Boolean(row.confirmed),
      confirmed_at:      row.confirmed_at      || '',
      email_1_sent:      Boolean(row.email_1_sent),
      email_1_sent_at:   row.email_1_sent_at   || '',
      email_2_sent:      Boolean(row.email_2_sent),
      email_2_sent_at:   row.email_2_sent_at   || '',
      gdpr_accepted:     Boolean(row.gdpr_accepted),
      gdpr_accepted_at:  row.gdpr_accepted_at  || '',
      status:            (row.status as LeadStatus) || 'NEW',
      manager_notes:     row.manager_notes     || '',
      last_updated:      row.last_updated      || '',
      push_count:        row.push_count        || 0,
      attended:          Boolean(row.attended),
      teacher_notes:     row.teacher_notes     || '',
    }
  }

  // ── Lookups ──────────────────────────────────────────────────
  async findById(id: string): Promise<Lead | null> {
    const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(id)
    return row ? this.rowToLead(row) : null
  }

  async findByTgId(tgId: number): Promise<Lead | null> {
    const row = db.prepare('SELECT * FROM leads WHERE tg_id = ?').get(tgId)
    return row ? this.rowToLead(row) : null
  }

  async findByEmail(email: string): Promise<Lead | null> {
    const row = db.prepare('SELECT * FROM leads WHERE lower(email) = lower(?)').get(email)
    return row ? this.rowToLead(row) : null
  }

  async findByPhone(phone: string): Promise<Lead | null> {
    const row = db.prepare('SELECT * FROM leads WHERE phone = ?').get(phone)
    return row ? this.rowToLead(row) : null
  }

  async findByDate(date: string): Promise<Lead[]> {
    const rows = db.prepare('SELECT * FROM leads WHERE lesson_date = ?').all(date) as any[]
    return rows.map(r => this.rowToLead(r))
  }

  async findAllScheduled(): Promise<Lead[]> {
    const today = new Date().toISOString().split('T')[0]
    const rows = db.prepare(
      `SELECT * FROM leads WHERE lesson_date >= ? AND status IN ('SCHEDULED', 'CONFIRMED')`
    ).all(today) as any[]
    return rows.map(r => this.rowToLead(r))
  }

  async getAllLeads(): Promise<Lead[]> {
    const rows = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all() as any[]
    return rows.map(r => this.rowToLead(r))
  }

  // Backward-compat alias used by admin.bot.ts (returns Lead[] not string[][])
  async getAllRows(): Promise<Lead[]> {
    return this.getAllLeads()
  }

  // ── Upsert ───────────────────────────────────────────────────
  async upsertLead(data: {
    name?: string; phone?: string; email?: string; child_age?: number
    tg_id?: number; tg_username?: string; source?: 'tilda' | 'direct_bot'
    gdprAccepted?: boolean
  }): Promise<string> {
    // Find existing by email → tg_id → phone
    let existing: Lead | null = null
    if (data.email)  existing = await this.findByEmail(data.email)
    if (!existing && data.tg_id)  existing = await this.findByTgId(data.tg_id)
    if (!existing && data.phone)  existing = await this.findByPhone(data.phone)

    if (existing) {
      const isBotActivation = !!data.tg_id
      await this.updateLead(existing.id, {
        ...(data.name        && { name: data.name }),
        ...(data.phone       && { phone: data.phone }),
        ...(data.tg_id       && { tg_id: data.tg_id }),
        ...(data.tg_username && { tg_username: data.tg_username }),
        ...(data.gdprAccepted !== undefined && {
          gdpr_accepted:    data.gdprAccepted,
          gdpr_accepted_at: nowIso(),
        }),
        ...(isBotActivation && {
          bot_activated:    true,
          bot_activated_at: existing.bot_activated_at || nowIso(),
          status:           'BOT_ACTIVE' as LeadStatus,
        }),
      })
      return existing.id
    }

    // Create new
    const leadId = uuidv4()
    const now = nowIso()
    db.prepare(`
      INSERT INTO leads (
        id, created_at, name, phone, email, child_age,
        tg_id, tg_username, source,
        gdpr_accepted, gdpr_accepted_at,
        status, bot_activated, bot_activated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 0, '')
    `).run(
      leadId, now,
      data.name || '', data.phone || '', data.email || '',
      data.child_age || 0,
      data.tg_id || null, data.tg_username || '',
      data.source || 'direct_bot',
      data.gdprAccepted ? 1 : 0,
      data.gdprAccepted ? now : '',
    )

    await this.appendLog(leadId, 'LEAD_CREATED', { source: data.source })
    logger.info({ leadId, source: data.source }, 'Lead created')

    // Sync to Google Sheets (fire-and-forget)
    this.findById(leadId).then(lead => {
      if (lead) gsheetsSyncService.syncLead(lead).catch(() => {})
    })

    return leadId
  }

  // ── Updates ──────────────────────────────────────────────────
  async updateField(leadId: string, field: string, value: any): Promise<void> {
    const sqlValue = typeof value === 'boolean' ? (value ? 1 : 0) : value
    db.prepare(`UPDATE leads SET "${field}" = ?, last_updated = ? WHERE id = ?`)
      .run(sqlValue, nowIso(), leadId)
  }

  async updateLead(leadId: string, data: Partial<Omit<Lead, 'id'>>): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        await this.updateField(leadId, key, value)
      }
    }
    // Sync to Google Sheets (fire-and-forget)
    this.findById(leadId).then(lead => {
      if (lead) gsheetsSyncService.syncLead(lead).catch(() => {})
    })
  }

  async incrementPushCount(leadId: string): Promise<void> {
    db.prepare('UPDATE leads SET push_count = push_count + 1, last_updated = ? WHERE id = ?')
      .run(nowIso(), leadId)
  }

  async markAttendance(leadId: string, attended: boolean): Promise<void> {
    db.prepare('UPDATE leads SET attended = ?, status = ?, last_updated = ? WHERE id = ?')
      .run(attended ? 1 : 0, attended ? 'ATTENDED' : 'MISSED', nowIso(), leadId)
    await this.appendLog(leadId, attended ? 'ATTENDED' : 'MISSED', {})
    // Sync to Google Sheets (fire-and-forget)
    this.findById(leadId).then(lead => {
      if (lead) gsheetsSyncService.syncLead(lead).catch(() => {})
    })
  }

  // ── Logging ──────────────────────────────────────────────────
  async appendLog(leadId: string, eventType: string, details: object, actor = 'bot'): Promise<void> {
    db.prepare('INSERT INTO logs (lead_id, event_type, details, actor) VALUES (?, ?, ?, ?)')
      .run(leadId, eventType, JSON.stringify(details), actor)
  }
}

export const dbService = new DbService()

// Backward-compat alias so existing imports work with a single line change
export const sheetsService = dbService
