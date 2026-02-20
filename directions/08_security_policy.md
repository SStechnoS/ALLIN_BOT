# Directions: Политика безопасности All In Academy Bot

## 1. Переменные окружения (Environment Variables)

Все секреты хранятся ТОЛЬКО в `.env` файле. Никогда не коммитить в git.

### Обязательные переменные

```env
# Telegram
TELEGRAM_BOT_TOKEN=           # Токен от @BotFather
TELEGRAM_ADMIN_GROUP_ID=      # ID Telegram-группы менеджеров (начинается с -100...)
TELEGRAM_MANAGER_USERNAME=    # @username менеджера для редиректа

# OpenAI
OPENAI_API_KEY=               # sk-... (GPT-4o mini + Whisper)

# Zoom
ZOOM_ACCOUNT_ID=              # Server-to-Server OAuth
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=

# Google
GOOGLE_SERVICE_ACCOUNT_JSON=  # JSON в одну строку (base64 или escaped)
GOOGLE_SHEETS_ID=             # ID Google Sheets документа
GOOGLE_CALENDAR_ID=           # ID Google Calendar (primary или кастомный)

# Resend (Email)
RESEND_API_KEY=               # re_...
RESEND_FROM_EMAIL=            # hello@allinacademy.ee
RESEND_FROM_NAME=             # All In Academy

# Redis
REDIS_URL=                    # redis://localhost:6379 или redis://redis:6379

# App
NODE_ENV=                     # development / production
APP_PORT=                     # 3000
WEBHOOK_HOST=                 # https://yourdomain.com (для Telegram webhook)
TILDA_WEBHOOK_SECRET=         # случайная строка для валидации Tilda запросов
INTERNAL_SECRET=              # случайная строка для внутренних запросов

# Bot deep link
BOT_LINK=                     # https://t.me/YourBotName
```

### Генерация секретов

```bash
# Генерация случайных строк для TILDA_WEBHOOK_SECRET и INTERNAL_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 2. Защита Tilda Webhook

Tilda подписывает запросы секретным токеном. Проверять при каждом входящем запросе.

```typescript
// webhooks/tilda.webhook.ts
const TILDA_SECRET = process.env.TILDA_WEBHOOK_SECRET

function validateTildaRequest(req: FastifyRequest): boolean {
  const signature = req.headers['x-tilda-secret'] as string
  return signature === TILDA_SECRET
}

// При несовпадении → 403 Forbidden, не обрабатывать
```

---

## 3. Защита Internal API

BullMQ workers вызывают внутренние эндпоинты для отправки сообщений через бот.

```typescript
function validateInternalRequest(req: FastifyRequest): boolean {
  const secret = req.headers['x-internal-secret'] as string
  return secret === process.env.INTERNAL_SECRET
}
```

---

## 4. Защита AI-ассистента

Подробно описана в `directions/04_ai_assistant_sop.md`.

Краткое резюме:
1. **Pre-filter** — словари для цен и prompt injection, блокировать до API
2. **System prompt** — ролевое якорение, запреты
3. **Post-filter** — проверка ответа на цены и утечку промпта
4. **Rate limit** — 10 запросов/час на tg_id (Redis)
5. **Изоляция данных** — GPT не получает персональные данные клиентов

---

## 5. GDPR Compliance (Эстония = ЕС)

### Правовая основа
Школа зарегистрирована в Эстонии → GDPR применяется в полной мере.

### Согласие на обработку данных
- Клиент должен **явно принять** соглашение до передачи персональных данных
- Хранить: `gdpr_accepted=TRUE`, `gdpr_accepted_at=timestamp`
- Ссылка на политику конфиденциальности: https://allinacademy.ee/privacy

### Что передаётся третьим сторонам
| Данные | Куда | Правовая основа |
|--------|------|-----------------|
| Имя, email | Resend (email) | Согласие пользователя |
| tg_id, сообщения | Telegram | Публичная политика Telegram |
| Вопросы (текст) | OpenAI API | Согласие пользователя |
| Имя, email, время | Zoom | Согласие пользователя |
| Все данные | Google Sheets | Согласие пользователя |

> **Важно**: В Политике конфиденциальности на сайте должны быть упомянуты все эти сервисы.

### Срок хранения данных
- Данные хранить не более **12 месяцев** с последнего взаимодействия
- После 12 месяцев — удалять персональные данные (name, phone, email), оставлять анонимизированную аналитику
- Функция удаления: `sheets.anonymizeLead(leadId)` (заменить данные на "[DELETED]")

### Право на удаление
- Клиент может запросить удаление через менеджера
- Команда `/delete_my_data` в боте → уведомление менеджеру

---

## 6. Безопасность данных в Google Sheets

- Service Account имеет права **только** на конкретный Sheets документ (не все)
- JSON ключ Service Account хранится в env переменной, не в файлах
- Доступ к таблице: только бот (Service Account) и менеджер (вручную)
- Таблица не публичная, только по ссылке для авторизованных

---

## 7. Безопасность Zoom

- Использовать **Server-to-Server OAuth** (не Personal Access Token)
- Токены обновляются автоматически (OAuth flow)
- Scope: `meeting:write:meeting` (минимально необходимый)
- Zoom встречи с паролем (по умолчанию Zoom Pro генерирует)

---

## 8. Безопасность Redis

- Redis не должен быть доступен публично (только внутренняя сеть Docker)
- Если Redis в облаке — использовать TLS + AUTH

---

## 9. Логирование

### Что логировать
- Все входящие webhook-запросы (без body для безопасности)
- Ошибки и исключения (с stack trace)
- Изменения статуса лидов
- Отправленные email/Telegram сообщения
- AI запросы (без текста пользователя — только метрики)

### Что НЕ логировать
- Персональные данные (email, phone) в логах
- Текст сообщений пользователей
- API ключи и токены
- Содержимое Zoom встреч

---

## 10. .gitignore

```gitignore
.env
.env.local
.env.production
node_modules/
dist/
*.log
google-service-account.json
```

---

## 11. Инфраструктурная безопасность

### Docker
- Не запускать контейнеры от root
- Minimal base images (node:20-alpine)
- Нет лишних portов в production (только 80/443 через Nginx)

### Nginx
- HTTPS everywhere (Let's Encrypt)
- HTTP → HTTPS redirect
- Закрыть прямой доступ к порту приложения (только через Nginx)
- Rate limiting на webhook эндпоинтах: 10 req/min per IP

### VPS
- Отключить password auth SSH (только ключи)
- Firewall: открыть только 22, 80, 443
- Автообновление системных пакетов (unattended-upgrades)
