# Orchestration: Системная архитектура All In Academy Bot

## Компонентная диаграмма

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ВНЕШНИЕ ВХОДНЫЕ ТОЧКИ                         │
│                                                                      │
│   Tilda Form          Telegram Client       Browser (Direct Bot)    │
│   (родитель)          (WhatsApp-like)       (через t.me/...)        │
└─────────┬─────────────────────┬────────────────────┬───────────────┘
          │ POST /webhook/tilda  │ POST /webhook/tg    │ /start
          │                      │                     │
┌─────────▼──────────────────────▼─────────────────────▼──────────────┐
│                    NGINX (HTTPS Reverse Proxy)                       │
│                    yourdomain.com:443                                │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│             NODE.JS APP (Fastify + Telegraf + BullMQ)               │
│                          Port 3000                                  │
│                                                                      │
│  ┌─────────────────────┐    ┌────────────────────────────────────┐  │
│  │   FASTIFY ROUTES    │    │         TELEGRAF BOT               │  │
│  │                     │    │                                    │  │
│  │ POST /webhook/tilda │    │  SceneManager (Telegraf Scenes)    │  │
│  │ POST /webhook/tg    │    │    WelcomeScene                    │  │
│  │                     │    │    RegistrationScene               │  │
│  └──────────┬──────────┘    │    DatePickerScene                 │  │
│             │               │    ScheduledScene                  │  │
│             │               │                                    │  │
│  ┌──────────▼──────────┐    │  Global Middleware:                │  │
│  │   TILDA HANDLER     │    │    session (Redis)                 │  │
│  │                     │    │    i18n (ru/en)                   │  │
│  │ validate secret     │    │                                    │  │
│  │ upsert GSheets row  │    │  Global Handlers:                  │  │
│  │ enqueue email job   │    │    voice.handler (Whisper)         │  │
│  └─────────────────────┘    │    ai.handler (GPT-4o mini)       │  │
│                              │    confirmation.handler            │  │
│  ┌─────────────────────┐    └────────────────────────────────────┘  │
│  │   BULLMQ QUEUES     │                                             │
│  │                     │    ┌────────────────────────────────────┐  │
│  │ emailChainQueue:    │    │         SERVICES LAYER             │  │
│  │  • email1 (30m)     │    │                                    │  │
│  │  • email2 (24h)     │    │  SheetsService  CalendarService    │  │
│  │  • callAlert (24h)  │    │  ZoomService    EmailService       │  │
│  │                     │    │  OpenAIService  AIGuard            │  │
│  │ reminderQueue:      │    │                                    │  │
│  │  • remind24h        │    └────────────────────────────────────┘  │
│  │  • remind5h         │                                             │
│  └─────────────────────┘                                             │
└──────────────────────────────────────────────────────────────────────┘
          │                           │
    ┌─────▼──────┐            ┌───────▼──────────────────────────┐
    │   REDIS    │            │         EXTERNAL APIS            │
    │            │            │                                  │
    │ Sessions   │            │  Google Sheets API v4 (CRM)     │
    │ BullMQ DB  │            │  Google Calendar API v3 (slots) │
    │ Rate limit │            │  Zoom API (create meeting)       │
    │ AI history │            │  OpenAI GPT-4o-mini (AI chat)   │
    │ Job IDs    │            │  OpenAI Whisper-1 (voice)        │
    └────────────┘            │  Resend API (emails)             │
                              └──────────────────────────────────┘
```

---

## Схема сетевого взаимодействия (Docker Compose)

```
Internet
    │
    ▼
[Nginx :80/:443] ─── proxy_pass ──► [Node.js :3000]
                                            │
                       [Redis :6379] ◄──────┤
                       (internal only)      │
                                            │
                                     external APIs
                                     (outbound HTTPS)
```

---

## Схема данных (Data Flow по всем сценариям)

### Сценарий 1: Tilda → Bot activation

```
Tilda Form
  │ POST /webhook/tilda
  │ {name, phone, email, child_age}
  ▼
TildaHandler
  │── validate X-Tilda-Secret header
  │── SheetsService.upsertLead({..., source:'tilda', status:'NEW'})
  │── emailChainQueue.add('email1', {leadId}, {delay: 30*60*1000})
  └── response 200 OK

[30 мин позже — BullMQ Worker]
EmailChainWorker.process('email1')
  │── SheetsService.findById(leadId) → lead
  │── if lead.bot_activated === true → return (отмена цепочки)
  │── EmailService.sendEmail1(lead.email, lead.name)
  │── SheetsService.updateField(leadId, 'email_1_sent', true)
  │── emailChainQueue.add('email2', {leadId}, {delay: 24*60*60*1000})
  └── SheetsService.appendLog(leadId, 'EMAIL_1_SENT')
```

### Сценарий 2: Полный Bot Flow

```
/start → WelcomeScene.enter()
  │── send welcome text
  │── send video_note (file_id from config)
  │── show GDPR keyboard
  ▼
[Callback: gdpr_accept] → RegistrationScene.enter()
  │── send phone request (contact button)
  ▼
[Contact / text phone] → PhoneScene handler
  │── validate phone
  │── ctx.session.phone = phone
  │── send email request
  ▼
[text email] → EmailScene handler
  │── validate email
  │── ctx.session.email = email
  │── SheetsService.findByEmail(email) → check duplicate
  │── send name request
  ▼
[text name] → NameScene handler
  │── ctx.session.name = name
  │── SheetsService.upsertLead(ctx.session + {tg_id, source:'direct_bot'})
  │── SheetsService.updateField(leadId, 'bot_activated', true)
  │── emailChainQueue.remove(existingJobId) ← если был из Tilda
  │── DatePickerScene.enter()
  ▼
DatePickerScene.enter()
  │── CalendarService.getAvailableSlots(14 days)
  │── render InlineKeyboard (dates)
  ▼
[Callback: date selected] → show time slots for date
[Callback: time selected] → show confirmation
[Callback: confirm] →
  │── ZoomService.createMeeting({date, time, name, email})
  │── → {join_url, meeting_id}
  │── SheetsService.update({lesson_date, lesson_time, zoom_link, status:'SCHEDULED'})
  │── CalendarService.markSlotBusy(calEventId, leadInfo)
  │── reminderQueue.add('remind24h', {leadId, tgId}, {delay: lessonTime - 24h})
  │── send success message with zoom_link
  └── ScheduledScene.enter()
```

### Сценарий 3: AI Mode

```
[любая сцена] User sends message
  │
  ├── if ctx.scene is in STRICT_SCENES (phone/email/name)
  │   AND no /ai command → handle as scene input
  │
  └── else:
      AIHandler.handle(ctx)
        │── preFilter(text) → 'price' | 'inject' | 'ok'
        │   price → send PRICE_RESPONSE (no API call)
        │   inject → send INJECT_RESPONSE (no API call)
        │   ok →
        │       checkRateLimit(tgId) → bool
        │       false → send RATE_LIMIT_RESPONSE
        │       true →
        │           history = redis.get(`ai_history:${tgId}`)
        │           response = openai.chat({system, history, user: text})
        │           filtered = postFilter(response)
        │           redis.setex(`ai_history:${tgId}`, 86400, [...history, ...])
        │           send filtered response
        └── show "↩ Вернуться" button
```

### Сценарий 4: Voice Message

```
[любая сцена] User sends voice
  │
  VoiceHandler.handle(ctx)
    │── fileUrl = getTelegramFileUrl(ctx.message.voice.file_id)
    │── audioBuffer = fetch(fileUrl)
    │── text = openai.audio.transcriptions.create({model:'whisper-1', file:audioBuffer, language:'ru'})
    │── ctx.message.text = text ← подменяем для дальнейшей обработки
    └── передать в текущий handler сцены или AIHandler
```

---

## Обработка ошибок

### Стратегия

| Компонент | При ошибке | Fallback |
|-----------|-----------|---------|
| Google Sheets | retry 3x с экспоненциальным backoff | логировать, уведомить dev |
| Zoom API | retry 2x | отправить сообщение клиенту + уведомить менеджера |
| OpenAI (AI) | если 5xx/timeout | "Сейчас не могу ответить, попробуйте позже" |
| OpenAI (Whisper) | если ошибка | "Не смог распознать. Введите текстом пожалуйста" |
| Resend (email) | retry 2x | логировать, пометить в GSheets |
| BullMQ job | retry 3x | перевести в failed, уведомить dev |

### Глобальный error handler (Telegraf)

```typescript
bot.catch((err, ctx) => {
  logger.error({ err, userId: ctx.from?.id }, 'Bot error')
  ctx.reply('Что-то пошло не так. Попробуйте /start или напишите менеджеру: {MANAGER_LINK}')
})
```

---

## Производительность и масштабирование

### Текущие ожидаемые нагрузки
- 10–50 новых лидов в день
- Пиковые часы: 18:00–22:00 EET
- Одновременных пользователей: 5–15

### Оптимизации
- Google Sheets запросы кэшировать в Redis (TTL 30 сек) для часто читаемых данных (слоты)
- AI история в Redis (не GSheets)
- BullMQ concurrency: 5 (5 параллельных worker потоков)

### Мониторинг (опционально, добавить позже)
- Bull Board UI (визуализация BullMQ очередей)
- Sentry для ошибок
- Uptime robot для мониторинга доступности
