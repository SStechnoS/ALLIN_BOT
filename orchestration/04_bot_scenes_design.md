# Orchestration: Telegraf Scenes FSM Design

## Схема состояний (FSM)

```
                         /start
                           │
                    ┌──────▼──────┐
                    │   WELCOME   │
                    │  (Scene)    │
                    │ text+video  │
                    │ +GDPR btn   │
                    └──────┬──────┘
                           │ callback: gdpr_accept
                           │
                    ┌──────▼──────────────┐
                    │   REGISTRATION      │
                    │   (Scene - multi)   │
                    │                     │
                    │ Step 1: PHONE       │
                    │ Step 2: EMAIL       │
                    │ Step 3: NAME        │
                    └──────┬──────────────┘
                           │ name received
                           │
                    ┌──────▼──────┐
                    │  DATE_PICK  │
                    │  (Scene)    │
                    │ Calendar    │
                    │ InlineKbd   │
                    └──────┬──────┘
                           │ callback: confirm_booking
                           │
                    ┌──────▼──────┐
                    │  SCHEDULED  │
                    │  (Scene)    │
                    │ Main menu   │
                    │ after booking│
                    └─────────────┘

═══════════════════════════════════
GLOBAL HANDLERS (все состояния):
  voice → VoiceHandler → Whisper → current scene or AI
  /ai   → AIHandler (сохраняет previous scene)
  /menu → вернуться в текущую сцену (или SCHEDULED если записан)
  /start → WelcomeScene (с подтверждением если уже в процессе)
  /help → send help message (без смены сцены)
  /status → send status message (без смены сцены)
```

---

## ctx.session структура

```typescript
interface SessionData {
  // Регистрационные данные (собираются в RegistrationScene)
  phone?: string
  email?: string
  name?: string
  gdprAccepted?: boolean

  // Данные лида из GSheets
  leadId?: string
  tgId?: number

  // Выбор даты
  selectedDate?: string           // "2026-02-25"
  selectedTime?: string           // "15:00"
  selectedCalEventId?: string     // Google Calendar event ID

  // После записи
  zoomLink?: string
  lessonDatetime?: string         // ISO 8601

  // AI режим
  prevScene?: string              // имя предыдущей сцены для возврата

  // Регистрационный шаг (внутри RegistrationScene)
  registrationStep?: 'phone' | 'email' | 'name'

  // Флаги
  isExistingLead?: boolean        // нашли по email/tg_id в GSheets
}
```

---

## WelcomeScene

```typescript
// scenes/welcome.scene.ts

export const welcomeScene = new Scenes.BaseScene<BotContext>('welcome')

welcomeScene.enter(async (ctx) => {
  // Сообщение 1: текст
  await ctx.reply(SCRIPTS.WELCOME_TEXT)

  // Сообщение 2: видео-кружок (video_note)
  await ctx.telegram.sendVideoNote(ctx.chat!.id, config.WELCOME_VIDEO_FILE_ID)

  // Сообщение 3: GDPR согласие
  await ctx.reply(SCRIPTS.GDPR_REQUEST, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Продолжить', callback_data: 'gdpr_accept' },
        { text: '📄 Политика', url: 'https://allinacademy.ee/privacy' }
      ]]
    }
  })
})

welcomeScene.action('gdpr_accept', async (ctx) => {
  await ctx.answerCbQuery()
  ctx.session.gdprAccepted = true

  // Проверка: существующий пользователь?
  const existing = await sheetsService.findByTgId(ctx.from!.id)
  if (existing?.bot_activated && existing?.status === 'SCHEDULED') {
    // Уже записан — показать статус
    await ctx.reply(SCRIPTS.ALREADY_SCHEDULED(existing))
    ctx.scene.enter('scheduled')
    return
  }

  ctx.session.registrationStep = 'phone'
  ctx.scene.enter('registration')
})
```

---

## RegistrationScene

```typescript
// scenes/registration.scene.ts

export const registrationScene = new Scenes.BaseScene<BotContext>('registration')

registrationScene.enter(async (ctx) => {
  const step = ctx.session.registrationStep || 'phone'

  switch (step) {
    case 'phone':
      await ctx.reply(SCRIPTS.PHONE_REQUEST, {
        reply_markup: {
          keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
          one_time_keyboard: true,
          resize_keyboard: true
        }
      })
      break
    case 'email':
      await ctx.reply(SCRIPTS.EMAIL_REQUEST, { reply_markup: { remove_keyboard: true } })
      break
    case 'name':
      await ctx.reply(SCRIPTS.NAME_REQUEST)
      break
  }
})

// Обработчик contact (кнопка "Поделиться номером")
registrationScene.on('contact', async (ctx) => {
  const phone = ctx.message.contact.phone_number
  await handlePhoneInput(ctx, phone)
})

// Обработчик текстовых сообщений
registrationScene.on('text', async (ctx) => {
  const step = ctx.session.registrationStep

  switch (step) {
    case 'phone':
      await handlePhoneInput(ctx, ctx.message.text)
      break
    case 'email':
      await handleEmailInput(ctx, ctx.message.text)
      break
    case 'name':
      await handleNameInput(ctx, ctx.message.text)
      break
  }
})

async function handlePhoneInput(ctx: BotContext, phone: string) {
  const normalized = normalizePhone(phone) // "+37251234567"
  if (!isValidPhone(normalized)) {
    await ctx.reply(SCRIPTS.PHONE_INVALID)
    return
  }

  ctx.session.phone = normalized
  ctx.session.registrationStep = 'email'
  await ctx.reply(SCRIPTS.PHONE_OK)
  await registrationScene.enter(ctx) // перевход для показа следующего шага
}

async function handleEmailInput(ctx: BotContext, email: string) {
  if (!isValidEmail(email)) {
    await ctx.reply(SCRIPTS.EMAIL_INVALID)
    return
  }

  ctx.session.email = email.toLowerCase()
  ctx.session.registrationStep = 'name'
  await ctx.reply(SCRIPTS.EMAIL_OK)
  await registrationScene.enter(ctx)
}

async function handleNameInput(ctx: BotContext, name: string) {
  if (name.length < 2 || name.length > 50) {
    await ctx.reply('Введите корректное имя (2–50 символов)')
    return
  }

  ctx.session.name = name

  // Upsert лид в GSheets
  const leadId = await sheetsService.upsertLead({
    name: ctx.session.name!,
    phone: ctx.session.phone!,
    email: ctx.session.email!,
    tgId: ctx.from!.id,
    tgUsername: ctx.from!.username,
    source: ctx.session.isExistingLead ? 'tilda' : 'direct_bot',
    gdprAccepted: ctx.session.gdprAccepted,
  })

  ctx.session.leadId = leadId

  // Отменить email-цепочку если была запущена с Tilda
  await cancelEmailChain(leadId)

  await ctx.reply(SCRIPTS.NAME_OK(name))
  ctx.scene.enter('datePicker')
}
```

---

## DatePickerScene

```typescript
// scenes/datePicker.scene.ts

export const datePickerScene = new Scenes.BaseScene<BotContext>('datePicker')

datePickerScene.enter(async (ctx) => {
  const slots = await calendarService.getAvailableSlots(14)

  if (slots.length === 0) {
    await ctx.reply(SCRIPTS.NO_SLOTS, {
      reply_markup: {
        inline_keyboard: [[{ text: '📞 Написать менеджеру', url: config.MANAGER_LINK }]]
      }
    })
    return
  }

  // Группировка по датам
  const dateGroups = groupSlotsByDate(slots)

  await ctx.reply(SCRIPTS.PICK_DATE, {
    reply_markup: buildDateKeyboard(dateGroups)
  })
})

// Выбор даты → показать слоты времени
datePickerScene.action(/^date:(.+)$/, async (ctx) => {
  const date = ctx.match[1] // "2026-02-25"
  ctx.session.selectedDate = date
  await ctx.answerCbQuery()

  const slots = await calendarService.getSlotsForDate(date)
  await ctx.editMessageText(SCRIPTS.PICK_TIME(date), {
    reply_markup: buildTimeKeyboard(slots)
  })
})

// Выбор времени → показать подтверждение
datePickerScene.action(/^time:(.+):(.+)$/, async (ctx) => {
  const [_, time, eventId] = ctx.match
  ctx.session.selectedTime = time
  ctx.session.selectedCalEventId = eventId
  await ctx.answerCbQuery()

  await ctx.editMessageText(SCRIPTS.CONFIRM_BOOKING(ctx.session.selectedDate!, time), {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Подтвердить', callback_data: 'booking_confirm' },
        { text: '← Другое время', callback_data: `date:${ctx.session.selectedDate}` }
      ]]
    }
  })
})

// Подтверждение → создание Zoom
datePickerScene.action('booking_confirm', async (ctx) => {
  await ctx.answerCbQuery()
  await ctx.editMessageText(SCRIPTS.CREATING_ZOOM) // "⏳ Создаём Zoom-встречу..."

  try {
    // Создать Zoom meeting
    const meeting = await zoomService.createMeeting({
      topic: `All In Academy — Пробный урок (${ctx.session.name})`,
      startTime: buildISODate(ctx.session.selectedDate!, ctx.session.selectedTime!),
      duration: 60,
      timezone: 'Europe/Tallinn'
    })

    ctx.session.zoomLink = meeting.join_url
    ctx.session.lessonDatetime = meeting.start_time

    // Обновить GSheets
    await sheetsService.updateLead(ctx.session.leadId!, {
      lesson_date: ctx.session.selectedDate,
      lesson_time: ctx.session.selectedTime,
      lesson_datetime: meeting.start_time,
      zoom_link: meeting.join_url,
      zoom_meeting_id: meeting.id.toString(),
      status: 'SCHEDULED'
    })

    // Пометить слот занятым в Calendar
    await calendarService.markSlotBusy(
      ctx.session.selectedCalEventId!,
      { name: ctx.session.name!, phone: ctx.session.phone!, tgId: ctx.from!.id }
    )

    // Запланировать напоминания
    const lessonMs = new Date(meeting.start_time).getTime()
    const delay24h = lessonMs - Date.now() - (24 * 60 * 60 * 1000)
    const delay5h = lessonMs - Date.now() - (5 * 60 * 60 * 1000)

    const reminderData: ReminderJobData = {
      leadId: ctx.session.leadId!,
      tgId: ctx.from!.id,
      lessonDate: ctx.session.selectedDate!,
      lessonTime: ctx.session.selectedTime!,
      lessonDatetime: meeting.start_time,
      zoomLink: meeting.join_url,
      name: ctx.session.name!
    }

    if (delay24h > 0) {
      const job = await remindersQueue.add('remind24h', reminderData, { delay: delay24h })
      await redis.set(`remind24h_job:${ctx.session.leadId}`, job.id, 'EX', Math.ceil(delay24h / 1000) + 3600)
    }

    // remind5h добавляется из remind24h worker

    // Успешное сообщение
    await ctx.editMessageText(SCRIPTS.BOOKING_SUCCESS(
      ctx.session.selectedDate!,
      ctx.session.selectedTime!,
      meeting.join_url
    ))

    ctx.scene.enter('scheduled')

  } catch (error) {
    logger.error({ error }, 'Zoom creation failed')
    await ctx.editMessageText(SCRIPTS.ZOOM_ERROR)
    // Уведомить менеджера
    await notifyManagerError(ctx.session.leadId!, 'Zoom creation failed')
  }
})
```

---

## ScheduledScene

```typescript
// scenes/scheduled.scene.ts

export const scheduledScene = new Scenes.BaseScene<BotContext>('scheduled')

scheduledScene.enter(async (ctx) => {
  const lead = await sheetsService.findById(ctx.session.leadId!)

  await ctx.reply(SCRIPTS.SCHEDULED_MENU(lead), {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❓ Задать вопрос', callback_data: 'activate_ai' }],
        [{ text: '📅 Моя запись', callback_data: 'show_status' }],
        [{ text: '📞 Связаться с менеджером', url: config.MANAGER_LINK }]
      ]
    }
  })
})

scheduledScene.action('activate_ai', async (ctx) => {
  await ctx.answerCbQuery()
  ctx.session.prevScene = 'scheduled'
  // AI handler подхватит следующее сообщение
  await ctx.reply(SCRIPTS.AI_ACTIVATED)
})

scheduledScene.action('show_status', async (ctx) => {
  await ctx.answerCbQuery()
  const lead = await sheetsService.findById(ctx.session.leadId!)
  await ctx.reply(SCRIPTS.STATUS(lead))
})
```

---

## Global Confirmation Handler

```typescript
// handlers/confirmations.handler.ts
// Обрабатывает callback кнопок из напоминаний (BullMQ отправил сообщение)

bot.action(/^confirm:(.+)$/, async (ctx) => {
  const leadId = ctx.match[1]
  await ctx.answerCbQuery('✅ Подтверждено!')

  await sheetsService.updateLead(leadId, {
    confirmed: true,
    confirmed_at: new Date().toISOString(),
    status: 'CONFIRMED'
  })
  await sheetsService.appendLog(leadId, 'CONFIRMED', {})

  // Отменить remind5h если был
  const remind5hJobId = await redis.get(`remind5h_job:${leadId}`)
  if (remind5hJobId) {
    const job = await remindersQueue.getJob(remind5hJobId)
    if (job) await job.remove()
  }

  // Уведомить менеджеров
  const lead = await sheetsService.findById(leadId)
  await bot.telegram.sendMessage(
    process.env.TELEGRAM_ADMIN_GROUP_ID,
    formatConfirmedMessage(lead)
  )

  await ctx.editMessageText(SCRIPTS.CONFIRMATION_SUCCESS(lead!))
})

bot.action(/^reschedule:(.+)$/, async (ctx) => {
  const leadId = ctx.match[1]
  await ctx.answerCbQuery()

  await sheetsService.updateField(leadId, 'status', 'RESCHEDULED')
  const lead = await sheetsService.findById(leadId)

  await bot.telegram.sendMessage(
    process.env.TELEGRAM_ADMIN_GROUP_ID,
    formatRescheduleMessage(lead)
  )

  await ctx.editMessageText(SCRIPTS.RESCHEDULE_RESPONSE)
})
```
