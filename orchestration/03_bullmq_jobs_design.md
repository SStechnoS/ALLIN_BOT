# Orchestration: BullMQ Jobs Design

BullMQ — Redis-based job queue. Заменяет n8n для всех отложенных задач.

## Архитектура очередей

```
Redis
  └── BullMQ
        ├── Queue: "emailChain"
        │     ├── Job: "email1"      delay: 30 min
        │     ├── Job: "email2"      delay: 24 h (после email1)
        │     └── Job: "callAlert"   delay: 24 h (после email2)
        │
        └── Queue: "reminders"
              ├── Job: "remind24h"   delay: lesson_time - 24h
              └── Job: "remind5h"    delay: lesson_time - 5h
```

---

## Queue: emailChain

### Job: email1

**Назначение**: Напомнить клиенту перейти в бот через 30 минут после регистрации на Tilda.

**Когда добавляется**: В TildaHandler сразу после записи лида в GSheets.

**Job данные**:
```typescript
interface Email1JobData {
  leadId: string      // UUID лида в GSheets
  email: string       // email клиента (кэш, чтобы не лезть в Sheets при каждом check)
  name: string        // имя клиента
}
```

**Delay**: `30 * 60 * 1000` мс (30 минут)

**Логика Worker**:
```typescript
async function processEmail1(job: Job<Email1JobData>) {
  const lead = await sheetsService.findById(job.data.leadId)

  // Отмена если бот уже активирован
  if (lead?.bot_activated) {
    logger.info({ leadId: job.data.leadId }, 'Email1 cancelled: bot already activated')
    return
  }

  // Отправить email
  await emailService.sendEmail1(job.data.email, job.data.name)
  await sheetsService.updateField(job.data.leadId, 'email_1_sent', true)
  await sheetsService.updateField(job.data.leadId, 'email_1_sent_at', new Date().toISOString())
  await sheetsService.appendLog(job.data.leadId, 'EMAIL_1_SENT', {})

  // Поставить следующий job в очередь
  const email2Job = await emailChainQueue.add('email2',
    { leadId: job.data.leadId, email: job.data.email, name: job.data.name },
    { delay: 24 * 60 * 60 * 1000 }
  )

  // Сохранить ID следующего job в Redis (для отмены)
  await redis.set(`email_job:${job.data.leadId}`, email2Job.id, 'EX', 48 * 3600)
}
```

**Retry**: 3 попытки, exponential backoff (1m, 5m, 15m)

---

### Job: email2

**Назначение**: Финальное напоминание через 24 ч после email1.

**Job данные**: То же что email1 (`Email1JobData`)

**Delay**: Устанавливается при добавлении (24ч после отправки email1)

**Логика Worker**:
```typescript
async function processEmail2(job: Job<Email1JobData>) {
  const lead = await sheetsService.findById(job.data.leadId)

  if (lead?.bot_activated) return // отмена

  await emailService.sendEmail2(job.data.email, job.data.name)
  await sheetsService.updateField(job.data.leadId, 'email_2_sent', true)
  await sheetsService.appendLog(job.data.leadId, 'EMAIL_2_SENT', {})

  // Поставить callAlert
  const callJob = await emailChainQueue.add('callAlert',
    { leadId: job.data.leadId, name: job.data.name, phone: lead?.phone || '' },
    { delay: 24 * 60 * 60 * 1000 }
  )
  await redis.set(`email_job:${job.data.leadId}`, callJob.id, 'EX', 25 * 3600)
}
```

---

### Job: callAlert

**Назначение**: Уведомить менеджера что клиент не отреагировал — нужен звонок.

**Job данные**:
```typescript
interface CallAlertJobData {
  leadId: string
  name: string
  phone: string
}
```

**Логика Worker**:
```typescript
async function processCallAlert(job: Job<CallAlertJobData>) {
  const lead = await sheetsService.findById(job.data.leadId)

  if (lead?.bot_activated) return // отмена

  // Обновить статус
  await sheetsService.updateField(job.data.leadId, 'status', 'CALL_NEEDED')
  await sheetsService.appendLog(job.data.leadId, 'CALL_NEEDED', {})

  // Уведомить менеджеров в Telegram-группу
  await bot.telegram.sendMessage(
    process.env.TELEGRAM_ADMIN_GROUP_ID,
    formatCallNeededMessage(lead)
  )
}
```

---

## Queue: reminders

### Job: remind24h

**Назначение**: Напомнить клиенту об уроке за 24 часа, запросить подтверждение.

**Когда добавляется**: После успешного выбора даты в DatePickerScene.

**Job данные**:
```typescript
interface ReminderJobData {
  leadId: string
  tgId: number
  lessonDate: string      // "2026-02-25"
  lessonTime: string      // "15:00"
  lessonDatetime: string  // ISO 8601 UTC
  zoomLink: string
  name: string
}
```

**Delay вычисляется**:
```typescript
const lessonMs = new Date(lessonDatetime).getTime()
const nowMs = Date.now()
const delay24h = lessonMs - nowMs - (24 * 60 * 60 * 1000)

// Если delay24h < 0 (урок менее чем через 24ч) → skip, только remind5h
```

**Логика Worker**:
```typescript
async function processRemind24h(job: Job<ReminderJobData>) {
  const lead = await sheetsService.findById(job.data.leadId)
  if (!lead || lead.confirmed) return // уже подтвердил ранее

  // Отправить напоминание с кнопками
  await bot.telegram.sendMessage(job.data.tgId, formatReminder24h(job.data), {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Да, буду!', callback_data: `confirm:${job.data.leadId}` },
        { text: '📅 Перенести', callback_data: `reschedule:${job.data.leadId}` }
      ]]
    }
  })

  await sheetsService.appendLog(job.data.leadId, 'REMINDER_24H_SENT', {})

  // Поставить remind5h
  const delay5h = new Date(job.data.lessonDatetime).getTime() - Date.now() - (5 * 60 * 60 * 1000)
  if (delay5h > 0) {
    const remind5hJob = await remindersQueue.add('remind5h', job.data, { delay: delay5h })
    await redis.set(`remind5h_job:${job.data.leadId}`, remind5hJob.id, 'EX', 6 * 3600)
  }
}
```

---

### Job: remind5h

**Назначение**: Второе напоминание за 5 часов (если клиент не подтвердил).

**Логика Worker**:
```typescript
async function processRemind5h(job: Job<ReminderJobData>) {
  const lead = await sheetsService.findById(job.data.leadId)
  if (!lead || lead.confirmed) return // уже подтвердил

  await bot.telegram.sendMessage(job.data.tgId, formatReminder5h(job.data), {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Да, буду!', callback_data: `confirm:${job.data.leadId}` },
        { text: '📅 Перенести', callback_data: `reschedule:${job.data.leadId}` }
      ]]
    }
  })

  await sheetsService.appendLog(job.data.leadId, 'REMINDER_5H_SENT', {})
}
```

---

## Отмена Jobs (при bot_activated)

При `/start` в боте — найти и удалить pending email jobs:

```typescript
// В WelcomeScene или при upsertLead
async function cancelEmailChain(leadId: string) {
  const jobId = await redis.get(`email_job:${leadId}`)
  if (jobId) {
    const job = await emailChainQueue.getJob(jobId)
    if (job) await job.remove()
    await redis.del(`email_job:${leadId}`)
    logger.info({ leadId, jobId }, 'Email chain cancelled')
  }
}
```

---

## Хранение Job IDs в Redis

```
Ключ                          | Значение          | TTL
------------------------------|-------------------|--------
email_job:{leadId}            | BullMQ Job ID     | 48h
remind5h_job:{leadId}         | BullMQ Job ID     | 6h
zoom_token                    | Zoom access token | 50m (меньше 1h срока)
ai_rate:{tgId}                | число запросов    | 1h
ai_history:{tgId}             | JSON array msgs   | 24h
```

---

## BullMQ конфигурация

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq'
import { redis } from './redis'

const CONNECTION = { connection: redis }

export const emailChainQueue = new Queue('emailChain', CONNECTION)
export const remindersQueue = new Queue('reminders', CONNECTION)

// Workers
new Worker('emailChain', emailChainWorkerProcessor, {
  ...CONNECTION,
  concurrency: 5,
})

new Worker('reminders', remindersWorkerProcessor, {
  ...CONNECTION,
  concurrency: 5,
})

// Глобальные настройки retry
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 60000, // 1 мин базовый delay
  },
  removeOnComplete: { count: 100 },  // хранить последние 100 выполненных
  removeOnFail: { count: 200 },       // хранить последние 200 упавших
}
```
