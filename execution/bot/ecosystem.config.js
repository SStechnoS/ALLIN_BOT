const path = require('path')

module.exports = {
  apps: [
    {
      name: 'allin-bot',
      script: path.join(__dirname, 'dist/index.js'),
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_file: path.join(__dirname, '.env'),
      env: {
        NODE_ENV: 'production',
      },
      // Логи
      out_file: '/var/log/allin-bot/out.log',
      error_file: '/var/log/allin-bot/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
}
