import { google } from 'googleapis'
import { formatInTimeZone } from 'date-fns-tz'
import { config } from '../config'
import { logger } from '../logger'
import type { CalendarSlot } from '../types'

const TIMEZONE = 'Europe/Tallinn'
const SLOT_TITLE = 'Пробный урок'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: config.GOOGLE_SERVICE_ACCOUNT_JSON,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })
}

class CalendarService {
  /**
   * Получить доступные слоты из Google Calendar.
   * Менеджер создаёт события с названием "Пробный урок" — они считаются свободными.
   * После бронирования бот переименовывает событие в "Пробный урок — Имя".
   */
  async getAvailableSlots(daysAhead = 14): Promise<CalendarSlot[]> {
    const auth = getAuth()
    const calendar = google.calendar({ version: 'v3', auth })

    const now = new Date()
    const maxTime = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    const res = await calendar.events.list({
      calendarId: config.GOOGLE_CALENDAR_ID,
      timeMin: now.toISOString(),
      timeMax: maxTime.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    })

    const events = res.data.items || []
    logger.debug({ total: events.length }, 'Calendar events fetched')

    return events
      .filter(e => e.summary === SLOT_TITLE && e.start?.dateTime)
      .map(e => {
        const start = new Date(e.start!.dateTime!)
        return {
          eventId: e.id!,
          date: formatInTimeZone(start, TIMEZONE, 'yyyy-MM-dd'),
          time: formatInTimeZone(start, TIMEZONE, 'HH:mm'),
          startDatetime: e.start!.dateTime!,
          endDatetime: e.end?.dateTime || e.start!.dateTime!,
        }
      })
  }

  /**
   * Пометить слот как занятый — переименовать событие.
   */
  async markSlotBusy(eventId: string, clientName: string): Promise<void> {
    const auth = getAuth()
    const calendar = google.calendar({ version: 'v3', auth })

    await calendar.events.patch({
      calendarId: config.GOOGLE_CALENDAR_ID,
      eventId,
      requestBody: {
        summary: `${SLOT_TITLE} — ${clientName}`,
        transparency: 'opaque',
      },
    })

    logger.info({ eventId, clientName }, 'Calendar slot marked busy')
  }

  /**
   * Освободить слот — вернуть событию оригинальное название.
   */
  async freeSlot(eventId: string): Promise<void> {
    const auth = getAuth()
    const calendar = google.calendar({ version: 'v3', auth })

    await calendar.events.patch({
      calendarId: config.GOOGLE_CALENDAR_ID,
      eventId,
      requestBody: {
        summary: SLOT_TITLE,
        transparency: 'transparent',
      },
    })

    logger.info({ eventId }, 'Calendar slot freed')
  }
}

export const calendarService = new CalendarService()
