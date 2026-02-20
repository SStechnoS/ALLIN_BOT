/**
 * Simple job scheduler — replaces BullMQ + Redis.
 * Uses setTimeout + JSON file persistence (jobs survive restarts).
 * Zero external dependencies required.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { logger } from '../logger'
import { sheetsService } from '../services/sheets.service'
import { emailService } from '../services/email.service'
import { config } from '../config'
import type { EmailJobData, ReminderJobData, AbandonedFlowJobData } from '../types'

type JobType = 'email1' | 'email2' | 'callAlert' | 'remind24h' | 'remind5h' | 'abandonedFlow'

interface PersistedJob {
  id: string
  type: JobType
  data: any
  runAt: number    // Unix timestamp ms
  attempts: number
}

const JOBS_FILE = path.join(process.cwd(), 'jobs.json')
const MAX_ATTEMPTS = 3
const timers = new Map<string, NodeJS.Timeout>()
let _bot: any

// ── Persistence ──────────────────────────────────────────────

function readJobs(): PersistedJob[] {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'))
    }
  } catch { /* ignore corrupt file */ }
  return []
}

function writeJobs(jobs: PersistedJob[]) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2))
}

function persistAdd(job: PersistedJob) {
  const jobs = readJobs()
  jobs.push(job)
  writeJobs(jobs)
}

function persistUpdate(job: PersistedJob) {
  const jobs = readJobs()
  const idx = jobs.findIndex(j => j.id === job.id)
  if (idx >= 0) { jobs[idx] = job; writeJobs(jobs) }
}

function persistRemove(id: string) {
  writeJobs(readJobs().filter(j => j.id !== id))
}

// ── Job processor ─────────────────────────────────────────────

async function processJob(job: PersistedJob): Promise<void> {
  const { type, data } = job

  if (type === 'email1') {
    const { leadId, email, name } = data as EmailJobData
    if (!email) { logger.info({ leadId }, 'email1 skipped: no email'); return }
    const lead = await sheetsService.findById(leadId)
    if (lead?.bot_activated) { logger.info({ leadId }, 'email1 skipped: bot activated'); return }
    await emailService.sendEmail1(email, name)
    await sheetsService.updateField(leadId, 'email_1_sent', true)
    await sheetsService.updateField(leadId, 'email_1_sent_at', new Date().toISOString())
    await sheetsService.appendLog(leadId, 'EMAIL_1_SENT', {})
    addJob('email2', data, 24 * 60 * 60 * 1000)
    return
  }

  if (type === 'email2') {
    const { leadId, email, name } = data as EmailJobData
    if (!email) { logger.info({ leadId }, 'email2 skipped: no email'); return }
    const lead = await sheetsService.findById(leadId)
    if (lead?.bot_activated) { logger.info({ leadId }, 'email2 skipped: bot activated'); return }
    await emailService.sendEmail2(email, name)
    await sheetsService.updateField(leadId, 'email_2_sent', true)
    await sheetsService.updateField(leadId, 'email_2_sent_at', new Date().toISOString())
    await sheetsService.appendLog(leadId, 'EMAIL_2_SENT', {})
    addJob('callAlert', data, 24 * 60 * 60 * 1000)
    return
  }

  if (type === 'callAlert') {
    const { leadId, email, name, phone } = data as EmailJobData
    const lead = await sheetsService.findById(leadId)
    if (lead?.bot_activated) return
    await sheetsService.updateField(leadId, 'status', 'CALL_NEEDED')
    await sheetsService.appendLog(leadId, 'CALL_NEEDED', {})
    if (_bot) {
      const fresh = await sheetsService.findById(leadId)
      const tgUsername = fresh?.tg_username ? `@${fresh.tg_username}` : '—'
      await _bot.telegram.sendMessage(
        config.ADMIN_GROUP_ID,
        `🔴 ТРЕБУЕТСЯ ЗВОНОК\n\n👤 ${name}\n📱 ${phone || '—'}\n📧 ${email || '—'}\n💬 Telegram: ${tgUsername}\n\nДействие: позвоните клиенту`
      )
    }
    return
  }

  if (type === 'remind24h') {
    const { leadId, tgId, lessonDate, lessonTime, lessonDatetime, zoomLink } = data as ReminderJobData
    const lead = await sheetsService.findById(leadId)
    if (!lead || lead.confirmed) return
    if (!lead.lesson_datetime || lead.lesson_datetime !== lessonDatetime) {
      logger.info({ leadId }, 'remind24h skipped: lesson was rescheduled')
      return
    }
    if (_bot) {
      await _bot.telegram.sendMessage(tgId,
        `🔔 Напоминание!\n\nЗавтра пробный урок в All In Academy.\n\n📅 ${lessonDate}\n🕐 ${lessonTime} (по Таллину)\n📹 ${zoomLink}\n\nПодтвердите, что придёте:`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Да, буду!', callback_data: `confirm:${leadId}` },
              { text: '📅 Перенести', callback_data: `reschedule:${leadId}` }
            ]]
          }
        }
      )
    }
    await sheetsService.appendLog(leadId, 'REMINDER_24H_SENT', {})
    const delay5h = new Date(lessonDatetime).getTime() - Date.now() - 5 * 60 * 60 * 1000
    if (delay5h > 60000) addJob('remind5h', data, delay5h)
    return
  }

  if (type === 'remind5h') {
    const { leadId, tgId, lessonTime, lessonDatetime, zoomLink } = data as ReminderJobData
    const lead = await sheetsService.findById(leadId)
    if (!lead || lead.confirmed) return
    if (!lead.lesson_datetime || lead.lesson_datetime !== lessonDatetime) {
      logger.info({ leadId }, 'remind5h skipped: lesson was rescheduled')
      return
    }
    if (_bot) {
      await _bot.telegram.sendMessage(tgId,
        `⏰ Урок через 5 часов!\n\nСегодня в ${lessonTime} (по Таллину) пробный урок в All In Academy.\n\n📹 Zoom: ${zoomLink}\n\nВы придёте?`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Да, буду!', callback_data: `confirm:${leadId}` },
              { text: '📅 Перенести', callback_data: `reschedule:${leadId}` }
            ]]
          }
        }
      )
    }
    await sheetsService.appendLog(leadId, 'REMINDER_5H_SENT', {})
    return
  }

  if (type === 'abandonedFlow') {
    const { tgId } = data as AbandonedFlowJobData
    const lead = await sheetsService.findByTgId(tgId)
    if (lead?.lesson_datetime) { logger.info({ tgId }, 'abandonedFlow skipped: already booked'); return }
    if (_bot) {
      await _bot.telegram.sendMessage(tgId,
        `👋 Привет!\n\nВы начали запись на бесплатный пробный урок в All In Academy, но не завершили её.\n\n` +
        `Осталось совсем немного — просто выберите удобное время.\n\n` +
        `Нажмите /start чтобы продолжить 👇`
      )
    }
    return
  }
}

// ── Scheduler core ────────────────────────────────────────────

function scheduleTimer(job: PersistedJob) {
  const delay = Math.max(0, job.runAt - Date.now())
  const timer = setTimeout(async () => {
    timers.delete(job.id)
    try {
      await processJob(job)
      persistRemove(job.id)
      logger.debug({ jobId: job.id, type: job.type }, 'Job completed')
    } catch (err) {
      logger.error({ err, jobId: job.id, type: job.type }, 'Job failed')
      if (job.attempts + 1 < MAX_ATTEMPTS) {
        const retry: PersistedJob = {
          ...job,
          attempts: job.attempts + 1,
          runAt: Date.now() + 60000 * Math.pow(2, job.attempts), // 1m → 2m → 4m
        }
        persistUpdate(retry)
        scheduleTimer(retry)
      } else {
        persistRemove(job.id)
        logger.error({ jobId: job.id }, 'Job dropped after max retries')
      }
    }
  }, delay)
  timers.set(job.id, timer)
}

function addJob(type: JobType, data: any, delayMs = 0) {
  const job: PersistedJob = {
    id: crypto.randomUUID(),
    type,
    data,
    runAt: Date.now() + delayMs,
    attempts: 0,
  }
  persistAdd(job)
  scheduleTimer(job)
  logger.debug({ jobId: job.id, type, delayMs }, 'Job queued')
}

// ── Public API (same interface as before) ─────────────────────

class SimpleQueue {
  async add(_name: JobType, data: any, options: { delay?: number; [key: string]: any } = {}) {
    addJob(_name, data, options.delay ?? 0)
  }
}

export const emailChainQueue = new SimpleQueue()
export const remindersQueue = new SimpleQueue()
export const flowQueue = new SimpleQueue()

export function injectBot(bot: any) {
  _bot = bot
}

export function startWorkers() {
  const jobs = readJobs()
  let restored = 0
  for (const job of jobs) {
    if (!timers.has(job.id)) {
      scheduleTimer(job)
      restored++
    }
  }
  logger.info({ restored, total: jobs.length }, 'Scheduler started')
}
