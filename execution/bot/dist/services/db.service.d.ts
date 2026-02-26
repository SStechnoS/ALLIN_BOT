import type { Lead } from '../types';
declare class DbService {
    rowToLead(row: any): Lead;
    findById(id: string): Promise<Lead | null>;
    findByTgId(tgId: number): Promise<Lead | null>;
    findByEmail(email: string): Promise<Lead | null>;
    findByPhone(phone: string): Promise<Lead | null>;
    findByDate(date: string): Promise<Lead[]>;
    findAllScheduled(): Promise<Lead[]>;
    getAllLeads(): Promise<Lead[]>;
    getAllRows(): Promise<Lead[]>;
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
    updateField(leadId: string, field: string, value: any): Promise<void>;
    updateLead(leadId: string, data: Partial<Omit<Lead, 'id'>>): Promise<void>;
    incrementPushCount(leadId: string): Promise<void>;
    markAttendance(leadId: string, attended: boolean): Promise<void>;
    appendLog(leadId: string, eventType: string, details: object, actor?: string): Promise<void>;
}
export declare const dbService: DbService;
export declare const sheetsService: DbService;
export {};
//# sourceMappingURL=db.service.d.ts.map