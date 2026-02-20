"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
require("dotenv/config");
function required(key) {
    const value = process.env[key];
    if (!value)
        throw new Error(`Missing required environment variable: ${key}`);
    return value;
}
function optional(key, defaultValue = '') {
    return process.env[key] || defaultValue;
}
exports.config = {
    // Telegram
    BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
    ADMIN_GROUP_ID: required('TELEGRAM_ADMIN_GROUP_ID'),
    MANAGER_USERNAME: required('TELEGRAM_MANAGER_USERNAME'),
    BOT_LINK: optional('BOT_LINK'),
    WELCOME_VIDEO_FILE_ID: optional('WELCOME_VIDEO_FILE_ID'),
    // OpenAI
    OPENAI_API_KEY: required('OPENAI_API_KEY'),
    // Zoom (optional в development — настраивается на этапе деплоя)
    ZOOM_ACCOUNT_ID: optional('ZOOM_ACCOUNT_ID'),
    ZOOM_CLIENT_ID: optional('ZOOM_CLIENT_ID'),
    ZOOM_CLIENT_SECRET: optional('ZOOM_CLIENT_SECRET'),
    // Google
    GOOGLE_SERVICE_ACCOUNT_JSON: { "type": "service_account", "project_id": "allin-488010", "private_key_id": "4d7199e2024d71c0ec967c66ca04178b1cb9ec92", "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDB/QjBfxLDGVn3\nY5QwrMmwoih7B2SXwu2tUXQZH0miX1UQnjydtlI4uz8vWDpC1WV+82ati5+zWvGY\nbTuFe9XwwlAow/ijl8AA7qXRADfV8EUqUXwafJB7VmD2MDKxLnDOskQQz/Kqm2ov\nOrfA2HZbD7qdjVG5RfNMvb6q6oKZrbZGS4UBzui1++w/RTwesoLUaC26Rjonw66h\nQ9ADd4fUf2aIjZJfDjAgQ5zdT0GTPDxM5G3N/m3UbyOo5UjASmLBTTWgMto7BS02\nf4/fRsrKWvc7al+OBVHwdJ6nBWvVVW83gL/sQTP5Wr/qGNCdiBOnHidlfA+7RIl8\n0fhay117AgMBAAECggEABkwgDiQBaGr4xDKr216ol37UIJZPWiveSluUEMK2wbol\niUoRvq7uAWB2vyM2lPfXeSUOpsCbGRfxMtkM7xrjiZLNRl2CQ1FITt9wa5X9ugi4\nPhTyGewERrS5phRPePgAen1H/2G4x3gPHORjlbOROAiNLtMpHYIbUVjxiRvezH1M\nH3xBOSZRKzEAgsLRn1uxtA3rpytZJAwUw9vWLx88GGKbWYNfSdlxjlFSmL4djp5d\nO0+I8rQo2aaw9xkLG2W7H461F7ZHMIGgOI2nKe6N+vEYD5fFG4SBVb6ONRaa446F\nTqwDOXp9jDyXEVHwBSDP05wYNQMGZ/Or3M9mf0o5qQKBgQD0OTbebYebHs1se01/\nSGuQJzjea8bP594qXdtW+8kquk446Y8Wt/6hF7U+5hQYy22u504M0uzvNMwj7xcB\nQWYFawdenuah+lCLHAc97KVS3ykLaEvyten54Bo9QDHs/l356P+jXwO3B7UPDxQ+\nO4+3+2r+KZgLMrAy7bFjARrxGQKBgQDLV7MJ7B0mTVbYWy6AWbLQxiNfTLFQc5x/\n4OgTmPz4+WDM3LI34XPdRqkXJO47pNxZF8M6/PsL+QlDvLFQxKRoQJLkfdqUsP6r\nG0RuotOJL7akzt4Vz8phW/422RnkBFdv3mEd0PWmAkvUH2ydkLz7LR+KFgTwBSu7\n/6nXgicxswKBgA+oo3X7e9hcTzuHZF6m3A6wFRtdua+W5E2/GtMm7a0JqP5JK11/\nipn1lS9lPSCh2nR+bCiyVXK45eXf7I+uC8aJKD3O3mbAT+27bFNyGt+HY3BRzZzQ\nQSI+VjBbL1hMruXZJJrq+qf/nIJMqzWaSAq52hBVxmPhah650sfQSFPxAoGAa06v\nrAfPZjwgHXMY+iDb7bLyTcNyO0uXhiCROG5e6aDoxZOd9UFj3J0CdLVHh3A73ERf\nAc0pSqs0iWuVg1MSk/Wnzy7fX+J7sp5kIaKJ0Xa9gwGsT4Rlf7WFVTqCoELuRZns\nVEjGqcHCdIHU1t3f7QlmAIAYQPXpm3+TCKiluGMCgYEAgf98+Prum69IT0ktY761\njNPaEFRwPB4Co94Wne8fYRHFa0oV/pi3qRB/Vt8IbDwWz20aY4bcUagSA4cKBQWg\nSRB2EdKCvgJktbvrKCdNWx8b27buU47orh41Hn4EM6qgwSj35N/dF+a8By0IgQZi\nwida5IdAgQmwH0Topra2UKQ=\n-----END PRIVATE KEY-----\n", "client_email": "allin-88@allin-488010.iam.gserviceaccount.com", "client_id": "104311888713537591383", "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs", "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/allin-88%40allin-488010.iam.gserviceaccount.com", "universe_domain": "googleapis.com" },
    GOOGLE_SHEETS_ID: required('GOOGLE_SHEETS_ID'),
    GOOGLE_CALENDAR_ID: required('GOOGLE_CALENDAR_ID'),
    // Resend
    RESEND_API_KEY: required('RESEND_API_KEY'),
    RESEND_FROM_EMAIL: optional('RESEND_FROM_EMAIL', 'hello@allinacademy.ee'),
    RESEND_FROM_NAME: optional('RESEND_FROM_NAME', 'All In Academy'),
    // App
    NODE_ENV: optional('NODE_ENV', 'development'),
    APP_PORT: parseInt(optional('APP_PORT', '3000')),
    WEBHOOK_HOST: optional('WEBHOOK_HOST'),
    TILDA_WEBHOOK_SECRET: required('TILDA_WEBHOOK_SECRET'),
    INTERNAL_SECRET: required('INTERNAL_SECRET'),
    // Computed
    get IS_PRODUCTION() { return this.NODE_ENV === 'production'; },
    get MANAGER_LINK() { return `https://t.me/${this.MANAGER_USERNAME.replace('@', '')}`; },
};
//# sourceMappingURL=config.js.map