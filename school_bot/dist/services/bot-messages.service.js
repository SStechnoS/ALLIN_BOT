"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBotMessage = getBotMessage;
exports.setBotMessage = setBotMessage;
const client_1 = require("../db/client");
const config_1 = require("../config");
const DEFAULTS = {
    welcome_text: "👋 Привет! Добро пожаловать в <b>All In Academy</b> — онлайн-школу английского для детей и подростков 🇬🇧\n\n" +
        "✨ <b>Почему выбирают нас:</b>\n" +
        "👥 Группы по 4–5 человек — каждый ребёнок в фокусе\n" +
        "🌍 Преподаватели — носители языка из США и Великобритании\n" +
        "🎯 Обучение через интересы ребёнка — без скуки и зубрёжки\n" +
        "💻 Онлайн через Zoom — удобно из любой точки мира\n\n" +
        "🎁 Первый урок — <b>бесплатно!</b> Запишитесь прямо сейчас 👇",
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