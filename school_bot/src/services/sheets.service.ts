import { google } from "googleapis";
import { config } from "../config";

// ── Column layout (0-based index = spreadsheet column A=0, B=1, …, AE=30) ──
//
//  0  id               1  created_at       2  name             3  phone
//  4  email            5  child_age        6  tg_id            7  tg_username
//  8  source           9  bot_activated   10  bot_activated_at 11  lesson_date
// 12  lesson_time     13  lesson_datetime  14  zoom_link        15  zoom_meeting_id
// 16  confirmed       17  confirmed_at     18  email_1_sent     19  email_1_sent_at
// 20  email_2_sent    21  email_2_sent_at  22  gdpr_accepted    23  gdpr_accepted_at
// 24  status          25  manager_notes    26  last_updated     27  calendar_event_id
// 28  push_count      29  attended         30  teacher_notes

const SHEET_NAME = "leads";
const TOTAL_COLS = 31; // A … AE
const LAST_COL = "AE";

const C = {
  id: 0,
  created_at: 1,
  name: 2,
  phone: 3,
  email: 4,
  child_age: 5,
  tg_id: 6,
  tg_username: 7,
  source: 8,
  bot_activated: 9,
  bot_activated_at: 10,
  lesson_date: 11,
  lesson_time: 12,
  lesson_datetime: 13,
  zoom_link: 14,
  zoom_meeting_id: 15,
  confirmed: 16,
  confirmed_at: 17,
  email_1_sent: 18,
  email_1_sent_at: 19,
  email_2_sent: 20,
  email_2_sent_at: 21,
  gdpr_accepted: 22,
  gdpr_accepted_at: 23,
  status: 24,
  manager_notes: 25,
  last_updated: 26,
  calendar_event_id: 27,
  push_count: 28,
  attended: 29,
  teacher_notes: 30,
} as const;

// Columns managed by humans — never overwritten by the bot
const PROTECTED = new Set<number>([
  C.manager_notes,
  C.email_1_sent,
  C.email_1_sent_at,
  C.email_2_sent,
  C.email_2_sent_at,
  C.push_count,
  C.attended,
  C.teacher_notes,
]);

// ── Public data interface ────────────────────────────────────────────────────

export interface SheetRowData {
  userId?: number;
  createdAt?: number; // unix seconds
  name?: string;
  phone?: string;
  email?: string;
  childAge?: string;
  tgId?: number;
  tgUsername?: string;
  source?: string;
  botActivated?: boolean;
  botActivatedAt?: number; // unix seconds
  lessonDate?: string;
  lessonTime?: string;
  lessonDatetime?: string;
  zoomLink?: string;
  zoomMeetingId?: string;
  confirmed?: boolean;
  confirmedAt?: number; // unix seconds
  gdprAccepted?: boolean;
  gdprAcceptedAt?: number; // unix seconds
  status?: string;
  calendarEventId?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getSheetsClient() {
  if (!config.google.sheetsId)
    throw new Error("GOOGLE_SHEETS_ID is not configured");

  const credentials = JSON.parse(config.google.serviceAccountJson) as {
    private_key?: string;
    [key: string]: unknown;
  };
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function fmtTs(unixSeconds: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

function bool(v: boolean): string {
  return v ? "TRUE" : "FALSE";
}

function rowRange(row: number): string {
  return `${SHEET_NAME}!A${row}:${LAST_COL}${row}`;
}

/**
 * Applies SheetRowData onto an existing 31-element string array in-place.
 * Undefined fields are skipped; protected columns are never touched.
 * `last_updated` is always set to the current time.
 */
function applyData(row: string[], data: SheetRowData): void {
  const set = (idx: number, val: string | undefined) => {
    if (val !== undefined && !PROTECTED.has(idx)) row[idx] = val;
  };

  set(C.id, data.userId !== undefined ? String(data.userId) : undefined);
  set(
    C.created_at,
    data.createdAt !== undefined ? fmtTs(data.createdAt) : undefined,
  );
  set(C.name, data.name);
  set(C.phone, data.phone);
  set(C.email, data.email);
  set(C.child_age, data.childAge);
  set(C.tg_id, data.tgId !== undefined ? String(data.tgId) : undefined);
  set(C.tg_username, data.tgUsername);
  set(C.source, data.source);
  set(
    C.bot_activated,
    data.botActivated !== undefined ? bool(data.botActivated) : undefined,
  );
  set(
    C.bot_activated_at,
    data.botActivatedAt !== undefined ? fmtTs(data.botActivatedAt) : undefined,
  );
  set(C.lesson_date, data.lessonDate);
  set(C.lesson_time, data.lessonTime);
  set(C.lesson_datetime, data.lessonDatetime);
  set(C.zoom_link, data.zoomLink);
  set(C.zoom_meeting_id, data.zoomMeetingId);
  set(
    C.confirmed,
    data.confirmed !== undefined ? bool(data.confirmed) : undefined,
  );
  set(
    C.confirmed_at,
    data.confirmedAt !== undefined ? fmtTs(data.confirmedAt) : undefined,
  );
  set(
    C.gdpr_accepted,
    data.gdprAccepted !== undefined ? bool(data.gdprAccepted) : undefined,
  );
  set(
    C.gdpr_accepted_at,
    data.gdprAcceptedAt !== undefined ? fmtTs(data.gdprAcceptedAt) : undefined,
  );
  set(C.status, data.status);
  set(C.calendar_event_id, data.calendarEventId);

  // Always refresh last_updated
  row[C.last_updated] = fmtTs(Math.floor(Date.now() / 1000));
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Appends a new row at the end of the sheet and returns its 1-based row number.
 */
export async function appendUserRow(data: SheetRowData): Promise<number> {
  const sheets = getSheetsClient();
  const row = new Array<string>(TOTAL_COLS).fill("");
  applyData(row, data);

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.sheetsId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  // updatedRange looks like "leads!A5:AE5" — extract the row number
  const match = res.data.updates?.updatedRange?.match(/!A(\d+):/);
  if (!match)
    throw new Error(
      "Sheets append: could not determine row number from response",
    );
  return parseInt(match[1]!, 10);
}

/**
 * Reads the existing row, merges new data, and writes it back.
 * Protected columns (human-edited) are never overwritten.
 */
export async function syncUserRow(
  sheetsRow: number,
  data: SheetRowData,
): Promise<void> {
  const sheets = getSheetsClient();

  const getRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetsId,
    range: rowRange(sheetsRow),
  });

  const current = ((getRes.data.values?.[0] ?? []) as string[]).slice();
  while (current.length < TOTAL_COLS) current.push("");

  applyData(current, data);

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.sheetsId,
    range: rowRange(sheetsRow),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [current] },
  });
}
