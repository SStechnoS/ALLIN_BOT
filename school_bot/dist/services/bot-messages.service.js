"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBotMessage = getBotMessage;
exports.setBotMessage = setBotMessage;
const client_1 = require("../db/client");
const config_1 = require("../config");
const DEFAULTS = {
    welcome_text: "Привет! 👋 Добро пожаловать в All In Academy.\n\n" +
        "Мы рады, что вы заботитесь о будущем вашего ребёнка.\n" +
        "Здесь вы можете записаться на бесплатный пробный урок английского.",
    welcome_video_note_id: config_1.config.welcomeVideoNoteId,
};
function getBotMessage(key) {
    const row = (0, client_1.getDb)()
        .prepare("SELECT value FROM bot_messages WHERE key = ?")
        .get(key);
    return row?.value || DEFAULTS[key];
}
function setBotMessage(key, value) {
    (0, client_1.getDb)()
        .prepare(`INSERT INTO bot_messages (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(key, value);
}
//# sourceMappingURL=bot-messages.service.js.map