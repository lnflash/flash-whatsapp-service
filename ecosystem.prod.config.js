module.exports = {
  apps: [
    {
      name: 'pulse-production',
      script: './dist/main.js',
      instances: 1, // Single instance for WhatsApp Web
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pulse-error.log',
      out_file: './logs/pulse-out.log',
      log_file: './logs/pulse-combined.log',
      time: true,
      
      // Restart settings
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      autorestart: true,
      
      // Memory management
      max_memory_restart: '1G',
      
      // Monitoring
      monitoring: true,
      
      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Node.js flags
      node_args: '--max-old-space-size=1024',
      
      // Environment specific settings
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};