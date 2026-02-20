# Directions: Схема данных (Google Sheets Mini-CRM)

## Структура таблицы

Google Sheets документ содержит 3 листа:
1. `leads` — основная CRM
2. `admin_log` — история событий (append only)
3. `available_slots` — резервный список слотов (если не через Google Calendar)

---

## Лист: `leads`

### Колонки (в порядке)

| # | Колонка | Тип | Описание | Заполняется |
|---|---------|-----|----------|-------------|
| A | `id` | STRING (UUID v4) | Уникальный идентификатор лида | Автоматически при создании |
| B | `created_at` | DATETIME (ISO 8601) | Время регистрации (UTC) | Tilda webhook / /start |
| C | `name` | STRING | Имя (родителя или ребёнка) | Бот (NameScene) или Tilda |
| D | `phone` | STRING | Телефон в формате +XXXXXXXXXXX | Tilda form / Bot PhoneScene |
| E | `email` | STRING | Email адрес | Tilda form / Bot EmailScene |
| F | `child_age` | INTEGER | Возраст ребёнка | Tilda form |
| G | `tg_id` | INTEGER | Telegram User ID | Бот при /start |
| H | `tg_username` | STRING | @username (может быть пустым) | Бот при /start |
| I | `source` | ENUM | Источник: "tilda" или "direct_bot" | Автоматически |
| J | `bot_activated` | BOOLEAN | Зашёл ли в бот | TRUE при /start |
| K | `bot_activated_at` | DATETIME | Когда активировал бота | Бот при /start |
| L | `lesson_date` | DATE (YYYY-MM-DD) | Выбранная дата урока | Бот DatePickerScene |
| M | `lesson_time` | TIME (HH:MM) | Выбранное время урока | Бот DatePickerScene |
| N | `lesson_datetime` | DATETIME | Полная дата+время (для BullMQ) | Автоматически при выборе |
| O | `zoom_link` | URL | Ссылка на Zoom-встречу | Zoom API |
| P | `zoom_meeting_id` | STRING | ID встречи Zoom | Zoom API |
| Q | `confirmed` | BOOLEAN | Подтвердил ли участие | Бот callback |
| R | `confirmed_at` | DATETIME | Когда подтвердил | Бот callback |
| S | `email_1_sent` | BOOLEAN | Отправлен ли Email #1 | BullMQ worker |
| T | `email_1_sent_at` | DATETIME | Когда отправлен Email #1 | BullMQ worker |
| U | `email_2_sent` | BOOLEAN | Отправлен ли Email #2 | BullMQ worker |
| V | `email_2_sent_at` | DATETIME | Когда отправлен Email #2 | BullMQ worker |
| W | `gdpr_accepted` | BOOLEAN | Принял ли соглашение GDPR | Бот при /start |
| X | `gdpr_accepted_at` | DATETIME | Когда принял | Бот при /start |
| Y | `status` | ENUM | Текущий статус лида | Автоматически |
| Z | `manager_notes` | STRING | Заметки менеджера | Менеджер вручную |
| AA | `last_updated` | DATETIME | Последнее обновление строки | Автоматически |

### Статусы (ENUM для колонки `status`)

| Статус | Описание | Следующий статус |
|--------|----------|-----------------|
| `NEW` | Форма заполнена, бот не открыт | → BOT_ACTIVE или CALL_NEEDED |
| `BOT_ACTIVE` | Зашёл в бот, дата не выбрана | → SCHEDULED |
| `SCHEDULED` | Дата выбрана, урок запланирован | → CONFIRMED или RESCHEDULED |
| `CONFIRMED` | Подтвердил участие | → ATTENDED |
| `RESCHEDULED` | Запросил перенос | → SCHEDULED |
| `CALL_NEEDED` | Не ответил, нужен звонок | → SCHEDULED или CANCELLED |
| `ATTENDED` | Пришёл на урок (менеджер ставит вручную) | — |
| `CANCELLED` | Отменил (через бота или менеджера) | — |

### Пример строки

```
id: "550e8400-e29b-41d4-a716-446655440000"
created_at: "2026-02-19T10:30:00Z"
name: "Анна Петрова"
phone: "+37251234567"
email: "anna@example.com"
child_age: 12
tg_id: 123456789
tg_username: "anna_parent"
source: "tilda"
bot_activated: TRUE
bot_activated_at: "2026-02-19T10:45:00Z"
lesson_date: "2026-02-25"
lesson_time: "15:00"
lesson_datetime: "2026-02-25T13:00:00Z"  ← UTC (EET+2 = 15:00 - 2ч)
zoom_link: "https://zoom.us/j/123456789"
zoom_meeting_id: "123456789"
confirmed: TRUE
confirmed_at: "2026-02-24T13:00:00Z"
email_1_sent: FALSE
email_1_sent_at: ""
email_2_sent: FALSE
email_2_sent_at: ""
gdpr_accepted: TRUE
gdpr_accepted_at: "2026-02-19T10:44:00Z"
status: "CONFIRMED"
manager_notes: ""
last_updated: "2026-02-24T13:00:05Z"
```

---

## Лист: `admin_log`

Только для добавления (никогда не редактировать). Хранит всю историю изменений.

| # | Колонка | Тип | Описание |
|---|---------|-----|----------|
| A | `timestamp` | DATETIME | Время события (UTC) |
| B | `lead_id` | STRING | UUID лида |
| C | `event_type` | ENUM | Тип события |
| D | `details` | JSON STRING | Детали события |
| E | `actor` | STRING | Кто выполнил: "bot", "bullmq", "manager", "system" |

### Event Types (ENUM)

| Event | Описание |
|-------|----------|
| `LEAD_CREATED` | Новый лид с Tilda или прямо из бота |
| `BOT_STARTED` | Клиент нажал /start |
| `GDPR_ACCEPTED` | Принял соглашение |
| `PHONE_SUBMITTED` | Ввёл телефон |
| `EMAIL_SUBMITTED` | Ввёл email |
| `NAME_SUBMITTED` | Ввёл имя |
| `DATE_SELECTED` | Выбрал дату урока |
| `ZOOM_CREATED` | Создана Zoom-встреча |
| `EMAIL_1_SENT` | Отправлен email #1 |
| `EMAIL_2_SENT` | Отправлен email #2 |
| `REMINDER_24H_SENT` | Отправлено напоминание за 24ч |
| `REMINDER_5H_SENT` | Отправлено напоминание за 5ч |
| `CONFIRMED` | Подтвердил участие |
| `DECLINED` | Отказался от урока |
| `CALL_NEEDED` | Менеджер должен позвонить |
| `RESCHEDULED` | Запросил перенос |
| `ATTENDED` | Посетил урок |
| `AI_QUERY` | Задал вопрос AI-ассистенту |

---

## Лист: `available_slots` (резервный, если не Google Calendar)

Используется как альтернатива Google Calendar для отображения слотов в боте.

| # | Колонка | Тип | Описание |
|---|---------|-----|----------|
| A | `slot_id` | STRING | UUID слота |
| B | `date` | DATE (YYYY-MM-DD) | Дата |
| C | `time_start` | TIME (HH:MM) | Начало (в часовом поясе Europe/Tallinn) |
| D | `time_end` | TIME (HH:MM) | Конец |
| E | `available` | BOOLEAN | TRUE = свободен, FALSE = занят |
| F | `booked_by_lead_id` | STRING | UUID лида если занят |
| G | `teacher` | STRING | Имя преподавателя (опционально) |

---

## Правила работы с Google Sheets API

### Аутентификация
- Использовать **Service Account** (не OAuth для пользователя)
- JSON ключ service account → переменная окружения `GOOGLE_SERVICE_ACCOUNT_JSON`
- Права доступа: **Editor** на Google Sheets документ

### Операции

```typescript
// Получить лид по tg_id
const row = await sheetsService.findByTgId(tgId)

// Создать новый лид
const leadId = await sheetsService.createLead({ name, phone, email, source })

// Обновить поле лида
await sheetsService.updateField(leadId, 'status', 'CONFIRMED')

// Добавить в admin_log
await sheetsService.appendLog(leadId, 'CONFIRMED', { confirmed_at: new Date() })

// Найти лид по email или телефону (для дедупликации)
const existing = await sheetsService.findByEmail(email)
```

### Дедупликация лидов
- При регистрации из Tilda: проверить по email → если есть, обновить существующий
- При /start в боте: проверить по tg_id → если есть, продолжить с текущим статусом
- При совпадении телефона + email: объединить записи

### ID Google Sheets документа
```
GOOGLE_SHEETS_ID=<будет передан при настройке>
```
