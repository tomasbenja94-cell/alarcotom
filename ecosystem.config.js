// PM2 Configuration para VPS
// Ejecutar: pm2 start ecosystem.config.js
// Reiniciar: pm2 restart ecosystem.config.js
// Ver logs: pm2 logs
// Estado: pm2 status

// PM2 Configuration para VPS - Optimizado para 24/7 y ~50 pedidos diarios
// Ejecutar: pm2 start ecosystem.config.js
// Reiniciar: pm2 restart ecosystem.config.js
// Ver logs: pm2 logs
// Estado: pm2 status
// Guardar configuración: pm2 save
// Configurar auto-start: pm2 startup

module.exports = {
  apps: [
    {
      name: 'backend-elbuenmenu',
      script: './server/index.js',
      cwd: '/opt/elbuenmenu', // Ajustar a tu ruta del proyecto
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
      max_memory_restart: '1G', // Aumentado para manejar más carga
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      min_uptime: '10s',
      max_restarts: 15, // Permitir más reinicios antes de parar
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: 'whatsapp-bot-elbuenmenu',
      script: './whatsapp-bot/src/bot.js',
      cwd: '/opt/elbuenmenu', // Ajustar a tu ruta del proyecto
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
      restart_delay: 10000, // Delay más largo para el bot (necesita tiempo para reconectar)
      exp_backoff_restart_delay: 200,
      // Reiniciar si el bot se desconecta - optimizado para 24/7
      min_uptime: '30s', // Esperar 30s antes de considerar que está estable
      max_restarts: 20, // Permitir más reinicios (reconexiones automáticas)
      kill_timeout: 10000, // Dar más tiempo al bot para cerrar conexiones
      wait_ready: false // El bot no emite 'ready' event
    }
  ]
};

