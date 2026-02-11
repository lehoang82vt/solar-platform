module.exports = {
  apps: [
    {
      name: 'solar-backend',
      cwd: '/var/www/solar/packages/backend',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      error_file: '/var/www/solar/logs/backend-error.log',
      out_file: '/var/www/solar/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'solar-frontend',
      cwd: '/var/www/solar/packages/frontend',
      script: 'npm',
      args: 'start -- -p 3001',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: '/var/www/solar/logs/frontend-error.log',
      out_file: '/var/www/solar/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
