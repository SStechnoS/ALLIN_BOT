"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sheetsService = exports.dbService = void 0;
const uuid_1 = require("uuid");
const db_1 = require("../db");
const logger_1 = require("../logger");
const gsheets_sync_1 = require("./gsheets.sync");
function nowIso() {
    return new Date().toISOString();
}
class DbService {
    // ── Row → Lead ──────────────────────────────────────────────
    rowToLead(row) {
        return {
            id: row.id || '',
            created_at: row.created_at || '',
            name: row.name || '',
            phone: row.phone || '',
            email: row.email || '',
            child_age: row.child_age || 0,
            tg_id: row.tg_id || 0,
            tg_username: row.tg_username || '',
            source: row.source || 'direct_bot',
            bot_activated: Boolean(row.bot_activated),
            bot_activated_at: row.bot_activated_at || '',
            lesson_date: row.lesson_date || '',
            lesson_time: row.lesson_time || '',
            lesson_datetime: row.lesson_datetime || '',
            zoom_link: row.zoom_link || '',
            zoom_meeting_id: row.zoom_meeting_id || '',
            calendar_event_id: row.calendar_event_id || '',
            confirmed: Boolean(row.confirmed),
            confirmed_at: row.confirmed_at || '',
            email_1_sent: Boolean(row.email_1_sent),
            email_1_sent_at: row.email_1_sent_at || '',
            email_2_sent: Boolean(row.email_2_sent),
            email_2_sent_at: row.email_2_sent_at || '',
            gdpr_accepted: Boolean(row.gdpr_accepted),
            gdpr_accepted_at: row.gdpr_accepted_at || '',
            status: row.status || 'NEW',
            manager_notes: row.manager_notes || '',
            last_updated: row.last_updated || '',
            push_count: row.push_count || 0,
            attended: Boolean(row.attended),
            teacher_notes: row.teacher_notes || '',
        };
    }
    // ── Lookups ──────────────────────────────────────────────────
    async findById(id) {
        const row = db_1.db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
        return row ? this.rowToLead(row) : null;
    }
    async findByTgId(tgId) {
        const row = db_1.db.prepare('SELECT * FROM leads WHERE tg_id = ?').get(tgId);
        return row ? this.rowToLead(row) : null;
    }
    async findByEmail(email) {
        const row = db_1.db.prepare('SELECT * FROM leads WHERE lower(email) = lower(?)').get(email);
        return row ? this.rowToLead(row) : null;
    }
    async findByPhone(phone) {
        const row = db_1.db.prepare('SELECT * FROM leads WHERE phone = ?').get(phone);
        return row ? this.rowToLead(row) : null;
    }
    async findByDate(date) {
        const rows = db_1.db.prepare('SELECT * FROM leads WHERE lesson_date = ?').all(date);
        return rows.map(r => this.rowToLead(r));
    }
    async findAllScheduled() {
        const today = new Date().toISOString().split('T')[0];
        const rows = db_1.db.prepare(`SELECT * FROM leads WHERE lesson_date >= ? AND status IN ('SCHEDULED', 'CONFIRMED')`).all(today);
        return rows.map(r => this.rowToLead(r));
    }
    async getAllLeads() {
        const rows = db_1.db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
        return rows.map(r => this.rowToLead(r));
    }
    // Backward-compat alias used by admin.bot.ts (returns Lead[] not string[][])
    async getAllRows() {
        return this.getAllLeads();
    }
    // ── Upsert ───────────────────────────────────────────────────
    async upsertLead(data) {
        // Find existing by email → tg_id → phone
        let existing = null;
        if (data.email)
            existing = await this.findByEmail(data.email);
        if (!existing && data.tg_id)
            existing = await this.findByTgId(data.tg_id);
        if (!existing && data.phone)
            existing = await this.findByPhone(data.phone);
        if (existing) {
            const isBotActivation = !!data.tg_id;
            await this.updateLead(existing.id, {
                ...(data.name && { name: data.name }),
                ...(data.phone && { phone: data.phone }),
                ...(data.tg_id && { tg_id: data.tg_id }),
                ...(data.tg_username && { tg_username: data.tg_username }),
                ...(data.gdprAccepted !== undefined && {
                    gdpr_accepted: data.gdprAccepted,
                    gdpr_accepted_at: nowIso(),
                }),
                ...(isBotActivation && {
                    bot_activated: true,
                    bot_activated_at: existing.bot_activated_at || nowIso(),
                    status: 'BOT_ACTIVE',
                }),
            });
            return existing.id;
        }
        // Create new
        const leadId = (0, uuid_1.v4)();
        const now = nowIso();
        db_1.db.prepare(`
      INSERT INTO leads (
        id, created_at, name, phone, email, child_age,
        tg_id, tg_username, source,
        gdpr_accepted, gdpr_accepted_at,
        status, bot_activated, bot_activated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 0, '')
    `).run(leadId, now, data.name || '', data.phone || '', data.email || '', data.child_age || 0, data.tg_id || null, data.tg_username || '', data.source || 'direct_bot', data.gdprAccepted ? 1 : 0, data.gdprAccepted ? now : '');
        await this.appendLog(leadId, 'LEAD_CREATED', { source: data.source });
        logger_1.logger.info({ leadId, source: data.source }, 'Lead created');
        // Sync to Google Sheets (fire-and-forget)
        this.findById(leadId).then(lead => {
            if (lead)
                gsheets_sync_1.gsheetsSyncService.syncLead(lead).catch(() => { });
        });
        return leadId;
    }
    // ── Updates ──────────────────────────────────────────────────
    async updateField(leadId, field, value) {
        const sqlValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
        db_1.db.prepare(`UPDATE leads SET "${field}" = ?, last_updated = ? WHERE id = ?`)
            .run(sqlValue, nowIso(), leadId);
    }
    async updateLead(leadId, data) {
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                await this.updateField(leadId, key, value);
            }
        }
        // Sync to Google Sheets (fire-and-forget)
        this.findById(leadId).then(lead => {
            if (lead)
                gsheets_sync_1.gsheetsSyncService.syncLead(lead).catch(() => { });
        });
    }
    async incrementPushCount(leadId) {
        db_1.db.prepare('UPDATE leads SET push_count = push_count + 1, last_updated = ? WHERE id = ?')
            .run(nowIso(), leadId);
    }
    async markAttendance(leadId, attended) {
        db_1.db.prepare('UPDATE leads SET attended = ?, status = ?, last_updated = ? WHERE id = ?')
            .run(attended ? 1 : 0, attended ? 'ATTENDED' : 'MISSED', nowIso(), leadId);
        await this.appendLog(leadId, attended ? 'ATTENDED' : 'MISSED', {});
        // Sync to Google Sheets (fire-and-forget)
        this.findById(leadId).then(lead => {
            if (lead)
                gsheets_sync_1.gsheetsSyncService.syncLead(lead).catch(() => { });
        });
    }
    // ── Logging ──────────────────────────────────────────────────
    async appendLog(leadId, eventType, details, actor = 'bot') {
        db_1.db.prepare('INSERT INTO logs (lead_id, event_type, details, actor) VALUES (?, ?, ?, ?)')
            .run(leadId, eventType, JSON.stringify(details), actor);
    }
}
exports.dbService = new DbService();
// Backward-compat alias so existing imports work with a single line change
exports.sheetsService = exports.dbService;
//# sourceMappingURL=db.service.js.map