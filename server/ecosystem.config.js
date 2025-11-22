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
      max_memory_restart: '500M',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'whatsapp-bot',
      script: 'npm',
      args: 'start',
      cwd: '/opt/elbuenmenu/whatsapp-bot',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/root/.pm2/logs/bot-error.log',
      out_file: '/root/.pm2/logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M',
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};

