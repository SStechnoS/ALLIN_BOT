export interface UserRow {
    id: number;
    telegram_id: number;
    telegram_name: string | null;
    phone: string | null;
    email: string | null;
    name: string | null;
    consent_at: number | null;
    created_at: number;
    sheets_row: number | null;
}
export interface BookingRow {
    id: number;
    user_id: number;
    calendar_event_id: string;
    booked_at: number;
    event_start: number;
    event_end: number;
    zoom_link: string | null;
    zoom_meeting_id: string | null;
    lesson_confirmed_at: number | null;
}
export interface CreateBookingInput {
    userId: number;
    calendarEventId: string;
    eventStart: number;
    eventEnd: number;
    zoomLink?: string;
    zoomMeetingId?: string;
}
export declare function getUserByTelegramId(telegramId: number): UserRow | undefined;
/**
 * Inserts a minimal user row on first contact (telegram data only).
 * If the user already exists, updates telegram_name and returns the existing record.
 */
export declare function createOrGetUser(telegramId: number, telegramName: string | null): UserRow;
/**
 * Completes the user's profile after onboarding collects phone, email, and name.
 */
export declare function finalizeUser(userId: number, data: {
    phone: string | null;
    email: string | null;
    name: string;
}): void;
export declare function updateUserSheetsRow(userId: number, sheetsRow: number): void;
export declare function getUserBooking(userId: number): BookingRow | undefined;
export declare function deleteUserBooking(userId: number): void;
export declare function confirmLesson(userId: number): void;
export declare function createBooking(data: CreateBookingInput): void;
//# sourceMappingURL=user.service.d.ts.map