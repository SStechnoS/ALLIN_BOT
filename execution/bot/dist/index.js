"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fastify_1 = __importDefault(require("fastify"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const telegraf_1 = require("telegraf");
const libphonenumber_js_1 = require("libphonenumber-js");
const config_1 = require("./config");
const logger_1 = require("./logger");
const redis_1 = require("./redis");
const queues_1 = require("./queues");
const sheets_service_1 = require("./services/sheets.service");
const openai_service_1 = require("./services/openai.service");
const ai_guard_1 = require("./services/ai.guard");
const calendar_service_1 = require("./services/calendar.service");
const zoom_service_1 = require("./services/zoom.service");
const scripts_1 = require("./bot/scripts");
// ============================================================
// HELPERS
// ============================================================
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function formatDateRu(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return `${day} ${MONTHS_RU[d.getUTCMonth()]} (${DAYS_RU[d.getUTCDay()]})`;
}
// Постоянное нижнее меню (ReplyKeyboard)
const MAIN_MENU_KEYBOARD = {
    keyboard: [
        [{ text: '📅 Моё бронирование' }, { text: '📞 Связаться с менеджером' }],
        [{ text: '🔄 Перенести урок' }, { text: '❓ Задать вопрос AI' }],
    ],
    resize_keyboard: true,
    persistent: true,
};
async function sendMainMenu(ctx, text = 'Чем могу помочь?') {
    await ctx.reply(text, { reply_markup: MAIN_MENU_KEYBOARD });
}
// ============================================================
// BOT SETUP
// ============================================================
const bot = new telegraf_1.Telegraf(config_1.config.BOT_TOKEN);
// Session middleware (in-memory store)
bot.use((0, telegraf_1.session)({
    store: {
        async get(key) {
            try {
                const val = await redis_1.redis.get(`session:${key}`);
                return val ? JSON.parse(val) : undefined;
            }
            catch {
                return undefined;
            }
        },
        async set(key, value) {
            await redis_1.redis.set(`session:${key}`, JSON.stringify(value), 'EX', 86400);
        },
        async delete(key) {
            await redis_1.redis.del(`session:${key}`);
        }
    }
}));
// Safety guard: ensure ctx.session is always initialized
bot.use(async (ctx, next) => {
    if (!ctx.session)
        ctx.session = {};
    return next();
});
// ============================================================
// GLOBAL HANDLERS
// ============================================================
// /start
bot.start(async (ctx) => {
    ctx.session = {}; // сброс сессии
    await ctx.reply(scripts_1.SCRIPTS.WELCOME_TEXT);
    if (config_1.config.WELCOME_VIDEO_FILE_ID) {
        try {
            await ctx.telegram.sendVideoNote(ctx.chat.id, config_1.config.WELCOME_VIDEO_FILE_ID);
        }
        catch (e) {
            logger_1.logger.warn({ e }, 'sendVideoNote failed, skipping');
        }
    }
    await ctx.reply(scripts_1.SCRIPTS.GDPR_REQUEST, {
        reply_markup: {
            inline_keyboard: [[
                    { text: '✅ Продолжить', callback_data: 'gdpr_accept' },
                    { text: '📄 Политика', url: 'https://allinacademy.ee/privacy' }
                ]]
        }
    });
});
// GDPR accept
bot.action('gdpr_accept', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.gdprAccepted = true;
    // Проверка существующей записи
    const existing = await sheets_service_1.sheetsService.findByTgId(ctx.from.id);
    if (existing?.status === 'SCHEDULED' || existing?.status === 'CONFIRMED') {
        ctx.session.leadId = existing.id;
        await ctx.reply(scripts_1.SCRIPTS.ALREADY_SCHEDULED(existing), { reply_markup: MAIN_MENU_KEYBOARD });
        return;
    }
    // Начать регистрацию
    ctx.session.registrationStep = 'phone';
    // Планируем nudge: если через 2ч регистрация не завершена — напомнить
    await queues_1.flowQueue.add('abandonedFlow', { tgId: ctx.from.id }, { delay: 2 * 60 * 60 * 1000 });
    await ctx.reply(scripts_1.SCRIPTS.PHONE_REQUEST, {
        reply_markup: {
            keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
            one_time_keyboard: true,
            resize_keyboard: true
        }
    });
});
// /help
bot.command('help', async (ctx) => {
    await ctx.reply(scripts_1.SCRIPTS.HELP);
});
// /status
bot.command('status', async (ctx) => {
    const lead = ctx.session.leadId
        ? await sheets_service_1.sheetsService.findById(ctx.session.leadId)
        : await sheets_service_1.sheetsService.findByTgId(ctx.from.id);
    if (!lead || !lead.lesson_date) {
        await ctx.reply(scripts_1.SCRIPTS.STATUS_NO_BOOKING);
        return;
    }
    const text = lead.confirmed ? scripts_1.SCRIPTS.STATUS_CONFIRMED(lead) : scripts_1.SCRIPTS.STATUS_SCHEDULED(lead);
    await ctx.reply(text);
});
// /ai command
bot.command('ai', async (ctx) => {
    ctx.session.prevScene = 'main';
    await ctx.reply(scripts_1.SCRIPTS.AI_ACTIVATED);
});
// /menu
bot.command('menu', async (ctx) => {
    await sendMainMenu(ctx, 'Главное меню 👇');
});
// ============================================================
// REGISTRATION FLOW
// ============================================================
// Телефон через кнопку
bot.on('contact', async (ctx) => {
    if (ctx.session.registrationStep !== 'phone')
        return;
    const phone = ctx.message.contact.phone_number;
    await handlePhone(ctx, phone);
});
// Текстовые сообщения
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const step = ctx.session.registrationStep;
    // Регистрационные шаги
    if (step === 'phone') {
        await handlePhone(ctx, text);
        return;
    }
    if (step === 'email') {
        await handleEmail(ctx, text);
        return;
    }
    if (step === 'name') {
        await handleName(ctx, text);
        return;
    }
    if (step === 'date') {
        return;
    } // InlineKeyboard, текст игнорируем
    // Кнопки главного меню
    if (text === '📅 Моё бронирование') {
        await handleMyBooking(ctx);
        return;
    }
    if (text === '📞 Связаться с менеджером') {
        await handleContactManager(ctx);
        return;
    }
    if (text === '🔄 Перенести урок') {
        await handleRescheduleRequest(ctx);
        return;
    }
    if (text === '❓ Задать вопрос AI') {
        await ctx.reply(scripts_1.SCRIPTS.AI_ACTIVATED);
        return;
    }
    // AI триггер (вне строгих сцен)
    if (ai_guard_1.aiGuard.isAITrigger(text, step || '')) {
        await handleAI(ctx, text);
        return;
    }
    // Социальные фразы — дружелюбный ответ вместо "не понял"
    const SOCIAL_WORDS = new Set([
        'спасибо', 'спс', 'благодарю', 'thanks', 'thank', 'ty',
        'привет', 'hi', 'hello', 'hey', 'здравствуйте', 'здравствуй',
        'ок', 'окей', 'ok', 'okay', 'хорошо', 'ладно', 'понял', 'поняла',
        'понятно', 'принято', 'принял', 'ясно', 'отлично', 'супер', 'круто', 'класс',
        'пока', 'bye', 'до', 'свидания',
        '👍', '👋', '🙏', '😊', '❤️', '🔥', '🎉',
    ]);
    const normalized = text.toLowerCase().trim().replace(/[!.,?…]+$/, '');
    if (normalized.split(/\s+/).every(w => SOCIAL_WORDS.has(w))) {
        await ctx.reply('Всегда рады! 😊\n\nЕсли есть вопросы о школе — /ai\nЗаписаться на урок — /start');
        return;
    }
    await ctx.reply(scripts_1.SCRIPTS.UNKNOWN_MESSAGE);
});
// Видео-кружок (video_note) — логируем file_id для WELCOME_VIDEO_FILE_ID
bot.on('video_note', async (ctx) => {
    const fileId = ctx.message.video_note.file_id;
    logger_1.logger.info({ fileId }, 'video_note received');
    await ctx.reply(`✅ file_id видео-кружка:\n\n<code>${fileId}</code>`, { parse_mode: 'HTML' });
});
// Голосовые сообщения
bot.on('voice', async (ctx) => {
    await ctx.sendChatAction('typing');
    try {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const res = await fetch(fileLink.href);
        const buffer = Buffer.from(await res.arrayBuffer());
        const text = await openai_service_1.openaiService.transcribeVoice(buffer);
        if (!text?.trim()) {
            await ctx.reply('Не смог распознать голосовое. Попробуйте написать текстом.');
            return;
        }
        const step = ctx.session.registrationStep;
        if (step === 'phone') {
            await handlePhone(ctx, text);
            return;
        }
        if (step === 'email') {
            await handleEmail(ctx, text);
            return;
        }
        if (step === 'name') {
            await handleName(ctx, text);
            return;
        }
        await handleAI(ctx, text);
    }
    catch (err) {
        logger_1.logger.error({ err }, 'Voice handler error');
        await ctx.reply('Не смог обработать голосовое. Попробуйте написать текстом.');
    }
});
// ============================================================
// REGISTRATION HANDLERS
// ============================================================
async function handlePhone(ctx, phone) {
    const parsed = (0, libphonenumber_js_1.parsePhoneNumberFromString)(phone, 'EE');
    if (!parsed?.isValid()) {
        await ctx.reply(scripts_1.SCRIPTS.PHONE_INVALID);
        return;
    }
    ctx.session.phone = parsed.format('E.164');
    ctx.session.registrationStep = 'email';
    await ctx.reply(scripts_1.SCRIPTS.PHONE_OK, { reply_markup: { remove_keyboard: true } });
    await ctx.reply(scripts_1.SCRIPTS.EMAIL_REQUEST);
}
async function handleEmail(ctx, email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        await ctx.reply(scripts_1.SCRIPTS.EMAIL_INVALID);
        return;
    }
    ctx.session.email = email.toLowerCase();
    ctx.session.registrationStep = 'name';
    await ctx.reply(scripts_1.SCRIPTS.EMAIL_OK);
    await ctx.reply(scripts_1.SCRIPTS.NAME_REQUEST);
}
async function handleName(ctx, name) {
    if (name.length < 2 || name.length > 60) {
        await ctx.reply('Введите корректное имя (2–60 символов)');
        return;
    }
    ctx.session.name = name;
    ctx.session.registrationStep = 'date';
    // Сохранить в GSheets
    const leadId = await sheets_service_1.sheetsService.upsertLead({
        name, phone: ctx.session.phone, email: ctx.session.email,
        tg_id: ctx.from.id, tg_username: ctx.from.username,
        source: 'direct_bot', gdprAccepted: ctx.session.gdprAccepted
    });
    ctx.session.leadId = leadId;
    await sheets_service_1.sheetsService.updateField(leadId, 'bot_activated', true);
    await sheets_service_1.sheetsService.updateField(leadId, 'bot_activated_at', new Date().toISOString());
    await sheets_service_1.sheetsService.updateField(leadId, 'status', 'BOT_ACTIVE');
    await ctx.reply(scripts_1.SCRIPTS.NAME_OK(name));
    await showDatePicker(ctx);
}
// ============================================================
// MAIN MENU HANDLERS
// ============================================================
async function handleMyBooking(ctx) {
    const lead = ctx.session.leadId
        ? await sheets_service_1.sheetsService.findById(ctx.session.leadId)
        : await sheets_service_1.sheetsService.findByTgId(ctx.from.id);
    if (!lead || !lead.lesson_date) {
        await ctx.reply('У вас нет активной записи.\n\nНажмите /start чтобы записаться на бесплатный пробный урок.');
        return;
    }
    const zoomLine = lead.zoom_link
        ? `\n📹 Zoom: ${lead.zoom_link}`
        : '\n📹 Ссылка на Zoom будет отправлена за 24 ч до урока';
    const statusLine = lead.confirmed ? '✅ Подтверждено' : '⏳ Ожидает подтверждения';
    await ctx.reply(`📋 Ваше бронирование:\n\n` +
        `📅 ${formatDateRu(lead.lesson_date)}\n` +
        `🕐 ${lead.lesson_time} (по Таллину)` +
        zoomLine +
        `\n\n🔖 Статус: ${statusLine}`);
}
async function handleContactManager(ctx) {
    await ctx.reply('Напишите нашему менеджеру напрямую:', {
        reply_markup: {
            inline_keyboard: [[{ text: '💬 Написать менеджеру', url: config_1.config.MANAGER_LINK }]]
        }
    });
}
const RESCHEDULE_CUTOFF_MS = 3 * 60 * 60 * 1000; // 3 часа
async function performReschedule(lead, tgId) {
    // Освободить слот в Google Calendar
    if (lead.calendar_event_id) {
        try {
            await calendar_service_1.calendarService.freeSlot(lead.calendar_event_id);
        }
        catch (err) {
            logger_1.logger.warn({ err, eventId: lead.calendar_event_id }, 'Failed to free calendar slot');
        }
    }
    // Удалить Zoom-встречу
    if (lead.zoom_meeting_id && config_1.config.ZOOM_ACCOUNT_ID) {
        try {
            await zoom_service_1.zoomService.deleteMeeting(lead.zoom_meeting_id);
        }
        catch (err) {
            logger_1.logger.warn({ err, meetingId: lead.zoom_meeting_id }, 'Failed to delete zoom meeting');
        }
    }
    // Очистить данные урока в GSheets
    await sheets_service_1.sheetsService.updateLead(lead.id, {
        lesson_date: '', lesson_time: '', lesson_datetime: '',
        zoom_link: '', zoom_meeting_id: '', calendar_event_id: '',
        confirmed: false, confirmed_at: '', status: 'BOT_ACTIVE',
    });
    await sheets_service_1.sheetsService.appendLog(lead.id, 'RESCHEDULED', { via: 'self_service' });
    // Уведомить менеджера
    const tgUsernameR = lead.tg_username ? `@${lead.tg_username}` : '—';
    await bot.telegram.sendMessage(config_1.config.ADMIN_GROUP_ID, `🔄 САМОПЕРЕНОС\n\n👤 ${lead.name}\n📱 ${lead.phone}\n💬 Telegram: ${tgUsernameR}\n📅 Был: ${lead.lesson_date} в ${lead.lesson_time}`);
}
async function handleRescheduleRequest(ctx) {
    const lead = ctx.session.leadId
        ? await sheets_service_1.sheetsService.findById(ctx.session.leadId)
        : await sheets_service_1.sheetsService.findByTgId(ctx.from.id);
    if (!lead || !lead.lesson_date) {
        await ctx.reply('У вас нет активной записи для переноса.');
        return;
    }
    // Проверка: перенос только за 3+ часа до урока
    const lessonMs = lead.lesson_datetime ? new Date(lead.lesson_datetime).getTime() : 0;
    if (lessonMs > 0 && lessonMs - Date.now() < RESCHEDULE_CUTOFF_MS) {
        await ctx.reply(`Перенос возможен не позднее чем за 3 часа до урока.\n\n` +
            `До вашего урока осталось менее 3 часов.\n\nНапишите менеджеру — он постарается помочь:`, { reply_markup: { inline_keyboard: [[{ text: '💬 Написать менеджеру', url: config_1.config.MANAGER_LINK }]] } });
        return;
    }
    try {
        await performReschedule(lead, ctx.from.id);
        ctx.session.leadId = lead.id;
        ctx.session.registrationStep = 'date';
        await ctx.reply('Запись отменена ✅\n\nВыберите новое удобное время:');
        await showDatePicker(ctx);
    }
    catch (err) {
        logger_1.logger.error({ err }, 'handleRescheduleRequest error');
        await ctx.reply(scripts_1.SCRIPTS.ERROR_GENERIC);
    }
}
// ============================================================
// DATE PICKER
// ============================================================
async function showDatePicker(ctx) {
    await ctx.sendChatAction('typing');
    try {
        const slots = await calendar_service_1.calendarService.getAvailableSlots();
        if (!slots.length) {
            await ctx.reply(scripts_1.SCRIPTS.NO_SLOTS, {
                reply_markup: {
                    inline_keyboard: [[{ text: '📞 Написать менеджеру', url: config_1.config.MANAGER_LINK }]]
                }
            });
            return;
        }
        const dates = [...new Set(slots.map(s => s.date))];
        const keyboard = dates.map(date => [{ text: `📅 ${formatDateRu(date)}`, callback_data: `date:${date}` }]);
        await ctx.reply(scripts_1.SCRIPTS.PICK_DATE, { reply_markup: { inline_keyboard: keyboard } });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'showDatePicker error');
        await ctx.reply(scripts_1.SCRIPTS.ERROR_GENERIC);
    }
}
// Выбрана дата → показать доступное время
bot.action(/^date:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const date = ctx.match[1];
    try {
        const slots = await calendar_service_1.calendarService.getAvailableSlots();
        const timesForDate = slots.filter(s => s.date === date);
        if (!timesForDate.length) {
            const remaining = [...new Set(slots.map(s => s.date))];
            const keyboard = remaining.length
                ? remaining.map(d => [{ text: `📅 ${formatDateRu(d)}`, callback_data: `date:${d}` }])
                : [[{ text: '📞 Менеджеру', url: config_1.config.MANAGER_LINK }]];
            await ctx.editMessageText('К сожалению, этот день уже занят 😔\n\nВыберите другой:', { reply_markup: { inline_keyboard: keyboard } });
            return;
        }
        const keyboard = [
            ...timesForDate.map(slot => [{ text: `🕐 ${slot.time}`, callback_data: `slot:${slot.eventId}` }]),
            [{ text: '← Другой день', callback_data: 'back_to_dates' }]
        ];
        await ctx.editMessageText(scripts_1.SCRIPTS.PICK_TIME(formatDateRu(date)), { reply_markup: { inline_keyboard: keyboard } });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'date selection error');
        await ctx.reply(scripts_1.SCRIPTS.ERROR_GENERIC);
    }
});
// Выбрано время → подтверждение
bot.action(/^slot:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const eventId = ctx.match[1];
    try {
        const slots = await calendar_service_1.calendarService.getAvailableSlots();
        const slot = slots.find(s => s.eventId === eventId);
        if (!slot) {
            await ctx.editMessageText('Этот слот уже занят 😔');
            await showDatePicker(ctx);
            return;
        }
        ctx.session.selectedCalEventId = slot.eventId;
        ctx.session.selectedDate = slot.date;
        ctx.session.selectedTime = slot.time;
        ctx.session.lessonDatetime = slot.startDatetime;
        await ctx.editMessageText(scripts_1.SCRIPTS.CONFIRM_BOOKING(formatDateRu(slot.date), slot.time), {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Подтвердить запись', callback_data: 'confirm_booking' }],
                    [{ text: '← Другое время', callback_data: `date:${slot.date}` }],
                    [{ text: '← Другой день', callback_data: 'back_to_dates' }],
                ]
            }
        });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'slot selection error');
        await ctx.reply(scripts_1.SCRIPTS.ERROR_GENERIC);
    }
});
// Назад к выбору дат
bot.action('back_to_dates', async (ctx) => {
    await ctx.answerCbQuery();
    try {
        const slots = await calendar_service_1.calendarService.getAvailableSlots();
        if (!slots.length) {
            await ctx.editMessageText(scripts_1.SCRIPTS.NO_SLOTS, {
                reply_markup: { inline_keyboard: [[{ text: '📞 Менеджеру', url: config_1.config.MANAGER_LINK }]] }
            });
            return;
        }
        const dates = [...new Set(slots.map(s => s.date))];
        const keyboard = dates.map(date => [{ text: `📅 ${formatDateRu(date)}`, callback_data: `date:${date}` }]);
        await ctx.editMessageText(scripts_1.SCRIPTS.PICK_DATE, { reply_markup: { inline_keyboard: keyboard } });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'back_to_dates error');
        await ctx.reply(scripts_1.SCRIPTS.ERROR_GENERIC);
    }
});
// Подтверждение бронирования
bot.action('confirm_booking', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const { selectedCalEventId, selectedDate, selectedTime, lessonDatetime, leadId, name, phone, email } = ctx.session;
    if (!selectedCalEventId || !selectedDate || !selectedTime || !leadId) {
        await ctx.reply('Что-то пошло не так. Попробуйте /start');
        return;
    }
    try {
        // Пометить слот как занятый в Google Calendar
        await calendar_service_1.calendarService.markSlotBusy(selectedCalEventId, name || 'Клиент');
        // Создать Zoom-встречу
        const lessonDatetime_ = lessonDatetime || new Date().toISOString();
        let zoomLink = '';
        let zoomMeetingId = '';
        if (config_1.config.ZOOM_ACCOUNT_ID && config_1.config.ZOOM_CLIENT_ID && config_1.config.ZOOM_CLIENT_SECRET) {
            const meeting = await zoom_service_1.zoomService.createMeeting(`All In Academy — Пробный урок (${name || 'Клиент'})`, lessonDatetime_);
            zoomLink = meeting.join_url;
            zoomMeetingId = String(meeting.id);
        }
        // Сохранить в GSheets
        await sheets_service_1.sheetsService.updateLead(leadId, {
            lesson_date: selectedDate,
            lesson_time: selectedTime,
            lesson_datetime: lessonDatetime_,
            zoom_link: zoomLink,
            zoom_meeting_id: zoomMeetingId,
            calendar_event_id: selectedCalEventId,
            status: 'SCHEDULED',
        });
        await sheets_service_1.sheetsService.appendLog(leadId, 'SCHEDULED', { date: selectedDate, time: selectedTime, zoom: zoomLink });
        // Запланировать напоминание T-24h
        const lessonMs = new Date(lessonDatetime_).getTime();
        const delay24h = lessonMs - Date.now() - 24 * 60 * 60 * 1000;
        if (delay24h > 60000) {
            await queues_1.remindersQueue.add('remind24h', {
                leadId, tgId: ctx.from.id,
                lessonDate: selectedDate, lessonTime: selectedTime,
                lessonDatetime: lessonDatetime_,
                zoomLink: zoomLink || 'Ссылка будет отправлена позже',
                name: name || '',
            }, { delay: delay24h, attempts: 3, backoff: { type: 'exponential', delay: 60000 } });
        }
        // Уведомить менеджера
        const tgUsername = ctx.from.username ? `@${ctx.from.username}` : '—';
        await bot.telegram.sendMessage(config_1.config.ADMIN_GROUP_ID, `🟢 НОВАЯ ЗАПИСЬ\n\n` +
            `👤 ${name}\n📱 ${phone || '—'}\n📧 ${email || '—'}\n` +
            `💬 Telegram: ${tgUsername}\n` +
            `📅 ${selectedDate} в ${selectedTime} (Таллин)\n📹 ${zoomLink || '—'}`);
        // Очистить данные выбора из сессии
        ctx.session.selectedCalEventId = undefined;
        ctx.session.selectedDate = undefined;
        ctx.session.selectedTime = undefined;
        ctx.session.lessonDatetime = undefined;
        ctx.session.registrationStep = undefined;
        // Убрать inline-кнопки с сообщения выбора
        const zoomText = zoomLink
            ? `\n\n📹 Zoom-ссылка для входа:\n${zoomLink}`
            : `\n\n📹 Ссылка на Zoom будет отправлена за 24 часа до урока.`;
        await ctx.editMessageText(`🎉 Вы записаны на пробный урок!\n\n` +
            `📅 ${formatDateRu(selectedDate)}\n🕐 ${selectedTime} (по Таллину)` +
            zoomText);
        // Показать главное меню
        await sendMainMenu(ctx, 'Используйте меню для управления записью 👇');
    }
    catch (err) {
        logger_1.logger.error({ err }, 'confirm_booking error');
        await ctx.reply(scripts_1.SCRIPTS.ERROR_GENERIC);
    }
});
// ============================================================
// AI HANDLER
// ============================================================
async function handleAI(ctx, text) {
    try {
        await ctx.sendChatAction('typing');
        const response = await openai_service_1.openaiService.chat(ctx.from.id, text);
        await ctx.reply(response);
    }
    catch (err) {
        logger_1.logger.error({ err }, 'AI handler error');
        await ctx.reply(`Сейчас AI-ассистент недоступен. Напишите менеджеру: ${config_1.config.MANAGER_LINK}`);
    }
}
bot.action('activate_ai', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(scripts_1.SCRIPTS.AI_ACTIVATED);
});
// ============================================================
// CONFIRMATION CALLBACKS (от напоминаний BullMQ)
// ============================================================
bot.action(/^confirm:(.+)$/, async (ctx) => {
    const leadId = ctx.match[1];
    await ctx.answerCbQuery('✅ Подтверждено!');
    await sheets_service_1.sheetsService.updateLead(leadId, {
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        status: 'CONFIRMED'
    });
    await sheets_service_1.sheetsService.appendLog(leadId, 'CONFIRMED', {});
    const lead = await sheets_service_1.sheetsService.findById(leadId);
    if (lead) {
        const tgUsername = lead.tg_username ? `@${lead.tg_username}` : '—';
        const adminMsg = `🟢 ПОДТВЕРДИЛ УЧАСТИЕ\n\n` +
            `👤 ${lead.name}\n📱 ${lead.phone}\n📧 ${lead.email}\n` +
            `💬 Telegram: ${tgUsername}\n` +
            `📅 ${lead.lesson_date} в ${lead.lesson_time}\n📹 ${lead.zoom_link}`;
        await bot.telegram.sendMessage(config_1.config.ADMIN_GROUP_ID, adminMsg);
        await ctx.editMessageText(scripts_1.SCRIPTS.CONFIRMATION_SUCCESS(lead));
    }
});
bot.action(/^reschedule:(.+)$/, async (ctx) => {
    const leadId = ctx.match[1];
    await ctx.answerCbQuery();
    const lead = await sheets_service_1.sheetsService.findById(leadId);
    if (!lead || !lead.lesson_date) {
        await ctx.editMessageText('Запись не найдена.');
        return;
    }
    // Проверка 3ч
    const lessonMs = lead.lesson_datetime ? new Date(lead.lesson_datetime).getTime() : 0;
    if (lessonMs > 0 && lessonMs - Date.now() < RESCHEDULE_CUTOFF_MS) {
        await ctx.editMessageText(`Перенос возможен не позднее чем за 3 часа до урока.\n\n` +
            `Напишите менеджеру:`, { reply_markup: { inline_keyboard: [[{ text: '💬 Написать менеджеру', url: config_1.config.MANAGER_LINK }]] } });
        return;
    }
    try {
        await performReschedule(lead, ctx.from.id);
        ctx.session.leadId = lead.id;
        ctx.session.registrationStep = 'date';
        await ctx.editMessageText('Запись отменена ✅');
        await ctx.reply('Выберите новое удобное время:');
        await showDatePicker(ctx);
    }
    catch (err) {
        logger_1.logger.error({ err }, 'reschedule action error');
        await ctx.reply(scripts_1.SCRIPTS.ERROR_GENERIC);
    }
});
bot.action('show_status', async (ctx) => {
    await ctx.answerCbQuery();
    const lead = ctx.session.leadId ? await sheets_service_1.sheetsService.findById(ctx.session.leadId) : null;
    if (lead?.lesson_date) {
        await ctx.reply(lead.confirmed ? scripts_1.SCRIPTS.STATUS_CONFIRMED(lead) : scripts_1.SCRIPTS.STATUS_SCHEDULED(lead));
    }
});
// Глобальный error handler
bot.catch((err, ctx) => {
    logger_1.logger.error({ err, userId: ctx.from?.id }, 'Bot error');
    ctx.reply(scripts_1.SCRIPTS.ERROR_GENERIC).catch(() => { });
});
// ============================================================
// TILDA WEBHOOK
// ============================================================
async function handleTildaWebhook(body) {
    // Нормализация: Tilda может слать поля с заглавной буквы (Name, Phone, Email)
    logger_1.logger.debug({ body }, 'Tilda webhook raw body');
    const normalized = {};
    for (const [k, v] of Object.entries(body)) {
        normalized[k.toLowerCase()] = String(v || '');
    }
    const name = normalized['name'] || '';
    const phone = normalized['phone'] || '';
    const email = normalized['email'] || '';
    const child_age = normalized['child_age'] || normalized['age'] || '0';
    logger_1.logger.info({ name, phone, email, child_age }, 'Tilda lead fields parsed');
    if (!name && !phone && !email) {
        logger_1.logger.warn({ body }, 'Tilda webhook: empty lead, skipping');
        return;
    }
    const leadId = await sheets_service_1.sheetsService.upsertLead({
        name, phone, email,
        child_age: parseInt(child_age || '0'),
        source: 'tilda'
    });
    // Запустить email-цепочку (только если есть email)
    if (email) {
        await queues_1.emailChainQueue.add('email1', { leadId, email, name, phone }, { delay: 30 * 60 * 1000, attempts: 3, backoff: { type: 'exponential', delay: 60000 } });
    }
    else {
        logger_1.logger.info({ leadId }, 'Tilda lead: no email, skipping email chain');
    }
    logger_1.logger.info({ leadId, name, email }, 'Tilda lead processed');
}
// ============================================================
// FASTIFY SERVER
// ============================================================
const app = (0, fastify_1.default)({ logger: false });
app.register(formbody_1.default); // поддержка application/x-www-form-urlencoded (Tilda)
// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
// Tilda webhook
app.post('/webhook/tilda', {
    schema: { headers: { type: 'object' } }
}, async (req, reply) => {
    const body = req.body;
    // Tilda тест-пинг: тело = "test=true" — пропускаем без проверки секрета
    if (body?.test === 'true') {
        logger_1.logger.info('Tilda webhook: test ping OK');
        return reply.send({ ok: true });
    }
    // Tilda может слать секрет: в теле запроса (поле 'secret'), заголовке, или query param
    const secret = body?.secret ||
        req.query?.secret ||
        req.headers['x-tilda-secret'] ||
        req.headers['x-secret'];
    if (config_1.config.TILDA_WEBHOOK_SECRET && secret !== config_1.config.TILDA_WEBHOOK_SECRET) {
        logger_1.logger.warn({ receivedSecret: secret }, 'Tilda webhook: invalid secret');
        return reply.code(403).send({ error: 'Forbidden' });
    }
    try {
        await handleTildaWebhook(body);
        return reply.send({ ok: true });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'Tilda webhook error');
        return reply.code(500).send({ error: 'Internal error' });
    }
});
// Telegram webhook
app.post('/webhook/telegram', async (req, reply) => {
    try {
        await bot.handleUpdate(req.body);
        return reply.send({ ok: true });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'Telegram webhook error');
        return reply.code(500).send({ error: 'Internal error' });
    }
});
// ============================================================
// STARTUP
// ============================================================
async function main() {
    // Inject bot into workers
    (0, queues_1.injectBot)(bot);
    // Start BullMQ workers
    (0, queues_1.startWorkers)();
    // Setup Telegram webhook or polling
    if (config_1.config.IS_PRODUCTION && config_1.config.WEBHOOK_HOST) {
        const webhookUrl = `${config_1.config.WEBHOOK_HOST}/webhook/telegram`;
        await bot.telegram.setWebhook(webhookUrl);
        logger_1.logger.info({ webhookUrl }, 'Telegram webhook set');
    }
    else {
        // Development: use polling
        bot.launch();
        logger_1.logger.info('Bot started in polling mode (development)');
    }
    // Start HTTP server
    await app.listen({ port: config_1.config.APP_PORT, host: '0.0.0.0' });
    logger_1.logger.info({ port: config_1.config.APP_PORT }, 'Server started');
}
main().catch((err) => {
    logger_1.logger.error({ err }, 'Fatal startup error');
    process.exit(1);
});
// Graceful shutdown
process.once('SIGINT', async () => {
    bot.stop('SIGINT');
    await app.close();
    await redis_1.redis.quit();
});
process.once('SIGTERM', async () => {
    bot.stop('SIGTERM');
    await app.close();
    await redis_1.redis.quit();
});
//# sourceMappingURL=index.js.map