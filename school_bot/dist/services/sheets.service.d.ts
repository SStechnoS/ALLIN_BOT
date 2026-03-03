export interface SheetRowData {
    userId?: number;
    createdAt?: number;
    name?: string;
    phone?: string;
    email?: string;
    childAge?: string;
    tgId?: number;
    tgUsername?: string;
    source?: string;
    botActivated?: boolean;
    botActivatedAt?: number;
    lessonDate?: string;
    lessonTime?: string;
    lessonDatetime?: string;
    zoomLink?: string;
    zoomMeetingId?: string;
    confirmed?: boolean;
    confirmedAt?: number;
    gdprAccepted?: boolean;
    gdprAcceptedAt?: number;
    status?: string;
    calendarEventId?: string;
}
/**
 * Appends a new row at the end of the sheet and returns its 1-based row number.
 */
export declare function appendUserRow(data: SheetRowData): Promise<number>;
/**
 * Reads the existing row, merges new data, and writes it back.
 * Protected columns (human-edited) are never overwritten.
 */
export declare function syncUserRow(sheetsRow: number, data: SheetRowData): Promise<void>;
//# sourceMappingURL=sheets.service.d.ts.map