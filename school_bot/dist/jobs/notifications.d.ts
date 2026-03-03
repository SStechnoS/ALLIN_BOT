/**
 * Schedules 3 nudge jobs (+1h, +24h, +36h from nowUnix), adjusted for night hours.
 */
export declare function scheduleNudges(tgId: number, nowUnix: number): void;
export declare function cancelNudges(tgId: number): void;
/**
 * Schedules lesson reminder jobs (24h, 5h, 30min before eventStart).
 * Jobs in the past or too close to the event are skipped.
 */
export declare function scheduleLessonReminders(tgId: number, eventStart: number, calendarEventId: string, dayLabel: string, timeLabel: string, zoomLink: string): void;
export declare function cancelLessonReminders(tgId: number): void;
//# sourceMappingURL=notifications.d.ts.map