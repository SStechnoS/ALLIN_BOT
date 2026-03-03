"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleNudges = scheduleNudges;
exports.cancelNudges = cancelNudges;
exports.scheduleLessonReminders = scheduleLessonReminders;
exports.cancelLessonReminders = cancelLessonReminders;
const db_1 = require("./db");
const config_1 = require("../config");
const NUDGE_DELAYS_S = [1 * 3600, 24 * 3600, 36 * 3600]; // 1h, 24h, 36h
const LESSON_JOB_TYPES = ["remind_24h", "remind_5h", "remind_30min", "admin_alert_4h"];
// ── Timezone helpers ─────────────────────────────────────────────────────────
function getHourInTimezone(unixSeconds) {
    return (parseInt(new Intl.DateTimeFormat("en-US", {
        timeZone: config_1.config.timezone,
        hour: "numeric",
        hour12: false,
    }).format(new Date(unixSeconds * 1000)), 10) % 24);
}
function getDateStrInTimezone(unixSeconds) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: config_1.config.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(unixSeconds * 1000));
}
/**
 * Converts "YYYY-MM-DD HH:00" in the configured timezone to a UTC unix timestamp.
 * Uses the approximation trick: compute the Intl offset at that moment.
 */
function toUtcUnix(localDateStr, localHour) {
    const approxUtc = new Date(`${localDateStr}T${String(localHour).padStart(2, "0")}:00:00Z`);
    const tzHour = parseInt(new Intl.DateTimeFormat("en-US", {
        timeZone: config_1.config.timezone,
        hour: "numeric",
        hour12: false,
    }).format(approxUtc), 10) % 24;
    return Math.floor(approxUtc.getTime() / 1000) + (localHour - tzHour) * 3600;
}
/**
 * If scheduledAt falls in the night window (22:00–07:00 local time),
 * push it to 07:00 of the next valid morning.
 */
function adjustForNight(scheduledAt) {
    const hour = getHourInTimezone(scheduledAt);
    if (hour >= 7 && hour < 24)
        return scheduledAt;
    const dateStr = getDateStrInTimezone(scheduledAt);
    if (hour >= 24) {
        // After 22:00 — push to next day at 07:00
        const nextDayDate = new Date(scheduledAt * 1000 + 24 * 3600 * 1000);
        const nextDateStr = getDateStrInTimezone(Math.floor(nextDayDate.getTime() / 1000));
        return toUtcUnix(nextDateStr, 7);
    }
    // Before 07:00 — same day at 07:00
    return toUtcUnix(dateStr, 7);
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Schedules 3 nudge jobs (+1h, +24h, +36h from nowUnix), adjusted for night hours.
 */
function scheduleNudges(tgId, nowUnix) {
    for (let i = 0; i < NUDGE_DELAYS_S.length; i++) {
        const scheduledAt = adjustForNight(nowUnix + NUDGE_DELAYS_S[i]);
        (0, db_1.insertJob)("nudge", tgId, scheduledAt, { attempt: i + 1 });
    }
}
function cancelNudges(tgId) {
    (0, db_1.cancelJobsByTypes)(tgId, ["nudge"]);
}
/**
 * Schedules lesson reminder jobs (24h, 5h, 30min before eventStart).
 * Jobs in the past or too close to the event are skipped.
 */
function scheduleLessonReminders(tgId, eventStart, calendarEventId, dayLabel, timeLabel, zoomLink) {
    const payload = {
        eventStart,
        calendarEventId,
        dayLabel,
        timeLabel,
        zoomLink,
    };
    const now = Math.floor(Date.now() / 1000);
    const reminders = [
        ["remind_24h", eventStart - 24 * 3600],
        ["remind_5h", eventStart - 5 * 3600],
        ["remind_30min", eventStart - 30 * 60],
        ["admin_alert_4h", eventStart - 4 * 3600],
    ];
    for (const [type, rawAt] of reminders) {
        if (rawAt <= now)
            continue; // already past, skip
        (0, db_1.insertJob)(type, tgId, adjustForNight(rawAt), payload);
    }
}
function cancelLessonReminders(tgId) {
    (0, db_1.cancelJobsByTypes)(tgId, LESSON_JOB_TYPES);
}
//# sourceMappingURL=notifications.js.map