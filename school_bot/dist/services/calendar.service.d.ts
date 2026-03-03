export interface CalendarSlot {
    eventId: string;
    dayKey: string;
    dayLabel: string;
    timeLabel: string;
    eventStart: number;
    eventEnd: number;
}
/**
 * Returns available lesson slots from Google Calendar, grouped by day.
 * Only events whose summary is exactly "Пробные уроки" are considered available.
 * Events with a booking suffix ("Пробные уроки - Name") are excluded.
 */
export declare function getAvailableSlots(): Promise<Map<string, CalendarSlot[]>>;
/**
 * Reverts a booked event back to the available title so it shows up in getAvailableSlots() again.
 */
export declare function cancelSlot(eventId: string): Promise<void>;
/**
 * Marks a calendar event as booked by appending the user's name to the summary.
 * After this call, the event will no longer appear in getAvailableSlots().
 */
export declare function bookSlot(eventId: string, userName: string): Promise<void>;
//# sourceMappingURL=calendar.service.d.ts.map