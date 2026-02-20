"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calendarService = void 0;
const googleapis_1 = require("googleapis");
const date_fns_tz_1 = require("date-fns-tz");
const config_1 = require("../config");
const logger_1 = require("../logger");
const TIMEZONE = 'Europe/Tallinn';
const SLOT_TITLE = 'Пробный урок';
function getAuth() {
    return new googleapis_1.google.auth.GoogleAuth({
        credentials: JSON.parse(config_1.config.GOOGLE_SERVICE_ACCOUNT_JSON),
        scopes: ['https://www.googleapis.com/auth/calendar'],
    });
}
class CalendarService {
    /**
     * Получить доступные слоты из Google Calendar.
     * Менеджер создаёт события с названием "Пробный урок" — они считаются свободными.
     * После бронирования бот переименовывает событие в "Пробный урок — Имя".
     */
    async getAvailableSlots(daysAhead = 14) {
        const auth = getAuth();
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
        const now = new Date();
        const maxTime = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
        const res = await calendar.events.list({
            calendarId: config_1.config.GOOGLE_CALENDAR_ID,
            timeMin: now.toISOString(),
            timeMax: maxTime.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });
        const events = res.data.items || [];
        logger_1.logger.debug({ total: events.length }, 'Calendar events fetched');
        return events
            .filter(e => e.summary === SLOT_TITLE && e.start?.dateTime)
            .map(e => {
            const start = new Date(e.start.dateTime);
            return {
                eventId: e.id,
                date: (0, date_fns_tz_1.formatInTimeZone)(start, TIMEZONE, 'yyyy-MM-dd'),
                time: (0, date_fns_tz_1.formatInTimeZone)(start, TIMEZONE, 'HH:mm'),
                startDatetime: e.start.dateTime,
                endDatetime: e.end?.dateTime || e.start.dateTime,
            };
        });
    }
    /**
     * Пометить слот как занятый — переименовать событие.
     */
    async markSlotBusy(eventId, clientName) {
        const auth = getAuth();
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
        await calendar.events.patch({
            calendarId: config_1.config.GOOGLE_CALENDAR_ID,
            eventId,
            requestBody: {
                summary: `${SLOT_TITLE} — ${clientName}`,
                transparency: 'opaque',
            },
        });
        logger_1.logger.info({ eventId, clientName }, 'Calendar slot marked busy');
    }
    /**
     * Освободить слот — вернуть событию оригинальное название.
     */
    async freeSlot(eventId) {
        const auth = getAuth();
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
        await calendar.events.patch({
            calendarId: config_1.config.GOOGLE_CALENDAR_ID,
            eventId,
            requestBody: {
                summary: SLOT_TITLE,
                transparency: 'transparent',
            },
        });
        logger_1.logger.info({ eventId }, 'Calendar slot freed');
    }
}
exports.calendarService = new CalendarService();
//# sourceMappingURL=calendar.service.js.map