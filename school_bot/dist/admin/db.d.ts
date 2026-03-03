export interface AdminRow {
    id: number;
    telegram_id: number;
    telegram_name: string | null;
    created_at: number;
}
export interface UserWithBooking {
    id: number;
    telegram_id: number;
    telegram_name: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
    created_at: number;
    sheets_row: number | null;
    booking_id: number | null;
    event_start: number | null;
    event_end: number | null;
    lesson_confirmed_at: number | null;
    attended: number | null;
}
export interface ScheduleRow {
    name: string | null;
    phone: string | null;
    email: string | null;
    telegram_name: string | null;
    telegram_id: number;
    event_start: number;
    event_end: number;
    zoom_link: string | null;
    lesson_confirmed_at: number | null;
}
export interface PeriodStats {
    new_users: number;
    new_bookings: number;
    attended: number;
    not_attended: number;
    upcoming: number;
}
export declare function getAdminByTelegramId(telegramId: number): AdminRow | undefined;
export declare function createAdmin(telegramId: number, telegramName: string | null): void;
export declare function getAllAdmins(): AdminRow[];
/**
 * Returns stats for a time period.
 * Pass since=undefined for all-time (no date filter).
 */
export declare function getStatsByPeriod(since?: number, until?: number): PeriodStats;
export declare function getUpcomingSchedule(): ScheduleRow[];
export declare function getRegisteredUserCount(): number;
export declare function getUserAtOffset(offset: number): UserWithBooking | undefined;
export declare function setAttended(bookingId: number, attended: boolean): void;
export declare function getFilteredUserCount(since?: number, until?: number): number;
export declare function getUserAtOffsetFiltered(offset: number, since?: number, until?: number): UserWithBooking | undefined;
export declare function searchUsers(query: string): UserWithBooking[];
export interface EmailRecipient {
    email: string;
    name: string | null;
}
export declare function getUserEmailsForBroadcast(target: "all" | "unconfirmed"): EmailRecipient[];
export declare function getUsersForBroadcast(target: 'all' | 'unconfirmed'): {
    telegram_id: number;
}[];
//# sourceMappingURL=db.d.ts.map