"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flowQueue = exports.remindersQueue = exports.emailChainQueue = void 0;
exports.injectBot = injectBot;
exports.startWorkers = startWorkers;
/**
 * Simple job scheduler — replaces BullMQ + Redis.
 * Uses setTimeout + JSON file persistence (jobs survive restarts).
 * Zero external dependencies required.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../logger");
const db_service_1 = require("../services/db.service");
function nowTs() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}
// YYYY-MM-DD → DD.MM.YYYY
function fmtDate(dateStr) {
    if (!dateStr)
        return dateStr;
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day)
        return dateStr;
    return `${day}.${month}.${year}`;
}
const email_service_1 = require("../services/email.service");
const config_1 = require("../config");
const JOBS_FILE = path_1.default.join(process.cwd(), 'jobs.json');
const MAX_ATTEMPTS = 3;
const timers = new Map();
let _bot;
// ── Persistence ──────────────────────────────────────────────
function readJobs() {
    try {
        if (fs_1.default.existsSync(JOBS_FILE)) {
            return JSON.parse(fs_1.default.readFileSync(JOBS_FILE, 'utf-8'));
        }
    }
    catch { /* ignore corrupt file */ }
    return [];
}
function writeJobs(jobs) {
    fs_1.default.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}
function persistAdd(job) {
    const jobs = readJobs();
    jobs.push(job);
    writeJobs(jobs);
}
function persistUpdate(job) {
    const jobs = readJobs();
    const idx = jobs.findIndex(j => j.id === job.id);
    if (idx >= 0) {
        jobs[idx] = job;
        writeJobs(jobs);
    }
}
function persistRemove(id) {
    writeJobs(readJobs().filter(j => j.id !== id));
}
// ── Job processor ─────────────────────────────────────────────
async function processJob(job) {
    const { type, data } = job;
    if (type === 'email1') {
        const { leadId, email, name } = data;
        if (!email) {
            logger_1.logger.info({ leadId }, 'email1 skipped: no email');
            return;
        }
        const lead = await db_service_1.dbService.findById(leadId);
        if (lead?.bot_activated) {
            logger_1.logger.info({ leadId }, 'email1 skipped: bot activated');
            return;
        }
        await email_service_1.emailService.sendEmail1(email, name);
        await db_service_1.dbService.updateField(leadId, 'email_1_sent', true);
        await db_service_1.dbService.updateField(leadId, 'email_1_sent_at', nowTs());
        await db_service_1.dbService.appendLog(leadId, 'EMAIL_1_SENT', {});
        addJob('email2', data, 24 * 60 * 60 * 1000);
        return;
    }
    if (type === 'email2') {
        const { leadId, email, name } = data;
        if (!email) {
            logger_1.logger.info({ leadId }, 'email2 skipped: no email');
            return;
        }
        const lead = await db_service_1.dbService.findById(leadId);
        if (lead?.bot_activated) {
            logger_1.logger.info({ leadId }, 'email2 skipped: bot activated');
            return;
        }
        await email_service_1.emailService.sendEmail2(email, name);
        await db_service_1.dbService.updateField(leadId, 'email_2_sent', true);
        await db_service_1.dbService.updateField(leadId, 'email_2_sent_at', nowTs());
        await db_service_1.dbService.appendLog(leadId, 'EMAIL_2_SENT', {});
        addJob('callAlert', data, 24 * 60 * 60 * 1000);
        return;
    }
    if (type === 'callAlert') {
        const { leadId, email, name, phone } = data;
        const lead = await db_service_1.dbService.findById(leadId);
        if (lead?.bot_activated)
            return;
        await db_service_1.dbService.updateField(leadId, 'status', 'CALL_NEEDED');
        await db_service_1.dbService.appendLog(leadId, 'CALL_NEEDED', {});
        if (_bot) {
            const fresh = await db_service_1.dbService.findById(leadId);
            const tgUsername = fresh?.tg_username ? `@${fresh.tg_username}` : '—';
            await _bot.telegram.sendMessage(config_1.config.ADMIN_GROUP_ID, `🔴 ТРЕБУЕТСЯ ЗВОНОК\n\n👤 ${name}\n📱 ${phone || '—'}\n📧 ${email || '—'}\n💬 Telegram: ${tgUsername}\n\nДействие: позвоните клиенту`);
        }
        return;
    }
    if (type === 'remind24h') {
        const { leadId, tgId, lessonDate, lessonTime, lessonDatetime } = data;
        const lead = await db_service_1.dbService.findById(leadId);
        if (!lead || lead.confirmed)
            return;
        if (!lead.lesson_datetime || lead.lesson_datetime !== lessonDatetime) {
            logger_1.logger.info({ leadId }, 'remind24h skipped: lesson was rescheduled');
            return;
        }
        // Берём свежую zoom-ссылку из GSheets (могла измениться после планирования job)
        const freshZoom = lead.zoom_link || 'Ссылка будет отправлена позже';
        if (_bot) {
            await _bot.telegram.sendMessage(tgId, `🔔 Напоминание!\n\nЗавтра пробный урок в All In Academy.\n\n📅 ${fmtDate(lessonDate)}\n🕐 ${lessonTime} (по Таллину)\n📹 ${freshZoom}\n\nПодтвердите, что придёте:`, {
                reply_markup: {
                    inline_keyboard: [[
                            { text: '✅ Да, буду!', callback_data: `confirm:${leadId}` },
                            { text: '📅 Перенести', callback_data: `reschedule:${leadId}` }
                        ]]
                }
            });
        }
        await db_service_1.dbService.appendLog(leadId, 'REMINDER_24H_SENT', {});
        await db_service_1.dbService.incrementPushCount(leadId);
        const delay5h = new Date(lessonDatetime).getTime() - Date.now() - 5 * 60 * 60 * 1000;
        if (delay5h > 60000)
            addJob('remind5h', data, delay5h);
        return;
    }
    if (type === 'remind5h') {
        const { leadId, tgId, lessonTime, lessonDatetime } = data;
        const lead = await db_service_1.dbService.findById(leadId);
        if (!lead)
            return;
        if (!lead.lesson_datetime || lead.lesson_datetime !== lessonDatetime) {
            logger_1.logger.info({ leadId }, 'remind5h skipped: lesson was rescheduled');
            return;
        }
        // Свежая zoom-ссылка из GSheets
        const freshZoom = lead.zoom_link || 'Ссылка будет отправлена позже';
        if (_bot) {
            // Если уже подтвердил — короткое напоминание, если нет — с кнопками подтверждения
            if (lead.confirmed) {
                await _bot.telegram.sendMessage(tgId, `⏰ Напоминаем: урок через 5 часов!\n\nСегодня в ${lessonTime} (по Таллину).\n📹 Zoom: ${freshZoom}\n\nДо встречи! 🎓`);
            }
            else {
                await _bot.telegram.sendMessage(tgId, `⏰ Урок через 5 часов!\n\nСегодня в ${lessonTime} (по Таллину) пробный урок в All In Academy.\n\n📹 Zoom: ${freshZoom}\n\nВы придёте?`, {
                    reply_markup: {
                        inline_keyboard: [[
                                { text: '✅ Да, буду!', callback_data: `confirm:${leadId}` },
                                { text: '📅 Перенести', callback_data: `reschedule:${leadId}` }
                            ]]
                    }
                });
            }
        }
        await db_service_1.dbService.appendLog(leadId, 'REMINDER_5H_SENT', {});
        await db_service_1.dbService.incrementPushCount(leadId);
        // Через 1ч проверим — подтвердил ли клиент (T-4ч уведомление для менеджера)
        addJob('checkConfirm4h', { leadId, tgId: data.tgId, lessonTime, lessonDatetime }, 60 * 60 * 1000);
        return;
    }
    if (type === 'checkConfirm4h') {
        const { leadId, lessonDatetime } = data;
        const lead = await db_service_1.dbService.findById(leadId);
        if (!lead)
            return;
        // Проверяем что это тот же урок (не перенесли)
        if (!lead.lesson_datetime || lead.lesson_datetime !== lessonDatetime)
            return;
        // Уже подтвердил — тихо пропускаем
        if (lead.confirmed)
            return;
        // Не подтвердил — уведомляем менеджера
        if (_bot) {
            const tgLine = lead.tg_username ? `@${lead.tg_username}` : '—';
            await _bot.telegram.sendMessage(config_1.config.ADMIN_GROUP_ID, `⚠️ ДО УРОКА 4 ЧАСА — НЕ ПОДТВЕРДИЛ!\n\n` +
                `👤 ${lead.name}\n📱 ${lead.phone}\n💬 Telegram: ${tgLine}\n` +
                `📅 ${fmtDate(lead.lesson_date)} в ${lead.lesson_time} (Таллин)\n` +
                `📨 Пушей отправлено: ${lead.push_count || 0}`);
        }
        return;
    }
    if (type === 'abandonedFlow') {
        const { tgId } = data;
        const lead = await db_service_1.dbService.findByTgId(tgId);
        // Уже записан или подтвердил — не беспокоим
        if (lead && ['SCHEDULED', 'CONFIRMED', 'ATTENDED'].includes(lead.status)) {
            logger_1.logger.info({ tgId }, 'abandonedFlow skipped: already scheduled/confirmed');
            return;
        }
        // Данные есть, но дата не выбрана — умный CTA с кнопкой
        if (lead?.phone && lead?.email && lead?.name && _bot) {
            await _bot.telegram.sendMessage(tgId, `👋 Привет!\n\nВы начали запись на бесплатный пробный урок, но не выбрали время.\n\n` +
                `Осталось совсем немного — просто нажмите кнопку:`, {
                reply_markup: {
                    inline_keyboard: [[{ text: '📅 Выбрать время', callback_data: 'pick_date_nudge' }]]
                }
            });
            await db_service_1.dbService.incrementPushCount(lead.id);
        }
        // Если данных нет вообще (Tilda-лид без бота) — молчим
        return;
    }
}
// ── Scheduler core ────────────────────────────────────────────
function scheduleTimer(job) {
    const delay = Math.max(0, job.runAt - Date.now());
    const timer = setTimeout(async () => {
        timers.delete(job.id);
        try {
            await processJob(job);
            persistRemove(job.id);
            logger_1.logger.debug({ jobId: job.id, type: job.type }, 'Job completed');
        }
        catch (err) {
            logger_1.logger.error({ err, jobId: job.id, type: job.type }, 'Job failed');
            if (job.attempts + 1 < MAX_ATTEMPTS) {
                const retry = {
                    ...job,
                    attempts: job.attempts + 1,
                    runAt: Date.now() + 60000 * Math.pow(2, job.attempts), // 1m → 2m → 4m
                };
                persistUpdate(retry);
                scheduleTimer(retry);
            }
            else {
                persistRemove(job.id);
                logger_1.logger.error({ jobId: job.id }, 'Job dropped after max retries');
            }
        }
    }, delay);
    timers.set(job.id, timer);
}
function addJob(type, data, delayMs = 0) {
    const job = {
        id: crypto_1.default.randomUUID(),
        type,
        data,
        runAt: Date.now() + delayMs,
        attempts: 0,
    };
    persistAdd(job);
    scheduleTimer(job);
    logger_1.logger.debug({ jobId: job.id, type, delayMs }, 'Job queued');
}
// ── Public API (same interface as before) ─────────────────────
class SimpleQueue {
    async add(_name, data, options = {}) {
        addJob(_name, data, options.delay ?? 0);
    }
}
exports.emailChainQueue = new SimpleQueue();
exports.remindersQueue = new SimpleQueue();
exports.flowQueue = new SimpleQueue();
function injectBot(bot) {
    _bot = bot;
}
function startWorkers() {
    const jobs = readJobs();
    let restored = 0;
    for (const job of jobs) {
        if (!timers.has(job.id)) {
            scheduleTimer(job);
            restored++;
        }
    }
    logger_1.logger.info({ restored, total: jobs.length }, 'Scheduler started');
}
//# sourceMappingURL=index.js.map