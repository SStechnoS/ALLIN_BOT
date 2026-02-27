import { getDb } from "../db/client";
import { config } from "../config";

export type BotMessageKey = "welcome_text" | "welcome_video_note_id";

const DEFAULTS: Record<BotMessageKey, string> = {
  welcome_text:
    "Привет! 👋 Добро пожаловать в All In Academy.\n\n" +
    "Мы рады, что вы заботитесь о будущем вашего ребёнка.\n" +
    "Здесь вы можете записаться на бесплатный пробный урок английского.",
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
