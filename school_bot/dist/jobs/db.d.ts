export type JobType = 'nudge' | 'remind_24h' | 'remind_5h' | 'remind_30min' | 'admin_alert_4h';
export interface JobRow {
    id: number;
    type: string;
    tg_id: number;
    scheduled_at: number;
    payload: string;
    sent_at: number | null;
    cancelled_at: number | null;
}
export declare function insertJob(type: JobType, tgId: number, scheduledAt: number, payload?: object): void;
export declare function getDueJobs(): JobRow[];
export declare function markJobSent(id: number): void;
export declare function cancelJobsByTypes(tgId: number, types: JobType[]): void;
//# sourceMappingURL=db.d.ts.map