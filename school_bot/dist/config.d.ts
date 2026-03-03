import 'dotenv/config';
export declare const config: {
    readonly bot: {
        readonly token: string;
    };
    readonly adminBot: {
        readonly token: string;
        readonly password: string;
    };
    readonly db: {
        readonly path: string;
    };
    readonly google: {
        readonly calendarId: string;
        readonly serviceAccountJson: string;
        readonly sheetsId: string;
    };
    readonly zoom: {
        readonly accountId: string;
        readonly clientId: string;
        readonly clientSecret: string;
    };
    readonly openai: {
        readonly apiKey: string;
    };
    readonly resend: {
        readonly apiKey: string;
        readonly from: string;
    };
    readonly welcomeVideoNoteId: string;
    readonly managerContactUrl: string;
    readonly privacyPolicyUrl: string;
    readonly timezone: string;
    readonly tildaWebhook: string;
    readonly webhookPort: number;
    readonly publicUrl: string;
    readonly env: "development" | "production";
    readonly isDev: boolean;
};
//# sourceMappingURL=config.d.ts.map