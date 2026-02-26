import 'dotenv/config'
import Fastify from 'fastify'
import formbody from '@fastify/formbody'
import { Telegraf, Scenes, session } from 'telegraf'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { config } from './config'
import { logger } from './logger'
import { kvGet, kvSet, kvDel } from './db/kv'
import { emailChainQueue, remindersQueue, flowQueue, startWorkers, injectBot } from './queues'
import { dbService as sheetsService } from './services/db.service'
import { openaiService } from './services/openai.service'
import { aiGuard } from './services/ai.guard'
import { calendarService } from './services/calendar.service'
import { zoomService } from './services/zoom.service'
import { SCRIPTS } from './bot/scripts'
import { createAdminBot } from './admin/admin.bot'
import { getSetting } from './admin/settings'
import type { BotContext, SessionData, Lead, ReminderJobData } from './types'

function nowTs(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`
}

// ============================================================
// HELPERS
// ============================================================
const DAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

function formatDateRu(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  return `${dd}.${mm}.${year} (${DAYS_RU[d.getUTCDay()]})`
}

// Постоянное нижнее меню (ReplyKeyboard)
const MAIN_MENU_KEYBOARD = {
  keyboard: [
    [{ text: '📅 Моё бронирование' }, { text: '📞 Связаться с менеджером' }],
    [{ text: '🔄 Перенести урок' }, { text: '❓ Задать вопрос AI' }],
  ],
  resize_keyboard: true,
  persistent: true,
}

async function sendMainMenu(ctx: BotContext, text = 'Чем могу помочь?') {
  await ctx.reply(text, { reply_markup: MAIN_MENU_KEYBOARD })
}

// ============================================================
// BOT SETUP
// ============================================================
const bot = new Telegraf<BotContext>(config.BOT_TOKEN)

// Session middleware — backed by SQLite
bot.use(session({
  store: {
    async get(key: string) {
      try {
        const val = kvGet(`session:${key}`)
        return val ? JSON.parse(val) : undefined
      } catch {
        return undefined
      }
    },
    async set(key: string, value: SessionData) {
      kvSet(`session:${key}`, JSON.stringify(value), 86400)
    },
    async delete(key: string) {
      kvDel(`session:${key}`)
    }
  }
}))

// Safety guard: ensure ctx.session is always initialized
bot.use(async (ctx, next) => {
  if (!ctx.session) ctx.session = {} as SessionData
  return next()
})


// ============================================================
// GLOBAL HANDLERS
// ============================================================

// /start
bot.start(async (ctx) => {
  const existing = await sheetsService.findByTgId(ctx.from!.id)

  // Возвращающийся с активным бронированием
  if (existing?.lesson_date && (existing.status === 'SCHEDULED' || existing.status === 'CONFIRMED')) {
    ctx.session = { leadId: existing.id, gdprAccepted: true }
    await ctx.reply(SCRIPTS.RETURNING_WITH_BOOKING(existing), { reply_markup: MAIN_MENU_KEYBOARD })
    return
  }

  // Возвращающийся — GDPR дал, данные есть, время не выбрал
  if (existing?.gdpr_accepted && existing?.phone && existing?.email && existing?.name) {
    ctx.session = {
      leadId: existing.id,
      gdprAccepted: true,
      phone: existing.phone,
      email: existing.email,
      name: existing.name,
      registrationStep: 'date',
    }
    await ctx.reply(SCRIPTS.RETURNING_NO_DATE(existing))
    await showDatePicker(ctx)
    return
  }

  // Новый пользователь — полное приветствие
  ctx.session = {}
  await ctx.reply(getSetting('welcome_text') || SCRIPTS.WELCOME_TEXT)

  const videoFileId = getSetting('welcome_video_file_id') || config.WELCOME_VIDEO_FILE_ID
  if (videoFileId) {
    try {
      await ctx.telegram.sendVideoNote(ctx.chat.id, videoFileId)
    } catch (e) {
      logger.warn({ e }, 'sendVideoNote failed, skipping')
    }
  }

  await ctx.reply(SCRIPTS.GDPR_REQUEST, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Продолжить', callback_data: 'gdpr_accept' },
        { text: '📄 Политика', url: 'https://allinacademy.ee/privacy' }
      ]]
    }
  })
})

// GDPR accept
bot.action('gdpr_accept', async (ctx) => {
  await ctx.answerCbQuery()
  ctx.session.gdprAccepted = true

  const existing = await sheetsService.findByTgId(ctx.from!.id)

  // Уже есть активная запись
  if (existing?.status === 'SCHEDULED' || existing?.status === 'CONFIRMED') {
    ctx.session.leadId = existing.id
    await ctx.reply(SCRIPTS.ALREADY_SCHEDULED(existing), { reply_markup: MAIN_MENU_KEYBOARD })
    return
  }

  // Данные уже есть — пропустить анкету, сразу к дате
  if (existing?.phone && existing?.email && existing?.name) {
    ctx.session.leadId = existing.id
    ctx.session.phone = existing.phone
    ctx.session.email = existing.email
    ctx.session.name = existing.name
    ctx.session.registrationStep = 'date'
    await ctx.reply(`С возвращением, ${existing.name}! 👋\n\nВыберите удобное время для урока:`)
    await showDatePicker(ctx)
    return
  }

  // Новый пользователь — стандартная регистрация
  ctx.session.registrationStep = 'phone'
  // Nudge через 2ч если регистрация не завершена.
  // SQLite-флаг чтобы не дублировать job при повторных нажатиях GDPR.
  const abandonedKey = `abandoned:scheduled:${ctx.from!.id}`
  if (!kvGet(abandonedKey)) {
    await flowQueue.add('abandonedFlow', { tgId: ctx.from!.id }, { delay: 2 * 60 * 60 * 1000 })
    kvSet(abandonedKey, '1', 3 * 60 * 60) // TTL 3ч
  }
  await ctx.reply(SCRIPTS.PHONE_REQUEST, {
    reply_markup: {
      keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
      one_time_keyboard: true,
      resize_keyboard: true
    }
  })
})

// /help
bot.command('help', async (ctx) => {
  await ctx.reply(SCRIPTS.HELP)
})

// /status
bot.command('status', async (ctx) => {
  const lead = ctx.session.leadId
    ? await sheetsService.findById(ctx.session.leadId)
    : await sheetsService.findByTgId(ctx.from!.id)

  if (!lead || !lead.lesson_date) {
    await ctx.reply(SCRIPTS.STATUS_NO_BOOKING)
    return
  }

  const text = lead.confirmed ? SCRIPTS.STATUS_CONFIRMED(lead) : SCRIPTS.STATUS_SCHEDULED(lead)
  await ctx.reply(text)
})

// /ai command
bot.command('ai', async (ctx) => {
  ctx.session.prevScene = 'main'
  await ctx.reply(SCRIPTS.AI_ACTIVATED)
})

// /menu
bot.command('menu', async (ctx) => {
  await sendMainMenu(ctx, 'Главное меню 👇')
})

// ============================================================
// REGISTRATION FLOW
// ============================================================

// Телефон через кнопку
bot.on('contact', async (ctx) => {
  if (ctx.session.registrationStep !== 'phone') return
  const phone = ctx.message.contact.phone_number
  await handlePhone(ctx, phone)
})

// Текстовые сообщения
bot.on('text', async (ctx) => {
  const text = ctx.message.text
  const step = ctx.session.registrationStep

  // Регистрационные шаги
  if (step === 'phone') { await handlePhone(ctx, text); return }
  if (step === 'email') { await handleEmail(ctx, text); return }
  if (step === 'name') { await handleName(ctx, text); return }
  if (step === 'date') { return } // InlineKeyboard, текст игнорируем

  // Кнопки главного меню
  if (text === '📅 Моё бронирование') { await handleMyBooking(ctx); return }
  if (text === '📞 Связаться с менеджером') { await handleContactManager(ctx); return }
  if (text === '🔄 Перенести урок') { await handleRescheduleRequest(ctx); return }
  if (text === '❓ Задать вопрос AI') { await ctx.reply(SCRIPTS.AI_ACTIVATED); return }

  // Всё остальное → AI (любой вопрос или фраза)
  await handleAI(ctx, text)
})

// Видео-кружок (video_note) — логируем file_id для WELCOME_VIDEO_FILE_ID
bot.on('video_note', async (ctx) => {
  const fileId = ctx.message.video_note.file_id
  logger.info({ fileId }, 'video_note received')
  await ctx.reply(`✅ file_id видео-кружка:\n\n<code>${fileId}</code>`, { parse_mode: 'HTML' })
})

// Голосовые сообщения
bot.on('voice', async (ctx) => {
  await ctx.sendChatAction('typing')
  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id)
    const res = await fetch(fileLink.href)
    const buffer = Buffer.from(await res.arrayBuffer())
    const text = await openaiService.transcribeVoice(buffer)

    if (!text?.trim()) {
      await ctx.reply('Не смог распознать голосовое. Попробуйте написать текстом.')
      return
    }

    const step = ctx.session.registrationStep
    if (step === 'phone') { await handlePhone(ctx, text); return }
    if (step === 'email') { await handleEmail(ctx, text); return }
    if (step === 'name') { await handleName(ctx, text); return }

    await handleAI(ctx, text)
  } catch (err) {
    logger.error({ err }, 'Voice handler error')
    await ctx.reply('Не смог обработать голосовое. Попробуйте написать текстом.')
  }
})

// ============================================================
// REGISTRATION HANDLERS
// ============================================================
async function handlePhone(ctx: BotContext, phone: string) {
  const parsed = parsePhoneNumberFromString(phone, 'EE')
  if (!parsed?.isValid()) {
    await ctx.reply(SCRIPTS.PHONE_INVALID)
    return
  }
  ctx.session.phone = parsed.format('E.164')
  ctx.session.registrationStep = 'email'
  await ctx.reply(SCRIPTS.PHONE_OK, { reply_markup: { remove_keyboard: true } })
  await ctx.reply(SCRIPTS.EMAIL_REQUEST)
}

async function handleEmail(ctx: BotContext, email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    await ctx.reply(SCRIPTS.EMAIL_INVALID)
    return
  }
  ctx.session.email = email.toLowerCase()
  ctx.session.registrationStep = 'name'
  await ctx.reply(SCRIPTS.EMAIL_OK)
  await ctx.reply(SCRIPTS.NAME_REQUEST)
}

async function handleName(ctx: BotContext, name: string) {
  if (name.length < 2 || name.length > 60) {
    await ctx.reply('Введите корректное имя (2–60 символов)')
    return
  }
  ctx.session.name = name
  ctx.session.registrationStep = 'date'

  // Сохранить в GSheets
  const leadId = await sheetsService.upsertLead({
    name, phone: ctx.session.phone, email: ctx.session.email,
    tg_id: ctx.from!.id, tg_username: ctx.from!.username,
    source: 'direct_bot', gdprAccepted: ctx.session.gdprAccepted
  })
  ctx.session.leadId = leadId
  await sheetsService.updateField(leadId, 'bot_activated', true)
  await sheetsService.updateField(leadId, 'bot_activated_at', nowTs())
  await sheetsService.updateField(leadId, 'status', 'BOT_ACTIVE')

  await ctx.reply(SCRIPTS.NAME_OK(name))
  await showDatePicker(ctx)
}

// ============================================================
// MAIN MENU HANDLERS
// ============================================================
async function handleMyBooking(ctx: BotContext) {
  const lead = ctx.session.leadId
    ? await sheetsService.findById(ctx.session.leadId)
    : await sheetsService.findByTgId(ctx.from!.id)

  if (!lead || !lead.lesson_date) {
    await ctx.reply('У вас нет активной записи.\n\nНажмите /start чтобы записаться на бесплатный пробный урок.')
    return
  }

  const zoomLine = lead.zoom_link
    ? `\n📹 Zoom: ${lead.zoom_link}`
    : '\n📹 Ссылка на Zoom будет отправлена за 24 ч до урока'
  const statusLine = lead.confirmed ? '✅ Подтверждено' : '⏳ Ожидает подтверждения'

  await ctx.reply(
    `📋 Ваше бронирование:\n\n` +
    `📅 ${formatDateRu(lead.lesson_date)}\n` +
    `🕐 ${lead.lesson_time} (по Таллину)` +
    zoomLine +
    `\n\n🔖 Статус: ${statusLine}`
  )
}

async function handleContactManager(ctx: BotContext) {
  await ctx.reply('Напишите нашему менеджеру напрямую:', {
    reply_markup: {
      inline_keyboard: [[{ text: '💬 Написать менеджеру', url: config.MANAGER_LINK }]]
    }
  })
}

const RESCHEDULE_CUTOFF_MS = 3 * 60 * 60 * 1000 // 3 часа

async function performReschedule(lead: Lead, tgId: number): Promise<void> {
  // Освободить слот в Google Calendar
  if (lead.calendar_event_id) {
    try { await calendarService.freeSlot(lead.calendar_event_id) }
    catch (err) { logger.warn({ err, eventId: lead.calendar_event_id }, 'Failed to free calendar slot') }
  }

  // Удалить Zoom-встречу
  if (lead.zoom_meeting_id && config.ZOOM_ACCOUNT_ID) {
    try { await zoomService.deleteMeeting(lead.zoom_meeting_id) }
    catch (err) { logger.warn({ err, meetingId: lead.zoom_meeting_id }, 'Failed to delete zoom meeting') }
  }

  // Очистить данные урока в GSheets
  await sheetsService.updateLead(lead.id, {
    lesson_date: '', lesson_time: '', lesson_datetime: '',
    zoom_link: '', zoom_meeting_id: '', calendar_event_id: '',
    confirmed: false, confirmed_at: '', status: 'BOT_ACTIVE',
  })
  await sheetsService.appendLog(lead.id, 'RESCHEDULED', { via: 'self_service' })

  // Уведомить менеджера
  const tgUsernameR = lead.tg_username ? `@${lead.tg_username}` : '—'
  await bot.telegram.sendMessage(config.ADMIN_GROUP_ID,
    `🔄 САМОПЕРЕНОС\n\n👤 ${lead.name}\n📱 ${lead.phone}\n💬 Telegram: ${tgUsernameR}\n📅 Был: ${formatDateRu(lead.lesson_date)} в ${lead.lesson_time}`)
}

async function handleRescheduleRequest(ctx: BotContext) {
  const lead = ctx.session.leadId
    ? await sheetsService.findById(ctx.session.leadId)
    : await sheetsService.findByTgId(ctx.from!.id)

  if (!lead || !lead.lesson_date) {
    await ctx.reply('У вас нет активной записи для переноса.')
    return
  }

  // Проверка: перенос только за 3+ часа до урока
  const lessonMs = lead.lesson_datetime ? new Date(lead.lesson_datetime).getTime() : 0
  if (lessonMs > 0 && lessonMs - Date.now() < RESCHEDULE_CUTOFF_MS) {
    await ctx.reply(
      `Перенос возможен не позднее чем за 3 часа до урока.\n\n` +
      `До вашего урока осталось менее 3 часов.\n\nНапишите менеджеру — он постарается помочь:`,
      { reply_markup: { inline_keyboard: [[{ text: '💬 Написать менеджеру', url: config.MANAGER_LINK }]] } }
    )
    return
  }

  try {
    await performReschedule(lead, ctx.from!.id)
    ctx.session.leadId = lead.id
    ctx.session.name = lead.name
    ctx.session.phone = lead.phone
    ctx.session.email = lead.email
    ctx.session.registrationStep = 'date'
    await ctx.reply('Запись отменена ✅\n\nВыберите новое удобное время:')
    await showDatePicker(ctx)
  } catch (err) {
    logger.error({ err }, 'handleRescheduleRequest error')
    await ctx.reply(SCRIPTS.ERROR_GENERIC)
  }
}

// ============================================================
// DATE PICKER
// ============================================================
async function showDatePicker(ctx: BotContext) {
  await ctx.sendChatAction('typing')
  try {
    const slots = await calendarService.getAvailableSlots()

    if (!slots.length) {
      await ctx.reply(SCRIPTS.NO_SLOTS, {
        reply_markup: {
          inline_keyboard: [[{ text: '📞 Написать менеджеру', url: config.MANAGER_LINK }]]
        }
      })
      return
    }

    const dates = [...new Set(slots.map(s => s.date))]
    const keyboard = dates.map(date => [{ text: `📅 ${formatDateRu(date)}`, callback_data: `date:${date}` }])
    await ctx.reply(SCRIPTS.PICK_DATE, { reply_markup: { inline_keyboard: keyboard } })
  } catch (err) {
    logger.error({ err }, 'showDatePicker error')
    await ctx.reply(SCRIPTS.ERROR_GENERIC)
  }
}

// Выбрана дата → показать доступное время
bot.action(/^date:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const date = ctx.match[1]
  try {
    const slots = await calendarService.getAvailableSlots()
    const timesForDate = slots.filter(s => s.date === date)

    if (!timesForDate.length) {
      const remaining = [...new Set(slots.map(s => s.date))]
      const keyboard = remaining.length
        ? remaining.map(d => [{ text: `📅 ${formatDateRu(d)}`, callback_data: `date:${d}` }])
        : [[{ text: '📞 Менеджеру', url: config.MANAGER_LINK }]]
      await ctx.editMessageText('К сожалению, этот день уже занят 😔\n\nВыберите другой:', { reply_markup: { inline_keyboard: keyboard } })
      return
    }

    const keyboard = [
      ...timesForDate.map(slot => [{ text: `🕐 ${slot.time}`, callback_data: `slot:${slot.eventId}` }]),
      [{ text: '← Другой день', callback_data: 'back_to_dates' }]
    ]
    await ctx.editMessageText(SCRIPTS.PICK_TIME(formatDateRu(date)), { reply_markup: { inline_keyboard: keyboard } })
  } catch (err) {
    logger.error({ err }, 'date selection error')
    await ctx.reply(SCRIPTS.ERROR_GENERIC)
  }
})

// Выбрано время → подтверждение
bot.action(/^slot:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const eventId = ctx.match[1]
  try {
    const slots = await calendarService.getAvailableSlots()
    const slot = slots.find(s => s.eventId === eventId)

    if (!slot) {
      await ctx.editMessageText('Этот слот уже занят 😔')
      await showDatePicker(ctx)
      return
    }

    ctx.session.selectedCalEventId = slot.eventId
    ctx.session.selectedDate = slot.date
    ctx.session.selectedTime = slot.time
    ctx.session.lessonDatetime = slot.startDatetime

    await ctx.editMessageText(SCRIPTS.CONFIRM_BOOKING(formatDateRu(slot.date), slot.time), {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Подтвердить запись', callback_data: 'confirm_booking' }],
          [{ text: '← Другое время', callback_data: `date:${slot.date}` }],
          [{ text: '← Другой день', callback_data: 'back_to_dates' }],
        ]
      }
    })
  } catch (err) {
    logger.error({ err }, 'slot selection error')
    await ctx.reply(SCRIPTS.ERROR_GENERIC)
  }
})

// Назад к выбору дат
bot.action('back_to_dates', async (ctx) => {
  await ctx.answerCbQuery()
  try {
    const slots = await calendarService.getAvailableSlots()
    if (!slots.length) {
      await ctx.editMessageText(SCRIPTS.NO_SLOTS, {
        reply_markup: { inline_keyboard: [[{ text: '📞 Менеджеру', url: config.MANAGER_LINK }]] }
      })
      return
    }
    const dates = [...new Set(slots.map(s => s.date))]
    const keyboard = dates.map(date => [{ text: `📅 ${formatDateRu(date)}`, callback_data: `date:${date}` }])
    await ctx.editMessageText(SCRIPTS.PICK_DATE, { reply_markup: { inline_keyboard: keyboard } })
  } catch (err) {
    logger.error({ err }, 'back_to_dates error')
    await ctx.reply(SCRIPTS.ERROR_GENERIC)
  }
})

// Подтверждение бронирования
bot.action('confirm_booking', async (ctx) => {
  await ctx.answerCbQuery()
  await ctx.sendChatAction('typing')

  const { selectedCalEventId, selectedDate, selectedTime, lessonDatetime, leadId, name, phone, email } = ctx.session
  if (!selectedCalEventId || !selectedDate || !selectedTime || !leadId) {
    await ctx.reply('Что-то пошло не так. Попробуйте /start')
    return
  }

  try {
    // Пометить слот как занятый в Google Calendar
    await calendarService.markSlotBusy(selectedCalEventId, name || 'Клиент')

    // Создать Zoom-встречу
    const lessonDatetime_ = lessonDatetime || new Date().toISOString()
    let zoomLink = ''
    let zoomMeetingId = ''
    if (config.ZOOM_ACCOUNT_ID && config.ZOOM_CLIENT_ID && config.ZOOM_CLIENT_SECRET) {
      const meeting = await zoomService.createMeeting(
        `All In Academy — Пробный урок (${name || 'Клиент'})`,
        lessonDatetime_
      )
      zoomLink = meeting.join_url
      zoomMeetingId = String(meeting.id)
    }

    // Сохранить в GSheets
    await sheetsService.updateLead(leadId, {
      lesson_date: selectedDate,
      lesson_time: selectedTime,
      lesson_datetime: lessonDatetime_,
      zoom_link: zoomLink,
      zoom_meeting_id: zoomMeetingId,
      calendar_event_id: selectedCalEventId,
      status: 'SCHEDULED',
    })
    await sheetsService.appendLog(leadId, 'SCHEDULED', { date: selectedDate, time: selectedTime, zoom: zoomLink })

    // Запланировать напоминание T-24h
    const lessonMs = new Date(lessonDatetime_).getTime()
    const delay24h = lessonMs - Date.now() - 24 * 60 * 60 * 1000
    if (delay24h > 60000) {
      await remindersQueue.add('remind24h', {
        leadId, tgId: ctx.from!.id,
        lessonDate: selectedDate, lessonTime: selectedTime,
        lessonDatetime: lessonDatetime_,
        zoomLink: zoomLink || 'Ссылка будет отправлена позже',
        name: name || '',
      }, { delay: delay24h, attempts: 3, backoff: { type: 'exponential', delay: 60000 } })
    }

    // Уведомить менеджера
    const tgUsername = ctx.from!.username ? `@${ctx.from!.username}` : '—'
    await bot.telegram.sendMessage(config.ADMIN_GROUP_ID,
      `🟢 НОВАЯ ЗАПИСЬ\n\n` +
      `👤 ${name}\n📱 ${phone || '—'}\n📧 ${email || '—'}\n` +
      `💬 Telegram: ${tgUsername}\n` +
      `📅 ${formatDateRu(selectedDate)} в ${selectedTime} (Таллин)\n📹 ${zoomLink || '—'}`)

    // Очистить данные выбора из сессии
    ctx.session.selectedCalEventId = undefined
    ctx.session.selectedDate = undefined
    ctx.session.selectedTime = undefined
    ctx.session.lessonDatetime = undefined
    ctx.session.registrationStep = undefined

    // Убрать inline-кнопки с сообщения выбора
    const zoomText = zoomLink
      ? `\n\n📹 Zoom-ссылка для входа:\n${zoomLink}`
      : `\n\n📹 Ссылка на Zoom будет отправлена за 24 часа до урока.`
    await ctx.editMessageText(
      `🎉 Вы записаны на пробный урок!\n\n` +
      `📅 ${formatDateRu(selectedDate)}\n🕐 ${selectedTime} (по Таллину)` +
      zoomText
    )
    // Показать главное меню
    await sendMainMenu(ctx, 'Используйте меню для управления записью 👇')
  } catch (err) {
    logger.error({ err }, 'confirm_booking error')
    await ctx.reply(SCRIPTS.ERROR_GENERIC)
  }
})

// Кнопка из nudge-сообщения — сразу к выбору даты
bot.action('pick_date_nudge', async (ctx) => {
  await ctx.answerCbQuery()
  const existing = await sheetsService.findByTgId(ctx.from!.id)
  if (existing) {
    ctx.session.leadId = existing.id
    ctx.session.name = existing.name
    ctx.session.phone = existing.phone
    ctx.session.email = existing.email
    ctx.session.registrationStep = 'date'
  }
  await showDatePicker(ctx)
})

// ============================================================
// AI HANDLER
// ============================================================
async function handleAI(ctx: BotContext, text: string) {
  try {
    await ctx.sendChatAction('typing')
    const response = await openaiService.chat(ctx.from!.id, text)
    await ctx.reply(response)
  } catch (err) {
    logger.error({ err }, 'AI handler error')
    await ctx.reply(`Сейчас AI-ассистент недоступен. Напишите менеджеру: ${config.MANAGER_LINK}`)
  }
}

bot.action('activate_ai', async (ctx) => {
  await ctx.answerCbQuery()
  await ctx.reply(SCRIPTS.AI_ACTIVATED)
})

// ============================================================
// CONFIRMATION CALLBACKS (от напоминаний BullMQ)
// ============================================================
bot.action(/^confirm:(.+)$/, async (ctx) => {
  const leadId = ctx.match[1]
  await ctx.answerCbQuery('✅ Подтверждено!')

  await sheetsService.updateLead(leadId, {
    confirmed: true,
    confirmed_at: nowTs(),
    status: 'CONFIRMED'
  })
  await sheetsService.appendLog(leadId, 'CONFIRMED', {})

  const lead = await sheetsService.findById(leadId)
  if (lead) {
    const tgUsername = lead.tg_username ? `@${lead.tg_username}` : '—'
    const adminMsg =
      `🟢 ПОДТВЕРДИЛ УЧАСТИЕ\n\n` +
      `👤 ${lead.name}\n📱 ${lead.phone}\n📧 ${lead.email}\n` +
      `💬 Telegram: ${tgUsername}\n` +
      `📅 ${formatDateRu(lead.lesson_date)} в ${lead.lesson_time}\n📹 ${lead.zoom_link}`
    await bot.telegram.sendMessage(config.ADMIN_GROUP_ID, adminMsg)
    await ctx.editMessageText(SCRIPTS.CONFIRMATION_SUCCESS(lead))
  }
})

bot.action(/^reschedule:(.+)$/, async (ctx) => {
  const leadId = ctx.match[1]
  await ctx.answerCbQuery()

  const lead = await sheetsService.findById(leadId)
  if (!lead || !lead.lesson_date) {
    await ctx.editMessageText('Запись не найдена.')
    return
  }

  // Проверка 3ч
  const lessonMs = lead.lesson_datetime ? new Date(lead.lesson_datetime).getTime() : 0
  if (lessonMs > 0 && lessonMs - Date.now() < RESCHEDULE_CUTOFF_MS) {
    await ctx.editMessageText(
      `Перенос возможен не позднее чем за 3 часа до урока.\n\n` +
      `Напишите менеджеру:`,
      { reply_markup: { inline_keyboard: [[{ text: '💬 Написать менеджеру', url: config.MANAGER_LINK }]] } }
    )
    return
  }

  try {
    await performReschedule(lead, ctx.from!.id)
    ctx.session.leadId = lead.id
    ctx.session.registrationStep = 'date'
    await ctx.editMessageText('Запись отменена ✅')
    await ctx.reply('Выберите новое удобное время:')
    await showDatePicker(ctx)
  } catch (err) {
    logger.error({ err }, 'reschedule action error')
    await ctx.reply(SCRIPTS.ERROR_GENERIC)
  }
})

bot.action('show_status', async (ctx) => {
  await ctx.answerCbQuery()
  const lead = ctx.session.leadId ? await sheetsService.findById(ctx.session.leadId) : null
  if (lead?.lesson_date) {
    await ctx.reply(lead.confirmed ? SCRIPTS.STATUS_CONFIRMED(lead) : SCRIPTS.STATUS_SCHEDULED(lead))
  }
})

// Глобальный error handler
bot.catch((err, ctx) => {
  logger.error({ err, userId: ctx.from?.id }, 'Bot error')
  ctx.reply(SCRIPTS.ERROR_GENERIC).catch(() => {})
})

// ============================================================
// TILDA WEBHOOK
// ============================================================
async function handleTildaWebhook(body: any) {
  // Нормализация: Tilda может слать поля с заглавной буквы (Name, Phone, Email)
  logger.debug({ body }, 'Tilda webhook raw body')

  const normalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(body)) {
    normalized[k.toLowerCase()] = String(v || '')
  }

  const name = normalized['name'] || ''
  const phone = normalized['phone'] || ''
  const email = normalized['email'] || ''
  const child_age = normalized['child_age'] || normalized['age'] || '0'

  logger.info({ name, phone, email, child_age }, 'Tilda lead fields parsed')

  if (!name && !phone && !email) {
    logger.warn({ body }, 'Tilda webhook: empty lead, skipping')
    return
  }

  const leadId = await sheetsService.upsertLead({
    name, phone, email,
    child_age: parseInt(child_age || '0'),
    source: 'tilda'
  })

  // Запустить email-цепочку (только если есть email)
  if (email) {
    await emailChainQueue.add('email1',
      { leadId, email, name, phone },
      { delay: 30 * 60 * 1000, attempts: 3, backoff: { type: 'exponential', delay: 60000 } }
    )
  } else {
    logger.info({ leadId }, 'Tilda lead: no email, skipping email chain')
  }

  logger.info({ leadId, name, email }, 'Tilda lead processed')
}

// ============================================================
// FASTIFY SERVER
// ============================================================
const app = Fastify({ logger: false })
app.register(formbody) // поддержка application/x-www-form-urlencoded (Tilda)

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

// Tilda webhook
app.post('/webhook/tilda', {
  schema: { headers: { type: 'object' } }
}, async (req, reply) => {
  const body = req.body as Record<string, string>

  // Tilda тест-пинг: тело = "test=test" или "test=true" — пропускаем без проверки секрета
  if (body?.test === 'test' || body?.test === 'true') {
    logger.info('Tilda webhook: test ping OK')
    return reply.send({ ok: true })
  }

  // Tilda может слать секрет в разных местах (зависит от версии/настроек)
  const q = req.query as any
  const secret = body?.secret || body?.key || body?.formkey || body?.api_key ||
    q?.secret || q?.key || q?.api_key ||
    (req.headers['x-tilda-secret'] as string) ||
    (req.headers['x-secret'] as string)

  logger.info({ body, query: q, secret: secret?.slice(0, 8) + '...' }, 'Tilda webhook incoming')

  if (config.TILDA_WEBHOOK_SECRET && secret !== config.TILDA_WEBHOOK_SECRET) {
    logger.warn({ receivedSecret: secret, body }, 'Tilda webhook: invalid secret')
    return reply.code(403).send({ error: 'Forbidden' })
  }

  try {
    await handleTildaWebhook(body)
    return reply.send({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Tilda webhook error')
    return reply.code(500).send({ error: 'Internal error' })
  }
})

// Telegram webhook
app.post('/webhook/telegram', async (req, reply) => {
  try {
    await bot.handleUpdate(req.body as any)
    return reply.send({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Telegram webhook error')
    return reply.code(500).send({ error: 'Internal error' })
  }
})

// ============================================================
// STARTUP
// ============================================================
async function main() {
  // Inject bot into workers
  injectBot(bot)

  // Start BullMQ workers
  startWorkers()

  // Start admin bot (always polling, separate from main bot)
  const adminBot = createAdminBot(bot.telegram)
  if (adminBot) {
    adminBot.launch()
    logger.info('Admin bot started in polling mode')
  }

  // Setup Telegram webhook or polling
  if (config.IS_PRODUCTION && config.WEBHOOK_HOST) {
    const webhookUrl = `${config.WEBHOOK_HOST}/webhook/telegram`
    await bot.telegram.setWebhook(webhookUrl)
    logger.info({ webhookUrl }, 'Telegram webhook set')
  } else {
    // Development: use polling
    bot.launch()
    logger.info('Bot started in polling mode (development)')
  }

  // Start HTTP server (non-fatal in dev — webhooks not needed in polling mode)
  try {
    await app.listen({ port: config.APP_PORT, host: '0.0.0.0' })
    logger.info({ port: config.APP_PORT }, 'Server started')
  } catch (err: any) {
    if (!config.IS_PRODUCTION && err?.code === 'EADDRINUSE') {
      logger.warn({ port: config.APP_PORT }, 'HTTP server port busy — skipped in dev mode')
    } else {
      throw err
    }
  }
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error')
  process.exit(1)
})

// Graceful shutdown
process.once('SIGINT', async () => {
  bot.stop('SIGINT')
  await app.close()
})
process.once('SIGTERM', async () => {
  bot.stop('SIGTERM')
  await app.close()
})
