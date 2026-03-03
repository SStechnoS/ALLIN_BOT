import { getDb } from "../db/client";
import { config } from "../config";

export type BotMessageKey = "welcome_text" | "welcome_video_note_id";

const DEFAULTS: Record<BotMessageKey, string> = {
  welcome_text:
    "👋 Привет! Добро пожаловать в <b>All In Academy</b> — онлайн-школу английского для детей и подростков 🇬🇧\n\n" +
    "✨ <b>Почему выбирают нас:</b>\n" +
    "👥 Группы по 4–5 человек — каждый ребёнок в фокусе\n" +
    "🌍 Преподаватели — носители языка из США и Великобритании\n" +
    "🎯 Обучение через интересы ребёнка — без скуки и зубрёжки\n" +
    "💻 Онлайн через Zoom — удобно из любой точки мира\n\n" +
    "🎁 Первый урок — <b>бесплатно!</b> Запишитесь прямо сейчас 👇",
  welcome_video_note_id: config.welcomeVideoNoteId,
};

export function getBotMessage(key: BotMessageKey): string {
  const row = getDb()
    .prepare<
      [string],
      { value: string }
    >("SELECT value FROM bot_messages WHERE key = ?")
    .get(key);
  return row?.value || DEFAULTS[key];
}

export function setBotMessage(key: BotMessageKey, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO bot_messages (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}
