export interface CreateMeetingOptions {
    topic: string;
    /** ISO 8601 string in UTC, e.g. "2025-03-10T14:00:00Z" */
    startTime: string;
    durationMinutes: number;
}
export interface ZoomMeeting {
    joinUrl: string;
    meetingId: string;
}
/**
 * Creates a Zoom meeting and returns the join URL and meeting ID.
 */
export declare function createMeeting(opts: CreateMeetingOptions): Promise<ZoomMeeting>;
//# sourceMappingURL=zoom.service.d.ts.map