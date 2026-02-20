import type { ZoomMeeting } from '../types';
declare class ZoomService {
    private tokenCache;
    private getToken;
    createMeeting(topic: string, startTime: string): Promise<ZoomMeeting>;
    deleteMeeting(meetingId: string): Promise<void>;
}
export declare const zoomService: ZoomService;
export {};
//# sourceMappingURL=zoom.service.d.ts.map