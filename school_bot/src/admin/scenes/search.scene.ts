import { Scenes } from 'telegraf';
import type { AdminBotContext } from '../types';
import { searchUsers } from '../db';
import { sendAdminMenu } from '../handlers/menu.handler';
import { formatDay, formatTime } from '../../utils/format';

export const SCENE_ADMIN_SEARCH = 'admin_search';

export const adminSearchScene = new Scenes.BaseScene<AdminBotContext>(SCENE_ADMIN_SEARCH);

adminSearchScene.enter(async (ctx) => {
  await ctx.reply('🔍 Введите имя, телефон, email или Telegram username/ID:');
});

adminSearchScene.on('message', async (ctx) => {
  if (!('text' in ctx.message)) return;

  const query = ctx.message.text.trim();
  const users = searchUsers(query);

  if (users.length === 0) {
    await ctx.reply('Клиентов не найдено.');
  } else {
    const lines = users.map((u, i) => {
      const bookingLine = u.event_start
        ? `\n   📅 ${formatDay(new Date(u.event_start * 1000))}, ${formatTime(new Date(u.event_start * 1000))} ${u.lesson_confirmed_at ? '✅' : '❓'}`
        : '\n   📅 нет записи';

      const tg = u.telegram_name ? `@${u.telegram_name}` : `ID: ${u.telegram_id}`;
      return (
        `${i + 1}. <b>${u.name ?? '—'}</b>\n` +
        `   📞 ${u.phone ?? '—'}\n` +
        `   📧 ${u.email ?? '—'}\n` +
        `   💬 ${tg}` +
        bookingLine
      );
    });

    await ctx.reply(`🔍 <b>Результаты (${users.length}):</b>\n\n${lines.join('\n\n')}`, {
      parse_mode: 'HTML',
    });
  }

  await ctx.scene.leave();
  await sendAdminMenu(ctx, '🔍 Новый поиск — снова нажмите «Найти клиента».');
});
