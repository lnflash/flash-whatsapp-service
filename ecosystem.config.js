module.exports = {
  apps: [{
    name: 'flash-whatsapp-dev',
    script: 'npm',
    args: 'run start:dev',
    watch: ['src'],
    ignore_watch: ['node_modules', 'dist', '.git', '*.log', 'session-*'],
    watch_delay: 1000,
    restart_delay: 3000,
    env: {
      NODE_ENV: 'development',
    },
    max_restarts: 10,
    min_uptime: '10s',
    // Kill and restart instead of reload for WhatsApp Web.js
    kill_timeout: 5000,
    listen_timeout: 10000,
    // Cleanup on restart
    shutdown_with_message: true,
    wait_ready: true,
    max_memory_restart: '500M',
  }]
};