"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminBot = createAdminBot;
const https_1 = __importDefault(require("https"));
const telegraf_1 = require("telegraf");
const config_1 = require("../config");
const logger_1 = require("../logger");
const db_service_1 = require("../services/db.service");
const email_service_1 = require("../services/email.service");
const settings_1 = require("./settings");
// ── Auth guard ────────────────────────────────────────────────
function isAdmin(tgId) {
    return config_1.config.ADMIN_IDS.includes(String(tgId));
}
function adminOnly(ctx, next) {
    if (!isAdmin(ctx.from?.id)) {
        ctx.reply('🚫 Доступ запрещён').catch(() => { });
        return;
    }
    return next();
}
// ── Date format ───────────────────────────────────────────────
function fmtDate(dateStr) {
    if (!dateStr)
        return '—';
    const [year, month, day] = dateStr.split('-').map(Number);
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    return `${dd}.${mm}.${year}`;
}
const postDrafts = new Map();
function safePreview(text, maxLen = 55) {
    const truncated = text.slice(0, maxLen) + (text.length > maxLen ? '...' : '');
    return truncated.replace(/[_*`[]/g, '\\$&');
}
function buildDraftText(draft) {
    const audience = draft.mode === 'all' ? '👥 Все клиенты' : '😔 Не пришедшие';
    const textLine = draft.text
        ? `✏️ Текст: _${safePreview(draft.text)}_`
        : `✏️ Текст: —`;
    const mediaLine = draft.media_type
        ? `🖼 Медиа: ${draft.media_type === 'photo' ? 'Фото ✓' : 'Видео ✓'}`
        : `🖼 Медиа: —`;
    const btnLine = draft.btn_label && draft.btn_url
        ? `🔘 Кнопка: "${safePreview(draft.btn_label, 30)}" ✓`
        : `🔘 Кнопка: —`;
    return [
        `📢 *Конструктор поста*`,
        `Аудитория: ${audience}`,
        ``,
        textLine,
        mediaLine,
        btnLine,
        ``,
        `_Добавьте контент и нажмите Предпросмотр_`,
    ].join('\n');
}
function buildDraftKeyboard(draft) {
    const hasContent = !!(draft.text || draft.media_type);
    const rows = [
        [
            {
                text: draft.text ? '✏️ Изменить текст' : '✏️ Добавить текст',
                callback_data: 'adm:bc_set:text',
            },
            {
                text: draft.media_type
                    ? (draft.media_type === 'photo' ? '🖼 Фото ✓' : '🎬 Видео ✓')
                    : '🖼 Фото / Видео',
                callback_data: 'adm:bc_set:media',
            },
        ],
        draft.btn_label
            ? [
                { text: `🔘 Кнопка ✓`, callback_data: 'adm:bc_set:btn' },
                { text: '✖ Убрать кнопку', callback_data: 'adm:bc_clear_btn' },
            ]
            : [{ text: '🔘 Добавить кнопку', callback_data: 'adm:bc_set:btn' }],
    ];
    if (hasContent) {
        rows.push([{ text: '👁 Предпросмотр', callback_data: 'adm:bc_preview' }]);
        rows.push([{ text: '🚀 Разослать', callback_data: 'adm:bc_send' }]);
    }
    rows.push([{ text: '↩️ Назад', callback_data: 'adm:menu' }]);
    return { inline_keyboard: rows };
}
const pending = new Map();
// ── Main menu keyboard ────────────────────────────────────────
const MAIN_MENU = {
    inline_keyboard: [
        [
            { text: '📊 Статистика', callback_data: 'adm:stats' },
            { text: '📅 Расписание', callback_data: 'adm:schedule' },
        ],
        [
            { text: '📢 Рассылка', callback_data: 'adm:broadcast_menu' },
            { text: '🔍 Найти клиента', callback_data: 'adm:find_user' },
        ],
        [
            { text: '✏️ Редактировать тексты', callback_data: 'adm:edit_menu' },
            { text: '📧 Тест email', callback_data: 'adm:test_email' },
        ],
    ],
};
async function showMainMenu(ctx) {
    await ctx.reply('👑 Admin панель All In Academy\n\nВыберите действие:', {
        reply_markup: MAIN_MENU,
    });
}
// ── Build admin bot ───────────────────────────────────────────
function createAdminBot(mainTelegram) {
    if (!config_1.config.ADMIN_BOT_TOKEN) {
        logger_1.logger.warn('ADMIN_BOT_TOKEN not set — admin bot disabled');
        return null;
    }
    const bot = new telegraf_1.Telegraf(config_1.config.ADMIN_BOT_TOKEN);
    // ── Download file from Telegram into memory buffer ────────
    async function downloadFileBuffer(fileId) {
        const file = await bot.telegram.getFile(fileId);
        const url = `https://api.telegram.org/file/bot${config_1.config.ADMIN_BOT_TOKEN}/${file.file_path}`;
        return new Promise((resolve, reject) => {
            https_1.default.get(url, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            }).on('error', reject);
        });
    }
    // ── Helper: send media post to any chat ───────────────────
    async function sendPost(telegram, chatId, draft) {
        const inlineBtn = draft.btn_label && draft.btn_url
            ? { inline_keyboard: [[{ text: draft.btn_label, url: draft.btn_url }]] }
            : undefined;
        if (draft.media_type === 'photo' && draft.media_buffer) {
            await telegram.sendPhoto(chatId, { source: draft.media_buffer }, {
                caption: draft.text,
                parse_mode: draft.text ? 'HTML' : undefined,
                reply_markup: inlineBtn,
            });
        }
        else if (draft.media_type === 'video' && draft.media_buffer) {
            await telegram.sendVideo(chatId, { source: draft.media_buffer }, {
                caption: draft.text,
                parse_mode: draft.text ? 'HTML' : undefined,
                reply_markup: inlineBtn,
            });
        }
        else if (draft.text) {
            await telegram.sendMessage(chatId, draft.text, {
                parse_mode: 'HTML',
                reply_markup: inlineBtn,
                disable_web_page_preview: false,
            });
        }
    }
    // ── /start ──────────────────────────────────────────────────
    bot.start(adminOnly, async (ctx) => {
        pending.delete(ctx.from.id);
        await showMainMenu(ctx);
    });
    bot.command('menu', adminOnly, async (ctx) => {
        pending.delete(ctx.from.id);
        await showMainMenu(ctx);
    });
    // ── /cancel ──────────────────────────────────────────────────
    bot.command('cancel', adminOnly, async (ctx) => {
        pending.delete(ctx.from.id);
        const draft = postDrafts.get(ctx.from.id);
        if (draft) {
            // Back to builder if draft exists
            await ctx.reply(buildDraftText(draft), {
                parse_mode: 'Markdown',
                reply_markup: buildDraftKeyboard(draft),
            });
        }
        else {
            await showMainMenu(ctx);
        }
    });
    // ── Назад в меню ────────────────────────────────────────────
    bot.action('adm:menu', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        pending.delete(ctx.from.id);
        postDrafts.delete(ctx.from.id);
        await ctx.editMessageText('👑 Admin панель All In Academy\n\nВыберите действие:', {
            reply_markup: MAIN_MENU,
        });
    });
    // ── Статистика — выбор месяца ────────────────────────────────
    const MONTH_NAMES = {
        '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
        '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
        '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь',
    };
    function leadMonth(createdAt) {
        // created_at is ISO format from SQLite: 2026-02-24T12:00:00.000Z
        if (!createdAt)
            return null;
        const match = createdAt.match(/^(\d{4})-(\d{2})/);
        if (!match)
            return null;
        return `${match[1]}-${match[2]}`; // YYYY-MM
    }
    function monthLabel(yyyyMm) {
        const [year, month] = yyyyMm.split('-');
        return `${MONTH_NAMES[month] || month} ${year}`;
    }
    bot.action('adm:stats', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        try {
            const leads = await db_service_1.dbService.getAllLeads();
            // Collect unique months sorted newest first
            const monthCounts = new Map();
            for (const lead of leads) {
                const m = leadMonth(lead.created_at);
                if (m)
                    monthCounts.set(m, (monthCounts.get(m) || 0) + 1);
            }
            const months = [...monthCounts.keys()].sort().reverse();
            const keyboard = [
                [{ text: `📊 За всё время (${leads.length})`, callback_data: 'adm_stats:all' }],
                ...months.map(m => [{
                        text: `📅 ${monthLabel(m)} (${monthCounts.get(m)})`,
                        callback_data: `adm_stats:${m}`,
                    }]),
                [{ text: '↩️ Назад', callback_data: 'adm:menu' }],
            ];
            await ctx.editMessageText('📊 *Статистика*\n\nВыберите период:', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard },
            });
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Admin stats error');
            await ctx.reply('Ошибка при получении статистики');
        }
    });
    // ── Статистика за период ──────────────────────────────────────
    bot.action(/^adm_stats:(.+)$/, adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        const period = ctx.match[1]; // 'all' or 'YYYY-MM'
        try {
            const allLeads = await db_service_1.dbService.getAllLeads();
            const leads = period === 'all'
                ? allLeads
                : allLeads.filter(l => leadMonth(l.created_at) === period);
            const counts = {};
            for (const lead of leads) {
                counts[lead.status] = (counts[lead.status] || 0) + 1;
            }
            const title = period === 'all' ? 'За всё время' : monthLabel(period);
            const text = `📊 *Статистика — ${title}*\n` +
                `Всего лидов: ${leads.length}\n\n` +
                `🆕 Новые: ${counts['NEW'] || 0}\n` +
                `🤖 Активировали бота: ${counts['BOT_ACTIVE'] || 0}\n` +
                `📅 Записаны: ${counts['SCHEDULED'] || 0}\n` +
                `✅ Подтвердили: ${counts['CONFIRMED'] || 0}\n` +
                `🎓 Пришли на урок: ${counts['ATTENDED'] || 0}\n` +
                `❌ Не пришли: ${counts['MISSED'] || 0}\n` +
                `📞 Нужен звонок: ${counts['CALL_NEEDED'] || 0}`;
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `📋 Все карточки (${leads.length})`, callback_data: `adm_stats_cards:${period}` }],
                        [{ text: '↩️ К месяцам', callback_data: 'adm:stats' }],
                        [{ text: '↩️ В меню', callback_data: 'adm:menu' }],
                    ],
                },
            });
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Admin stats period error');
            await ctx.reply('Ошибка');
        }
    });
    // ── Карточки за период ────────────────────────────────────────
    function esc(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    bot.action(/^adm_stats_cards:(.+)$/, adminOnly, async (ctx) => {
        await ctx.answerCbQuery('Загружаю...');
        const period = ctx.match[1];
        try {
            const allLeads = await db_service_1.dbService.getAllLeads();
            const leads = period === 'all'
                ? allLeads
                : allLeads.filter(l => leadMonth(l.created_at) === period);
            if (!leads.length) {
                await ctx.reply('Нет клиентов за этот период');
                return;
            }
            const title = period === 'all' ? 'За всё время' : monthLabel(period);
            await ctx.reply(`📋 <b>${esc(title)}</b> — ${leads.length} клиент(ов)`, { parse_mode: 'HTML' });
            const statusEmoji = {
                NEW: '🆕', BOT_ACTIVE: '🤖', SCHEDULED: '📅',
                CONFIRMED: '✅', ATTENDED: '🎓', MISSED: '❌', CALL_NEEDED: '📞',
            };
            for (const lead of leads) {
                const tgLine = lead.tg_username ? `@${esc(lead.tg_username)}` : '—';
                const lessonLine = lead.lesson_date
                    ? `📅 ${fmtDate(lead.lesson_date)} ${lead.lesson_time}`
                    : '📅 —';
                const cardText = `${statusEmoji[lead.status] || ''} <b>${esc(lead.name)}</b>\n` +
                    `📱 ${esc(lead.phone)}\n` +
                    `💬 ${tgLine}\n` +
                    `${lessonLine}\n` +
                    `✅ Подтвердил: ${lead.confirmed ? 'да' : 'нет'} | 🎓 Пришёл: ${lead.attended ? 'да' : lead.status === 'MISSED' ? 'нет' : '—'}\n` +
                    `📨 Пушей: ${lead.push_count || 0}`;
                const cardKeyboard = lead.lesson_date
                    ? { inline_keyboard: [[
                                { text: '✅ Пришёл', callback_data: `adm_att:${lead.id}:true` },
                                { text: '❌ Не пришёл', callback_data: `adm_att:${lead.id}:false` },
                            ]] }
                    : undefined;
                await ctx.reply(cardText, { parse_mode: 'HTML', reply_markup: cardKeyboard });
            }
            await ctx.reply('✅ Все карточки выведены', {
                reply_markup: { inline_keyboard: [[{ text: '↩️ В меню', callback_data: 'adm:menu' }]] },
            });
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Admin stats cards error');
            await ctx.reply('Ошибка при загрузке карточек');
        }
    });
    // ── Расписание ───────────────────────────────────────────────
    bot.action('adm:schedule', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        try {
            const leads = await db_service_1.dbService.findAllScheduled();
            if (!leads.length) {
                await ctx.editMessageText('📅 Нет запланированных уроков', {
                    reply_markup: {
                        inline_keyboard: [[{ text: '↩️ Назад', callback_data: 'adm:menu' }]],
                    },
                });
                return;
            }
            const dates = [...new Set(leads.map((l) => l.lesson_date))].sort();
            await ctx.editMessageText('📅 Выберите дату:', {
                reply_markup: {
                    inline_keyboard: [
                        ...dates.map((date) => [
                            { text: `📆 ${fmtDate(date)}`, callback_data: `adm_sched:${date}` },
                        ]),
                        [{ text: '↩️ Назад', callback_data: 'adm:menu' }],
                    ],
                },
            });
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Admin schedule error');
            await ctx.reply('Ошибка при получении расписания');
        }
    });
    bot.action(/^adm_sched:(.+)$/, adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        const date = ctx.match[1];
        try {
            const leads = await db_service_1.dbService.findByDate(date);
            if (!leads.length) {
                await ctx.reply(`На ${fmtDate(date)} записей нет`);
                return;
            }
            const sorted = leads.sort((a, b) => a.lesson_time.localeCompare(b.lesson_time));
            await ctx.reply(`📅 <b>${fmtDate(date)}</b> — ${sorted.length} клиент(ов)`, {
                parse_mode: 'HTML',
            });
            for (const lead of sorted) {
                const tgLine = lead.tg_username ? `@${esc(lead.tg_username)}` : '—';
                const confirmedLine = lead.confirmed ? '✅ Подтвердил' : '⏳ Не подтвердил';
                const attendedLine = lead.attended
                    ? '🎓 Пришёл'
                    : lead.status === 'MISSED'
                        ? '❌ Не пришёл'
                        : '';
                const text = [
                    `🕐 <b>${lead.lesson_time}</b>  👤 ${esc(lead.name)}`,
                    `📱 ${esc(lead.phone)}   💬 ${tgLine}`,
                    `${confirmedLine}   📨 Пушей: ${lead.push_count || 0}`,
                    attendedLine,
                ]
                    .filter(Boolean)
                    .join('\n');
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Пришёл', callback_data: `adm_att:${lead.id}:true` },
                                { text: '❌ Не пришёл', callback_data: `adm_att:${lead.id}:false` },
                            ],
                        ],
                    },
                });
            }
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Admin schedule date error');
            await ctx.reply('Ошибка');
        }
    });
    bot.action(/^adm_att:(.+):(true|false)$/, adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        const leadId = ctx.match[1];
        const attended = ctx.match[2] === 'true';
        try {
            await db_service_1.dbService.markAttendance(leadId, attended);
            const label = attended ? '✅ Отмечено: пришёл' : '❌ Отмечено: не пришёл';
            await ctx.editMessageReplyMarkup(undefined);
            await ctx.reply(label);
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Admin attendance error');
            await ctx.reply('Ошибка при сохранении');
        }
    });
    // ═══════════════════════════════════════════════════════════
    // ── Рассылка — Пост-конструктор ─────────────────────────
    // ═══════════════════════════════════════════════════════════
    bot.action('adm:broadcast_menu', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText('📢 *Рассылка*\n\nКому отправить сообщение?', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👥 Всем клиентам', callback_data: 'adm:broadcast:all' }],
                    [{ text: '😔 Кто не пришёл на урок', callback_data: 'adm:broadcast:noshown' }],
                    [{ text: '↩️ Назад', callback_data: 'adm:menu' }],
                ],
            },
        });
    });
    // Select audience → init draft + show builder
    bot.action(/^adm:broadcast:(all|noshown)$/, adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        const mode = ctx.match[1];
        const draft = { mode };
        postDrafts.set(ctx.from.id, draft);
        pending.delete(ctx.from.id);
        await ctx.editMessageText(buildDraftText(draft), {
            parse_mode: 'Markdown',
            reply_markup: buildDraftKeyboard(draft),
        });
    });
    // ── Добавить / изменить текст ────────────────────────────
    bot.action('adm:bc_set:text', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        const draft = postDrafts.get(ctx.from.id);
        if (!draft) {
            await ctx.reply('Сессия истекла. Начните заново через меню.');
            return;
        }
        pending.set(ctx.from.id, { type: 'broadcast_field', field: 'text' });
        const hint = draft.text ? `Текущий текст:\n${draft.text}\n\n` : '';
        await ctx.reply(`✏️ *Текст поста*\n\n${hint}` +
            `Отправьте новый текст.\n\n` +
            `Поддерживается HTML-форматирование:\n` +
            `<code>&lt;b&gt;жирный&lt;/b&gt;</code>\n` +
            `<code>&lt;i&gt;курсив&lt;/i&gt;</code>\n` +
            `<code>&lt;a href="https://..."&gt;ссылка&lt;/a&gt;</code>\n\n` +
            `/cancel — назад к конструктору`, { parse_mode: 'HTML' });
    });
    // ── Добавить / заменить медиа ────────────────────────────
    bot.action('adm:bc_set:media', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        const draft = postDrafts.get(ctx.from.id);
        if (!draft) {
            await ctx.reply('Сессия истекла. Начните заново через меню.');
            return;
        }
        pending.set(ctx.from.id, { type: 'broadcast_field', field: 'media' });
        await ctx.reply('🖼 *Фото или видео*\n\n' +
            'Отправьте фото или видео (максимум 15 секунд).\n\n' +
            '/cancel — назад к конструктору', { parse_mode: 'Markdown' });
    });
    // ── Добавить / изменить кнопку ───────────────────────────
    bot.action('adm:bc_set:btn', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        const draft = postDrafts.get(ctx.from.id);
        if (!draft) {
            await ctx.reply('Сессия истекла. Начните заново через меню.');
            return;
        }
        pending.set(ctx.from.id, { type: 'broadcast_field', field: 'btn_label' });
        await ctx.reply('🔘 *Кнопка — шаг 1 из 2*\n\n' +
            'Введите текст кнопки.\n' +
            'Например: `Записаться на урок`\n\n' +
            '/cancel — назад к конструктору', { parse_mode: 'Markdown' });
    });
    // ── Убрать кнопку ────────────────────────────────────────
    bot.action('adm:bc_clear_btn', adminOnly, async (ctx) => {
        await ctx.answerCbQuery('Кнопка удалена');
        const draft = postDrafts.get(ctx.from.id);
        if (!draft)
            return;
        delete draft.btn_label;
        delete draft.btn_url;
        await ctx.editMessageText(buildDraftText(draft), {
            parse_mode: 'Markdown',
            reply_markup: buildDraftKeyboard(draft),
        });
    });
    // ── Предпросмотр ──────────────────────────────────────────
    bot.action('adm:bc_preview', adminOnly, async (ctx) => {
        await ctx.answerCbQuery('Отправляю предпросмотр...');
        const draft = postDrafts.get(ctx.from.id);
        if (!draft) {
            await ctx.reply('Сессия истекла');
            return;
        }
        try {
            await ctx.reply('👁 *Так увидят клиенты:*', { parse_mode: 'Markdown' });
            await sendPost(mainTelegram, ctx.from.id, draft);
            await ctx.reply('⬆️ Предпросмотр готов.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚀 Разослать', callback_data: 'adm:bc_send' }],
                        [{ text: '✏️ Редактировать', callback_data: 'adm:bc_back' }],
                    ],
                },
            });
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Preview error');
            await ctx.reply('Ошибка предпросмотра');
        }
    });
    // ── Вернуться к конструктору ─────────────────────────────
    bot.action('adm:bc_back', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        const draft = postDrafts.get(ctx.from.id);
        if (!draft) {
            await showMainMenu(ctx);
            return;
        }
        await ctx.reply(buildDraftText(draft), {
            parse_mode: 'Markdown',
            reply_markup: buildDraftKeyboard(draft),
        });
    });
    // ── Разослать ────────────────────────────────────────────
    bot.action('adm:bc_send', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        const draft = postDrafts.get(ctx.from.id);
        if (!draft || (!draft.text && !draft.media_type)) {
            await ctx.reply('Пост пустой — добавьте текст или фото/видео.');
            return;
        }
        try {
            const leads = (await db_service_1.dbService.getAllLeads()).filter(l => {
                if (!l.tg_id)
                    return false;
                if (draft.mode === 'noshown')
                    return l.status === 'MISSED';
                return true;
            });
            await ctx.reply(`📤 Отправляю ${leads.length} сообщений...`);
            let ok = 0, fail = 0;
            for (const lead of leads) {
                try {
                    await sendPost(mainTelegram, lead.tg_id, draft);
                    ok++;
                    await new Promise((r) => setTimeout(r, 50));
                }
                catch (e) {
                    logger_1.logger.error({ tg_id: lead.tg_id, err: e?.message }, 'Broadcast send failed');
                    fail++;
                }
            }
            postDrafts.delete(ctx.from.id);
            await ctx.reply(`✅ Рассылка завершена\n\n📬 Доставлено: ${ok}\n❌ Ошибок: ${fail}`, {
                reply_markup: {
                    inline_keyboard: [[{ text: '↩️ В меню', callback_data: 'adm:menu' }]],
                },
            });
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Broadcast error');
            await ctx.reply('Ошибка при рассылке');
        }
    });
    // ── Найти клиента ─────────────────────────────────────────────
    bot.action('adm:find_user', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        pending.set(ctx.from.id, { type: 'find_user' });
        await ctx.editMessageText('🔍 *Поиск клиента*\n\nВведите номер телефона клиента:\nНапример: +37251234567\n\n/cancel — отменить', { parse_mode: 'Markdown', reply_markup: undefined });
    });
    // ── Редактирование текстов ───────────────────────────────────
    bot.action('adm:edit_menu', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText('✏️ *Редактировать тексты*\n\nВыберите что изменить:', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🤖 AI системный промт', callback_data: 'adm_edit:ai_prompt' }],
                    [{ text: '👋 Приветственное сообщение', callback_data: 'adm_edit:welcome_text' }],
                    [{ text: '🎬 Видео-кружок приветствия', callback_data: 'adm_edit:welcome_video' }],
                    [{ text: '📧 Email #1 (через 30 мин)', callback_data: 'adm_edit:email1_text' }],
                    [{ text: '📧 Email #2 (через 24ч)', callback_data: 'adm_edit:email2_text' }],
                    [{ text: '🔄 Сбросить всё к дефолту', callback_data: 'adm_edit:reset' }],
                    [{ text: '↩️ Назад', callback_data: 'adm:menu' }],
                ],
            },
        });
    });
    bot.action(/^adm_edit:(.+)$/, adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        const key = ctx.match[1];
        if (key === 'reset') {
            (0, settings_1.deleteSetting)('ai_prompt');
            (0, settings_1.deleteSetting)('welcome_text');
            (0, settings_1.deleteSetting)('welcome_video_file_id');
            (0, settings_1.deleteSetting)('email1_text');
            (0, settings_1.deleteSetting)('email2_text');
            await ctx.editMessageText('✅ Все тексты и видео-кружок сброшены к дефолтным значениям', {
                reply_markup: {
                    inline_keyboard: [[{ text: '↩️ В меню', callback_data: 'adm:menu' }]],
                },
            });
            return;
        }
        if (key === 'welcome_video') {
            const current = (0, settings_1.getSetting)('welcome_video_file_id');
            pending.set(ctx.from.id, { type: 'edit_video' });
            await ctx.editMessageText(`🎬 *Видео-кружок приветствия*\n\n` +
                (current ? `Статус: установлен ✓\n\n` : `_Сейчас: не установлен_\n\n`) +
                `Отправьте видео-кружок (кружочек) в этот чат.\n\n/cancel — отменить`, { parse_mode: 'Markdown', reply_markup: undefined });
            return;
        }
        const labels = {
            ai_prompt: '🤖 AI системный промт',
            welcome_text: '👋 Приветственное сообщение',
            email1_text: '📧 Email #1 (30 мин)',
            email2_text: '📧 Email #2 (24ч)',
        };
        pending.set(ctx.from.id, { type: 'edit', key });
        const current = (0, settings_1.getSetting)(key);
        await ctx.editMessageText(`✏️ *${labels[key] || key}*\n\n` +
            (current ? `Текущий текст:\n${current}\n\n` : '_Сейчас используется дефолтный текст_\n\n') +
            `Отправьте новый текст (или /cancel для отмены):`, { parse_mode: 'Markdown', reply_markup: undefined });
    });
    // ── Тест email ───────────────────────────────────────────────
    bot.action('adm:test_email', adminOnly, async (ctx) => {
        await ctx.answerCbQuery();
        pending.set(ctx.from.id, { type: 'test_email' });
        await ctx.editMessageText('📧 *Тест email*\n\nВведите адрес для отправки тестового письма:\nНапример: anna@example.com\n\n/cancel — отменить', { parse_mode: 'Markdown', reply_markup: undefined });
    });
    // ═══════════════════════════════════════════════════════════
    // ── Обработка входящих медиа ──────────────────────────────
    // ═══════════════════════════════════════════════════════════
    bot.on('photo', adminOnly, async (ctx) => {
        const state = pending.get(ctx.from.id);
        if (state?.type !== 'broadcast_field' || state.field !== 'media')
            return;
        const draft = postDrafts.get(ctx.from.id);
        if (!draft)
            return;
        const photos = ctx.message.photo;
        const photo = photos[photos.length - 1]; // largest resolution
        draft.media_type = 'photo';
        draft.media_file_id = photo.file_id;
        draft.media_buffer = await downloadFileBuffer(photo.file_id);
        pending.delete(ctx.from.id);
        await ctx.reply('✅ Фото добавлено!\n\n' + buildDraftText(draft), {
            parse_mode: 'Markdown',
            reply_markup: buildDraftKeyboard(draft),
        });
    });
    bot.on('video', adminOnly, async (ctx) => {
        const state = pending.get(ctx.from.id);
        if (state?.type !== 'broadcast_field' || state.field !== 'media')
            return;
        const draft = postDrafts.get(ctx.from.id);
        if (!draft)
            return;
        const video = ctx.message.video;
        if (video.duration > 15) {
            await ctx.reply(`⚠️ Видео слишком длинное: ${video.duration} сек (максимум 15 сек).\nПопробуйте обрезать и отправить снова, или /cancel`);
            return;
        }
        draft.media_type = 'video';
        draft.media_file_id = video.file_id;
        draft.media_buffer = await downloadFileBuffer(video.file_id);
        pending.delete(ctx.from.id);
        await ctx.reply('✅ Видео добавлено!\n\n' + buildDraftText(draft), {
            parse_mode: 'Markdown',
            reply_markup: buildDraftKeyboard(draft),
        });
    });
    // ═══════════════════════════════════════════════════════════
    // ── Обработка текстовых сообщений ────────────────────────
    // ═══════════════════════════════════════════════════════════
    bot.on('text', adminOnly, async (ctx) => {
        const state = pending.get(ctx.from.id);
        const text = ctx.message.text.trim();
        if (!state) {
            await showMainMenu(ctx);
            return;
        }
        // ── Поля пост-конструктора ──────────────────────────────
        if (state.type === 'broadcast_field') {
            const draft = postDrafts.get(ctx.from.id);
            if (!draft) {
                pending.delete(ctx.from.id);
                await ctx.reply('Сессия истекла. Начните заново через меню.');
                return;
            }
            if (state.field === 'text') {
                pending.delete(ctx.from.id);
                draft.text = text;
                await ctx.reply('✅ Текст сохранён!\n\n' + buildDraftText(draft), {
                    parse_mode: 'Markdown',
                    reply_markup: buildDraftKeyboard(draft),
                });
                return;
            }
            if (state.field === 'media') {
                await ctx.reply('Ожидаю фото или видео — отправьте файл, а не текст. Или /cancel');
                return;
            }
            if (state.field === 'btn_label') {
                draft.btn_label = text;
                pending.set(ctx.from.id, { type: 'broadcast_field', field: 'btn_url' });
                await ctx.reply(`🔘 *Кнопка — шаг 2 из 2*\n\n` +
                    `Текст кнопки: "${text}"\n\n` +
                    `Теперь введите URL ссылки:\n` +
                    `Например: https://t.me/allin_academy_bot\n\n` +
                    `/cancel — назад к конструктору`, { parse_mode: 'Markdown' });
                return;
            }
            if (state.field === 'btn_url') {
                if (!text.startsWith('http://') && !text.startsWith('https://') && !text.startsWith('tg://')) {
                    await ctx.reply('⚠️ URL должен начинаться с https:// или http://\nПопробуйте снова или /cancel');
                    return;
                }
                pending.delete(ctx.from.id);
                draft.btn_url = text;
                await ctx.reply('✅ Кнопка добавлена!\n\n' + buildDraftText(draft), {
                    parse_mode: 'Markdown',
                    reply_markup: buildDraftKeyboard(draft),
                });
                return;
            }
        }
        // ── Поиск клиента ────────────────────────────────────────
        if (state.type === 'find_user') {
            pending.delete(ctx.from.id);
            try {
                const lead = await db_service_1.dbService.findByPhone(text);
                if (!lead) {
                    await ctx.reply('Клиент не найден', {
                        reply_markup: {
                            inline_keyboard: [[{ text: '↩️ В меню', callback_data: 'adm:menu' }]],
                        },
                    });
                    return;
                }
                const tgLine = lead.tg_username ? `@${lead.tg_username}` : '—';
                const statusEmoji = {
                    NEW: '🆕',
                    BOT_ACTIVE: '🤖',
                    SCHEDULED: '📅',
                    CONFIRMED: '✅',
                    ATTENDED: '🎓',
                    MISSED: '❌',
                    CALL_NEEDED: '📞',
                };
                await ctx.reply(`👤 <b>${esc(lead.name)}</b>\n` +
                    `📱 ${esc(lead.phone)}\n` +
                    `📧 ${esc(lead.email)}\n` +
                    `💬 Telegram: ${lead.tg_username ? '@' + esc(lead.tg_username) : '—'}\n` +
                    `${statusEmoji[lead.status] || ''} Статус: ${lead.status}\n` +
                    `📅 Урок: ${lead.lesson_date ? fmtDate(lead.lesson_date) + ' ' + lead.lesson_time : '—'}\n` +
                    `✅ Подтвердил: ${lead.confirmed ? 'да' : 'нет'}\n` +
                    `🎓 Пришёл: ${lead.attended ? 'да' : lead.status === 'MISSED' ? 'нет' : '—'}\n` +
                    `📨 Пушей: ${lead.push_count || 0}\n` +
                    `📝 Заметки: ${esc(lead.teacher_notes || '—')}`, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: '↩️ В меню', callback_data: 'adm:menu' }]],
                    },
                });
            }
            catch (err) {
                logger_1.logger.error({ err }, 'Admin find_user error');
                await ctx.reply('Ошибка при поиске');
            }
            return;
        }
        // ── Тест email ───────────────────────────────────────────
        if (state.type === 'test_email') {
            pending.delete(ctx.from.id);
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
                await ctx.reply('Неверный формат email. Попробуйте снова или /cancel');
                pending.set(ctx.from.id, { type: 'test_email' });
                return;
            }
            try {
                await email_service_1.emailService.sendEmail1(text, 'Тест');
                await ctx.reply(`✅ Тестовое письмо отправлено на ${text}`, {
                    reply_markup: {
                        inline_keyboard: [[{ text: '↩️ В меню', callback_data: 'adm:menu' }]],
                    },
                });
            }
            catch (err) {
                await ctx.reply(`❌ Ошибка: ${err?.message || String(err)}`);
            }
            return;
        }
        // ── Редактирование текста ────────────────────────────────
        if (state.type === 'edit') {
            pending.delete(ctx.from.id);
            (0, settings_1.setSetting)(state.key, text);
            await ctx.reply('✅ Сохранено! Изменение вступит в силу немедленно.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✏️ Изменить ещё', callback_data: 'adm:edit_menu' }],
                        [{ text: '↩️ В меню', callback_data: 'adm:menu' }],
                    ],
                },
            });
        }
    });
    // ── Видео-кружок ─────────────────────────────────────────────
    bot.on('video_note', adminOnly, async (ctx) => {
        const state = pending.get(ctx.from.id);
        if (state?.type !== 'edit_video') {
            await ctx.reply('ℹ️ Чтобы обновить видео-кружок приветствия, зайдите в ✏️ Редактировать тексты → 🎬 Видео-кружок');
            return;
        }
        pending.delete(ctx.from.id);
        const fileId = ctx.message.video_note.file_id;
        (0, settings_1.setSetting)('welcome_video_file_id', fileId);
        await ctx.reply('✅ Видео-кружок сохранён! Будет показан новым пользователям при /start.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✏️ Изменить ещё', callback_data: 'adm:edit_menu' }],
                    [{ text: '↩️ В меню', callback_data: 'adm:menu' }],
                ],
            },
        });
    });
    // Global error handler
    bot.catch((err, ctx) => {
        logger_1.logger.error({ err, userId: ctx.from?.id }, 'Admin bot error');
    });
    return bot;
}
//# sourceMappingURL=admin.bot.js.map