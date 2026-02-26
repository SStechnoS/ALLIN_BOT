"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const DB_DIR = path_1.default.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path_1.default.join(DB_DIR, 'allin.db');
// Ensure data/ directory exists
fs_1.default.mkdirSync(DB_DIR, { recursive: true });
exports.db = new better_sqlite3_1.default(DB_PATH);
// Performance settings
exports.db.pragma('journal_mode = WAL');
exports.db.pragma('synchronous = NORMAL');
exports.db.pragma('foreign_keys = ON');
// ── Schema migrations ────────────────────────────────────────
exports.db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id                TEXT PRIMARY KEY,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    name              TEXT NOT NULL DEFAULT '',
    phone             TEXT DEFAULT '',
    email             TEXT DEFAULT '',
    child_age         INTEGER DEFAULT 0,
    tg_id             INTEGER,
    tg_username       TEXT DEFAULT '',
    source            TEXT DEFAULT 'direct_bot',
    bot_activated     INTEGER DEFAULT 0,
    bot_activated_at  TEXT DEFAULT '',
    lesson_date       TEXT DEFAULT '',
    lesson_time       TEXT DEFAULT '',
    lesson_datetime   TEXT DEFAULT '',
    zoom_link         TEXT DEFAULT '',
    zoom_meeting_id   TEXT DEFAULT '',
    calendar_event_id TEXT DEFAULT '',
    confirmed         INTEGER DEFAULT 0,
    confirmed_at      TEXT DEFAULT '',
    email_1_sent      INTEGER DEFAULT 0,
    email_1_sent_at   TEXT DEFAULT '',
    email_2_sent      INTEGER DEFAULT 0,
    email_2_sent_at   TEXT DEFAULT '',
    gdpr_accepted     INTEGER DEFAULT 0,
    gdpr_accepted_at  TEXT DEFAULT '',
    status            TEXT DEFAULT 'NEW',
    manager_notes     TEXT DEFAULT '',
    last_updated      TEXT DEFAULT (datetime('now')),
    push_count        INTEGER DEFAULT 0,
    attended          INTEGER DEFAULT 0,
    teacher_notes     TEXT DEFAULT ''
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tg_id
    ON leads(tg_id) WHERE tg_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone
    ON leads(phone) WHERE phone IS NOT NULL AND phone != '';

  CREATE INDEX IF NOT EXISTS idx_leads_email       ON leads(email);
  CREATE INDEX IF NOT EXISTS idx_leads_lesson_date ON leads(lesson_date);
  CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads(status);

  -- Settings: dynamic texts editable by admin bot
  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Event log (replaces Google Sheets admin_log tab)
  CREATE TABLE IF NOT EXISTS logs (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    created_at TEXT DEFAULT (datetime('now')),
    lead_id    TEXT,
    event_type TEXT NOT NULL,
    details    TEXT DEFAULT '{}',
    actor      TEXT DEFAULT 'bot'
  );

  -- Session store: Telegraf sessions + AI history + rate limits
  CREATE TABLE IF NOT EXISTS sessions (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    expires_at TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);
// Clean up expired sessions on startup
exports.db.prepare(`DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`).run();
//# sourceMappingURL=index.js.map