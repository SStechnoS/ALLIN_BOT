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
const sheets_service_1 = require("../services/sheets.service");
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
        const lead = await sheets_service_1.sheetsService.findById(leadId);
        if (lead?.bot_activated) {
            logger_1.logger.info({ leadId }, 'email1 skipped: bot activated');
            return;
        }
        await email_service_1.emailService.sendEmail1(email, name);
        await sheets_service_1.sheetsService.updateField(leadId, 'email_1_sent', true);
        await sheets_service_1.sheetsService.updateField(leadId, 'email_1_sent_at', new Date().toISOString());
        await sheets_service_1.sheetsService.appendLog(leadId, 'EMAIL_1_SENT', {});
        addJob('email2', data, 24 * 60 * 60 * 1000);
        return;
    }
    if (type === 'email2') {
        const { leadId, email, name } = data;
        if (!email) {
            logger_1.logger.info({ leadId }, 'email2 skipped: no email');
            return;
        }
        const lead = await sheets_service_1.sheetsService.findById(leadId);
        if (lead?.bot_activated) {
            logger_1.logger.info({ leadId }, 'email2 skipped: bot activated');
            return;
        }
        await email_service_1.emailService.sendEmail2(email, name);
        await sheets_service_1.sheetsService.updateField(leadId, 'email_2_sent', true);
        await sheets_service_1.sheetsService.updateField(leadId, 'email_2_sent_at', new Date().toISOString());
        await sheets_service_1.sheetsService.appendLog(leadId, 'EMAIL_2_SENT', {});
        addJob('callAlert', data, 24 * 60 * 60 * 1000);
        return;
    }
    if (type === 'callAlert') {
        const { leadId, email, name, phone } = data;
        const lead = await sheets_service_1.sheetsService.findById(leadId);
        if (lead?.bot_activated)
            return;
        await sheets_service_1.sheetsService.updateField(leadId, 'status', 'CALL_NEEDED');
        await sheets_service_1.sheetsService.appendLog(leadId, 'CALL_NEEDED', {});
        if (_bot) {
            const fresh = await sheets_service_1.sheetsService.findById(leadId);
            const tgUsername = fresh?.tg_username ? `@${fresh.tg_username}` : '—';
            await _bot.telegram.sendMessage(config_1.config.ADMIN_GROUP_ID, `🔴 ТРЕБУЕТСЯ ЗВОНОК\n\n👤 ${name}\n📱 ${phone || '—'}\n📧 ${email || '—'}\n💬 Telegram: ${tgUsername}\n\nДействие: позвоните клиенту`);
        }
        return;
    }
    if (type === 'remind24h') {
        const { leadId, tgId, lessonDate, lessonTime, lessonDatetime, zoomLink } = data;
        const lead = await sheets_service_1.sheetsService.findById(leadId);
        if (!lead || lead.confirmed)
            return;
        if (!lead.lesson_datetime || lead.lesson_datetime !== lessonDatetime) {
            logger_1.logger.info({ leadId }, 'remind24h skipped: lesson was rescheduled');
            return;
        }
        if (_bot) {
            await _bot.telegram.sendMessage(tgId, `🔔 Напоминание!\n\nЗавтра пробный урок в All In Academy.\n\n📅 ${lessonDate}\n🕐 ${lessonTime} (по Таллину)\n📹 ${zoomLink}\n\nПодтвердите, что придёте:`, {
                reply_markup: {
                    inline_keyboard: [[
                            { text: '✅ Да, буду!', callback_data: `confirm:${leadId}` },
                            { text: '📅 Перенести', callback_data: `reschedule:${leadId}` }
                        ]]
                }
            });
        }
        await sheets_service_1.sheetsService.appendLog(leadId, 'REMINDER_24H_SENT', {});
        const delay5h = new Date(lessonDatetime).getTime() - Date.now() - 5 * 60 * 60 * 1000;
        if (delay5h > 60000)
            addJob('remind5h', data, delay5h);
        return;
    }
    if (type === 'remind5h') {
        const { leadId, tgId, lessonTime, lessonDatetime, zoomLink } = data;
        const lead = await sheets_service_1.sheetsService.findById(leadId);
        if (!lead || lead.confirmed)
            return;
        if (!lead.lesson_datetime || lead.lesson_datetime !== lessonDatetime) {
            logger_1.logger.info({ leadId }, 'remind5h skipped: lesson was rescheduled');
            return;
        }
        if (_bot) {
            await _bot.telegram.sendMessage(tgId, `⏰ Урок через 5 часов!\n\nСегодня в ${lessonTime} (по Таллину) пробный урок в All In Academy.\n\n📹 Zoom: ${zoomLink}\n\nВы придёте?`, {
                reply_markup: {
                    inline_keyboard: [[
                            { text: '✅ Да, буду!', callback_data: `confirm:${leadId}` },
                            { text: '📅 Перенести', callback_data: `reschedule:${leadId}` }
                        ]]
                }
            });
        }
        await sheets_service_1.sheetsService.appendLog(leadId, 'REMINDER_5H_SENT', {});
        return;
    }
    if (type === 'abandonedFlow') {
        const { tgId } = data;
        const lead = await sheets_service_1.sheetsService.findByTgId(tgId);
        if (lead?.lesson_datetime) {
            logger_1.logger.info({ tgId }, 'abandonedFlow skipped: already booked');
            return;
        }
        if (_bot) {
            await _bot.telegram.sendMessage(tgId, `👋 Привет!\n\nВы начали запись на бесплатный пробный урок в All In Academy, но не завершили её.\n\n` +
                `Осталось совсем немного — просто выберите удобное время.\n\n` +
                `Нажмите /start чтобы продолжить 👇`);
        }
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