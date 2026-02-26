import type { Lead } from '../types';
declare class GSheetsSyncService {
    private sheetsApi;
    private getApi;
    private ensureHeaders;
    private findRowById;
    syncLead(lead: Lead): Promise<void>;
}
export declare const gsheetsSyncService: GSheetsSyncService;
export {};
//# sourceMappingURL=gsheets.sync.d.ts.map