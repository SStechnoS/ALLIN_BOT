#!/bin/bash
# All In Academy Bot — Первичная настройка VPS (Ubuntu 22.04)
# Запускать как root: bash setup.sh

set -e

echo "=== All In Academy Bot Setup ==="

# 1. Обновление системы
apt-get update && apt-get upgrade -y

# 2. Установка Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 3. Установка Docker Compose plugin
apt-get install -y docker-compose-plugin

# 4. Установка утилит
apt-get install -y nginx certbot python3-certbot-nginx ufw git

# 5. Настройка Firewall
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

# 6. Создание пользователя для запуска бота
useradd -m -s /bin/bash allinbot || true
usermod -aG docker allinbot

echo ""
echo "=== Следующие шаги ==="
echo "1. Склонировать репозиторий"
echo "2. Скопировать .env.example в .env и заполнить"
echo "3. Получить SSL сертификат:"
echo "   docker compose --profile certbot run certbot certonly --webroot -w /var/www/certbot -d YOUR_DOMAIN"
echo "4. Запустить:"
echo "   docker compose up -d"
echo ""
echo "Setup complete!"
