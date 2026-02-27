import type { Telegram } from 'telegraf';
import { getAllAdmins } from './db';
import { logger } from '../logger';

let _telegram: Telegram | null = null;

export function initAdminNotifier(telegram: Telegram): void {
  _telegram = telegram;
}

export async function notifyAdmins(text: string): Promise<void> {
  if (!_telegram) return;
  const admins = getAllAdmins();
  for (const admin of admins) {
    try {
      await _telegram.sendMessage(admin.telegram_id, text, { parse_mode: 'HTML' });
    } catch (err) {
      logger.error('Failed to notify admin', { err, adminId: admin.telegram_id });
    }
  }
}
