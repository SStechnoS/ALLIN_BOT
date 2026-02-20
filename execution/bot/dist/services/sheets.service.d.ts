import type { Lead } from '../types';
declare const COLS: {
    readonly id: 0;
    readonly created_at: 1;
    readonly name: 2;
    readonly phone: 3;
    readonly email: 4;
    readonly child_age: 5;
    readonly tg_id: 6;
    readonly tg_username: 7;
    readonly source: 8;
    readonly bot_activated: 9;
    readonly bot_activated_at: 10;
    readonly lesson_date: 11;
    readonly lesson_time: 12;
    readonly lesson_datetime: 13;
    readonly zoom_link: 14;
    readonly zoom_meeting_id: 15;
    readonly confirmed: 16;
    readonly confirmed_at: 17;
    readonly email_1_sent: 18;
    readonly email_1_sent_at: 19;
    readonly email_2_sent: 20;
    readonly email_2_sent_at: 21;
    readonly gdpr_accepted: 22;
    readonly gdpr_accepted_at: 23;
    readonly status: 24;
    readonly manager_notes: 25;
    readonly last_updated: 26;
    readonly calendar_event_id: 27;
};
type ColName = keyof typeof COLS;
declare class SheetsService {
    private sheets;
    private rowToLead;
    private buildRow;
    private getAllRows;
    findById(id: string): Promise<Lead | null>;
    findByTgId(tgId: number): Promise<Lead | null>;
    findByEmail(email: string): Promise<Lead | null>;
    upsertLead(data: {
        name?: string;
        phone?: string;
        email?: string;
        child_age?: number;
        tg_id?: number;
        tg_username?: string;
        source?: 'tilda' | 'direct_bot';
        gdprAccepted?: boolean;
    }): Promise<string>;
    updateField(leadId: string, field: ColName, value: string | boolean | number): Promise<void>;
    updateLead(leadId: string, data: Partial<Omit<Lead, 'id'>>): Promise<void>;
    appendLog(leadId: string, eventType: string, details: object, actor?: string): Promise<void>;
    private colIndexToLetter;
}
export declare const sheetsService: SheetsService;
export {};
//# sourceMappingURL=sheets.service.d.ts.map