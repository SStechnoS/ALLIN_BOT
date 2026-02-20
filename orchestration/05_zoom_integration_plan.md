# Orchestration: Zoom API Integration

## Тип интеграции: Server-to-Server OAuth

Server-to-Server OAuth не требует ручной авторизации пользователя.
Работает с токенами на уровне аккаунта Zoom.

---

## Шаги настройки (один раз)

### 1. Создать приложение в Zoom Marketplace

1. Перейти: https://marketplace.zoom.us/develop/create
2. Выбрать: **Server-to-Server OAuth**
3. Заполнить:
   - App Name: "All In Academy Bot"
   - Description: "Automation bot for trial lessons scheduling"
4. Нажать **Create**
5. Скопировать:
   - `Account ID`
   - `Client ID`
   - `Client Secret`

### 2. Добавить необходимые Scopes

В разделе **Scopes** добавить:
- `meeting:write:meeting` — создание встреч
- `meeting:read:meeting` — чтение встреч (для проверки)

Нажать **Save** → **Continue** → **Activate**

### 3. Добавить credentials в .env

```env
ZOOM_ACCOUNT_ID=AbCdEf123...
ZOOM_CLIENT_ID=abcdef123456...
ZOOM_CLIENT_SECRET=AbCdEfGhIj...
```

---

## ZoomService Implementation

```typescript
// services/zoom.service.ts

import axios from 'axios'
import { redis } from '../redis'

const ZOOM_API_BASE = 'https://api.zoom.us/v2'
const TOKEN_CACHE_KEY = 'zoom_token'
const TOKEN_TTL_SECONDS = 50 * 60 // 50 минут (токен живёт 1 час)

interface ZoomMeetingResult {
  id: number
  join_url: string
  start_url: string
  password: string
  start_time: string // ISO 8601 UTC
}

class ZoomService {

  // Получить access token (с кэшированием в Redis)
  async getAccessToken(): Promise<string> {
    // Проверить кэш
    const cached = await redis.get(TOKEN_CACHE_KEY)
    if (cached) return cached

    // Запросить новый токен
    const credentials = Buffer.from(
      `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
    ).toString('base64')

    const response = await axios.post(
      `https://zoom.us/oauth/token`,
      null,
      {
        params: {
          grant_type: 'account_credentials',
          account_id: process.env.ZOOM_ACCOUNT_ID
        },
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    const token = response.data.access_token

    // Кэшировать на 50 минут
    await redis.set(TOKEN_CACHE_KEY, token, 'EX', TOKEN_TTL_SECONDS)

    return token
  }

  // Создать Zoom встречу
  async createMeeting(params: {
    topic: string
    startTime: string    // ISO 8601 UTC: "2026-02-25T13:00:00Z"
    duration: number     // в минутах
    timezone: string     // "Europe/Tallinn"
  }): Promise<ZoomMeetingResult> {
    const token = await this.getAccessToken()

    const response = await axios.post(
      `${ZOOM_API_BASE}/users/me/meetings`,
      {
        topic: params.topic,
        type: 2,                          // scheduled meeting
        start_time: params.startTime,
        duration: params.duration,
        timezone: params.timezone,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          waiting_room: false,            // без зала ожидания
          auto_recording: 'none'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    return {
      id: response.data.id,
      join_url: response.data.join_url,
      start_url: response.data.start_url,
      password: response.data.password,
      start_time: response.data.start_time
    }
  }

  // Удалить встречу (при переносе)
  async deleteMeeting(meetingId: string): Promise<void> {
    const token = await this.getAccessToken()
    await axios.delete(`${ZOOM_API_BASE}/meetings/${meetingId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
  }
}

export const zoomService = new ZoomService()
```

---

## Конвертация времени: EET → UTC

```typescript
// utils/datetime.ts
import { format, parseISO, zonedTimeToUtc } from 'date-fns-tz'

/**
 * Конвертировать дату+время из Europe/Tallinn в ISO 8601 UTC
 * Нужно для Zoom API
 */
export function toZoomStartTime(date: string, time: string): string {
  // date: "2026-02-25", time: "15:00"
  const localDatetime = `${date}T${time}:00`
  const utcDate = zonedTimeToUtc(localDatetime, 'Europe/Tallinn')
  return utcDate.toISOString().replace('.000', '') // "2026-02-25T13:00:00Z" (EET = UTC+2)
}

/**
 * Форматировать для отображения клиенту
 */
export function formatLessonDatetime(date: string, time: string): string {
  return `${formatDate(date)}, ${time} (по Таллину)`
}

function formatDate(date: string): string {
  // "2026-02-25" → "вторник, 25 февраля"
  const d = parseISO(date)
  return format(d, 'EEEE, d MMMM', { locale: ru })
}
```

---

## Обработка ошибок Zoom API

```typescript
async function createMeetingWithFallback(params) {
  try {
    return await zoomService.createMeeting(params)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const code = error.response?.data?.code

      if (status === 401) {
        // Токен истёк — сбросить кэш и повторить
        await redis.del(TOKEN_CACHE_KEY)
        return await zoomService.createMeeting(params) // retry once
      }

      if (status === 429) {
        // Rate limit — подождать и повторить
        await sleep(5000)
        return await zoomService.createMeeting(params)
      }
    }

    // Неизвестная ошибка — пробросить для обработки в сцене
    throw error
  }
}
```

---

## Тест Zoom интеграции

```typescript
// scripts/test_zoom.ts
async function testZoom() {
  console.log('Testing Zoom API...')

  // 1. Получить токен
  const token = await zoomService.getAccessToken()
  console.log('✅ Token obtained:', token.substring(0, 20) + '...')

  // 2. Создать тестовую встречу (через 2 часа)
  const testTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  const meeting = await zoomService.createMeeting({
    topic: 'TEST - All In Academy',
    startTime: testTime,
    duration: 60,
    timezone: 'Europe/Tallinn'
  })
  console.log('✅ Meeting created:', meeting.join_url)

  // 3. Удалить тестовую встречу
  await zoomService.deleteMeeting(meeting.id.toString())
  console.log('✅ Meeting deleted')

  console.log('Zoom integration OK!')
}

testZoom().catch(console.error)
```
