# All In Academy — Telegram Bot

Бот для онлайн-школы английского языка [All In Academy](https://allinacademy.ee).
Автоматизирует запись на пробный урок: сбор данных → выбор слота → Zoom → Google Sheets CRM → email-цепочка.

---

## Содержание

1. [Быстрый старт (локально)](#1-быстрый-старт-локально)
2. [Переменные окружения (.env)](#2-переменные-окружения-env)
3. [Настройка Google Sheets](#3-настройка-google-sheets)
4. [Настройка Google Calendar](#4-настройка-google-calendar)
5. [Настройка Zoom](#5-настройка-zoom)
6. [Настройка Resend (email)](#6-настройка-resend-email)
7. [Деплой на сервер (Docker + Nginx)](#7-деплой-на-сервер-docker--nginx)
8. [Настройка Tilda webhook](#8-настройка-tilda-webhook)
9. [Управление слотами в Calendar](#9-управление-слотами-в-calendar)
10. [Архитектура](#10-архитектура)

---

## 1. Быстрый старт (локально)

### Требования
- Node.js 20+
- Redis 7+ (локально или через Docker)

### Установка

```bash
cd execution/bot
npm install
```

### Запуск Redis (если нет локального)

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

### Запуск бота

```bash
cd execution/bot
npm run dev
```

Бот запустится в режиме polling (без webhook). Логи в консоли.

### Настройка Google Sheets (первый раз)

```bash
cd execution/bot
npm run setup:sheets
```

Создаёт 4 листа: `leads`, `manager_view`, `admin_log`, `system`.

---

## 2. Переменные окружения (.env)

Файл: `execution/bot/.env`
Шаблон: `execution/infrastructure/.env.example`

```env
# Telegram
TELEGRAM_BOT_TOKEN=         # @BotFather → токен
TELEGRAM_ADMIN_GROUP_ID=    # ID группы менеджеров (формат: -1001234567890)
TELEGRAM_MANAGER_USERNAME=  # @username менеджера

# OpenAI
OPENAI_API_KEY=             # sk-proj-...

# Zoom (Server-to-Server OAuth)
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=

# Google
GOOGLE_SERVICE_ACCOUNT_JSON=  # JSON ключ в одну строку
GOOGLE_SHEETS_ID=             # ID таблицы из URL
GOOGLE_CALENDAR_ID=           # ID календаря

# Email (Resend)
RESEND_API_KEY=               # re_...
RESEND_FROM_EMAIL=hello@allinacademy.ee
RESEND_FROM_NAME=All In Academy

# Redis
REDIS_URL=redis://localhost:6379   # локально
# REDIS_URL=redis://redis:6379     # в Docker Compose

# App
NODE_ENV=production
APP_PORT=3000
WEBHOOK_HOST=https://bot.allinacademy.ee  # домен для Telegram webhook

# Secrets (генерировать командой ниже)
TILDA_WEBHOOK_SECRET=   # случайная строка 32+ символа
INTERNAL_SECRET=        # другая случайная строка 32+ символа

# Bot
BOT_LINK=https://t.me/ALLIN_school_Bot
WELCOME_VIDEO_FILE_ID=  # file_id видео-кружка (опционально)
```

**Генерация секретов:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Настройка Google Sheets

### Создать Service Account

1. Перейди в [Google Cloud Console](https://console.cloud.google.com)
2. Создай проект → включи **Google Sheets API** и **Google Calendar API**
3. IAM и администрирование → Сервисные аккаунты → Создать
4. Скачай JSON-ключ → содержимое вставить в `GOOGLE_SERVICE_ACCOUNT_JSON` одной строкой

### Дать доступ к таблице

1. Создай Google Sheets таблицу
2. Настройки доступа → добавить email сервисного аккаунта (вида `name@project.iam.gserviceaccount.com`)
3. Права: **Редактор**
4. ID таблицы — из URL: `docs.google.com/spreadsheets/d/`**`ВОТ_ЭТО`**`/edit`

### Инициализировать структуру

```bash
npm run setup:sheets
```

Создаст листы:
- `leads` — все данные (28 колонок, для бота и системы)
- `manager_view` — автообновляемый вид для менеджера (формула QUERY)
- `admin_log` — история событий
- `system` — технические данные

---

## 4. Настройка Google Calendar

### Дать доступ сервисному аккаунту

1. Открой Google Calendar
2. Настройки нужного календаря → **«Поделиться с конкретными людьми»**
3. Добавить email сервисного аккаунта
4. Права: **«Вносить изменения в мероприятия»** ← важно!
5. ID календаря — в настройках в разделе «Интеграция календаря»

### Создание слотов для записи

Менеджер создаёт события в Google Calendar с **точным названием** `Пробный урок`:

- Название: `Пробный урок` (строго, с большой буквы)
- Длительность: 60 минут
- Без повтора

Бот показывает эти события клиентам как доступные слоты.
После бронирования переименовывает в `Пробный урок — Имя клиента`.

---

## 5. Настройка Zoom

### Создать Server-to-Server OAuth App

1. Перейди на [marketplace.zoom.us](https://marketplace.zoom.us)
2. Develop → Build App → **Server-to-Server OAuth**
3. Укажи название приложения
4. Скопируй `Account ID`, `Client ID`, `Client Secret`
5. В разделе Scopes добавь:
   - `meeting:write:admin`
   - `meeting:read:admin`
6. Активируй приложение

---

## 6. Настройка Resend (email)

1. Зарегистрируйся на [resend.com](https://resend.com)
2. Добавь домен `allinacademy.ee` → получи DNS-записи (3 TXT)
3. Добавь DNS-записи в настройки домена (у регистратора)
4. Дождись верификации → скопируй API-ключ

---

## 7. Деплой на сервер (Docker + Nginx)

### Требования к серверу

- Ubuntu 22.04 / Debian 12
- 2 GB RAM, 20 GB SSD (Hetzner CX22 Helsinki — рекомендуется для GDPR)
- Docker + Docker Compose
- Nginx
- Certbot (SSL)

### Шаги деплоя

#### 1. Подготовка сервера

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git
systemctl enable docker
```

#### 2. Загрузить код

```bash
git clone <репозиторий> /opt/allin-bot
cd /opt/allin-bot
```

Или скопировать через scp:
```bash
scp -r ./execution user@SERVER_IP:/opt/allin-bot/
```

#### 3. Создать .env на сервере

```bash
cp execution/infrastructure/.env.example execution/bot/.env
nano execution/bot/.env   # заполнить все значения
```

Изменить для production:
```env
NODE_ENV=production
REDIS_URL=redis://redis:6379
WEBHOOK_HOST=https://bot.allinacademy.ee
```

#### 4. Запустить Docker Compose

```bash
cd execution/infrastructure
docker compose up -d --build
```

Проверить:
```bash
docker compose ps
docker compose logs -f bot
```

#### 5. Настроить Nginx

```nginx
# /etc/nginx/sites-available/allin-bot
server {
    listen 80;
    server_name bot.allinacademy.ee;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/allin-bot /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

#### 6. SSL сертификат

```bash
certbot --nginx -d bot.allinacademy.ee
```

#### 7. Настроить Sheets (один раз)

```bash
docker compose exec bot npm run setup:sheets
```

#### 8. Зарегистрировать Telegram Webhook

После деплоя выполни один раз:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://bot.allinacademy.ee/telegram"
```

Проверить:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

---

## 8. Настройка Tilda webhook

В Tilda (форма записи на сайте):

1. Настройки формы → **Webhook**
2. URL: `https://bot.allinacademy.ee/tilda`
3. Метод: POST
4. Добавить заголовок: `X-Tilda-Secret: <значение TILDA_WEBHOOK_SECRET из .env>`

Поля формы, которые Tilda должна передавать:
- `name` — имя
- `phone` — телефон
- `email` — email (опционально)

---

## 9. Управление слотами в Calendar

| Действие | Как |
|---------|-----|
| Добавить слот | Создать событие `Пробный урок` в Google Calendar |
| Заблокировать слот | Переименовать вручную или не создавать |
| Посмотреть записи | Открыть лист `manager_view` в Google Sheets |
| Связаться с клиентом | Нажать username в колонке `TG @username` |

---

## 10. Архитектура

```
Telegram Bot (Telegraf 4.x)
    ↓
Fastify Web Server (порт 3000)
    ├── POST /telegram   — Telegram webhook (production)
    ├── POST /tilda      — Tilda form webhook
    └── GET  /health     — healthcheck

BullMQ + Redis 7
    ├── emailChain worker  — цепочка email (30мин → 24ч → 24ч)
    └── reminder worker    — напоминания (T-24h, T-5h)

Внешние сервисы:
    ├── Google Sheets API  — CRM (лиды, события)
    ├── Google Calendar API — слоты для записи
    ├── Zoom API           — создание/удаление встреч
    ├── Resend API         — отправка email
    └── OpenAI API         — AI-ассистент (GPT-4o mini + Whisper)
```

### FSM сценарий записи

```
/start
  → GDPR согласие
  → PhoneScene (телефон)
  → EmailScene (email)
  → NameScene (имя)
  → DatePicker (выбор даты из Calendar)
  → TimePicker (выбор времени)
  → Подтверждение
  → Booking: markSlotBusy + createZoom + updateSheets + scheduleReminders
  → Подтверждение отправлено
```

---

## Команды бота

| Команда | Описание |
|---------|---------|
| `/start` | Начать запись на пробный урок |
| `/ai` | AI-ассистент (вопросы о школе) |
| `/reschedule` | Перенести урок (за 3+ часа до начала) |

---

## Поддержка и контакты

- Сайт: [allinacademy.ee](https://allinacademy.ee)
- Instagram: [@allin.school](https://www.instagram.com/allin.school/)
- Менеджер: @lxvrovv
