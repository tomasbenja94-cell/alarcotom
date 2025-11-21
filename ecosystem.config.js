// PM2 Configuration para VPS
// Ejecutar: pm2 start ecosystem.config.js
// Reiniciar: pm2 restart ecosystem.config.js
// Ver logs: pm2 logs
// Estado: pm2 status

module.exports = {
  apps: [
    {
      name: 'backend-elbuenmenu',
      script: './server/index.js',
      cwd: '/root/whatsappkevein', // Cambiar a tu ruta del proyecto
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 4000,
      exp_backoff_restart_delay: 100
    },
    {
      name: 'whatsapp-bot-elbuenmenu',
      script: './whatsapp-bot/src/bot.js',
      cwd: '/root/whatsappkevein', // Cambiar a tu ruta del proyecto
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/bot-error.log',
      out_file: './logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      // Reiniciar si el bot se desconecta
      min_uptime: '10s',
      max_restarts: 10
    }
  ]
};

