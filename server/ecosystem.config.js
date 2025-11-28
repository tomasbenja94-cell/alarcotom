export default {
  apps: [
    {
      name: 'backend',
      script: 'npm',
      args: 'start',
      cwd: '/opt/elbuenmenu/server',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/root/.pm2/logs/backend-error.log',
      out_file: '/root/.pm2/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      instances: 1,
      exec_mode: 'fork',
      // Reiniciar automáticamente si se cae
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    }
    // El bot de WhatsApp ahora se ejecuta dentro del backend (whatsapp-multi.service.js)
    // No necesita un proceso PM2 separado
  ]
};

