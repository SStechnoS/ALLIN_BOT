import { google } from "googleapis";
import { config } from "../config";
import { formatDay, formatTime } from "../utils/format";

const LESSON_TITLE = "Пробный урок";

export interface CalendarSlot {
  eventId: string;
  dayKey: string; // ISO date "YYYY-MM-DD" — used for grouping and callbacks
  dayLabel: string; // "пн, 10 марта"
  timeLabel: string; // "14:00"
  eventStart: number; // unix timestamp (seconds)
  eventEnd: number;
}

function getCalendarClient() {
  const credentials = JSON.parse(config.google.serviceAccountJson) as {
    private_key?: string;
    [key: string]: unknown;
  };

  // console.log("credentials :>> ", credentials);

  // dotenv reads \n as two literal chars; JSON.parse keeps them as-is in some
  // environments. Normalise to actual newlines so the RSA signing works correctly.
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

/**
 * Returns available lesson slots from Google Calendar, grouped by day.
 * Only events whose summary is exactly "Пробные уроки" are considered available.
 * Events with a booking suffix ("Пробные уроки - Name") are excluded.
 */
export async function getAvailableSlots(): Promise<
  Map<string, CalendarSlot[]>
> {
  const calendar = getCalendarClient();

  const now = new Date();
  const until = new Date();
  until.setDate(until.getDate() + 30);

  // console.log("config.google.calendarId :>> ", config.google.calendarId);

  const response = await calendar.events.list({
    calendarId: config.google.calendarId,
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  // console.log("response :>> ", JSON.stringify(response.data, null, 2));

  const events = response.data.items ?? [];

  const result = new Map<string, CalendarSlot[]>();

  for (const event of events) {
    // Skip all-day events and events without an id
    if (!event.id || !event.start?.dateTime) continue;

    const summary = event.summary?.trim() ?? "";
    // console.log("summary :>> ", summary);
    // // Exact match only — booked events have "Пробные уроки - Name" suffix
    // console.log(
    //   "summary.toLowerCase() !== LESSON_TITLE.toLowerCase() :>> ",
    //   summary.toLowerCase() !== LESSON_TITLE.toLowerCase(),
    // );
    if (summary.toLowerCase() !== LESSON_TITLE.toLowerCase()) continue;

    const start = new Date(event.start.dateTime);
    const end = event.end?.dateTime ? new Date(event.end.dateTime) : start;

    // Day key uses UTC date to keep it timezone-agnostic for the key
    const dayKey = toLocalDateKey(start);

    const slot: CalendarSlot = {
      eventId: event.id,
      dayKey,
      dayLabel: formatDay(start),
      timeLabel: formatTime(start),
      eventStart: Math.floor(start.getTime() / 1000),
      eventEnd: Math.floor(end.getTime() / 1000),
    };

    const existing = result.get(dayKey);
    if (existing) {
      existing.push(slot);
    } else {
      result.set(dayKey, [slot]);
    }
  }

  return result;
}

/**
 * Reverts a booked event back to the available title so it shows up in getAvailableSlots() again.
 */
export async function cancelSlot(eventId: string): Promise<void> {
  const calendar = getCalendarClient();
  await calendar.events.patch({
    calendarId: config.google.calendarId,
    eventId,
    requestBody: { summary: LESSON_TITLE },
  });
}

/**
 * Marks a calendar event as booked by appending the user's name to the summary.
 * After this call, the event will no longer appear in getAvailableSlots().
 */
export async function bookSlot(
  eventId: string,
  userName: string,
): Promise<void> {
  const calendar = getCalendarClient();
  await calendar.events.patch({
    calendarId: config.google.calendarId,
    eventId,
    requestBody: {
      summary: `${LESSON_TITLE} - ${userName}`,
    },
  });
}

/** Returns "YYYY-MM-DD" for the local date in the configured timezone. */
function toLocalDateKey(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: config.timezone }).format(
    date,
  );
}
