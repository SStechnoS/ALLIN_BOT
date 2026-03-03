"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
require("dotenv/config");
const path_1 = __importDefault(require("path"));
function required(key) {
    const value = process.env[key];
    if (!value)
        throw new Error(`Missing required env var: ${key}`);
    return value;
}
function requiredJson(key) {
    const value = required(key);
    try {
        JSON.parse(value);
    }
    catch {
        throw new Error(`Env var ${key} must be valid JSON`);
    }
    return value;
}
exports.config = {
    bot: {
        token: required('BOT_TOKEN'),
    },
    adminBot: {
        token: process.env['ADMIN_BOT_TOKEN'] ?? '',
        password: process.env['ADMIN_BOT_PASSWORD'] ?? '',
    },
    db: {
        path: path_1.default.resolve(process.env['DB_PATH'] ?? './data/bot.db'),
    },
    google: {
        calendarId: required('GOOGLE_CALENDAR_ID'),
        serviceAccountJson: requiredJson('GOOGLE_SERVICE_ACCOUNT_JSON'),
        sheetsId: process.env['GOOGLE_SHEETS_ID'] ?? '',
    },
    zoom: {
        accountId: required('ZOOM_ACCOUNT_ID'),
        clientId: required('ZOOM_CLIENT_ID'),
        clientSecret: required('ZOOM_CLIENT_SECRET'),
    },
    openai: {
        apiKey: process.env['OPENAI_API_KEY'] ?? '',
    },
    resend: {
        apiKey: process.env['RESEND_API_KEY'] ?? '',
        from: process.env['RESEND_FROM_EMAIL'] ?? '',
    },
    welcomeVideoNoteId: process.env['WELCOME_VIDEO_NOTE_ID'] ?? '',
    managerContactUrl: process.env['MANAGER_CONTACT_URL'] ?? '',
    privacyPolicyUrl: required('PRIVACY_POLICY_URL'),
    timezone: process.env['TIMEZONE'] ?? 'Europe/Moscow',
    tildaWebhook: process.env['TILDA_WEBHOOK'] ?? '',
    webhookPort: parseInt(process.env['WEBHOOK_PORT'] ?? '3001', 10),
    publicUrl: process.env['PUBLIC_URL'] ?? '',
    env: (process.env['NODE_ENV'] ?? 'development'),
    isDev: (process.env['NODE_ENV'] ?? 'development') === 'development',
};
//# sourceMappingURL=config.js.map