FROM node:20-alpine AS builder

WORKDIR /app

# Установка зависимостей
COPY package*.json ./
RUN npm ci --only=production=false

# Сборка TypeScript
COPY . .
RUN npm run build

# ----------------------------------
FROM node:20-alpine AS production

WORKDIR /app

# Только prod зависимости
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Скомпилированный код
COPY --from=builder /app/dist ./dist

# Не запускать от root
RUN addgroup -g 1001 -S nodejs && adduser -S appuser -u 1001
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
