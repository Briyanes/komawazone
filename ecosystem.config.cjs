/**
 * PM2 Ecosystem Config — Manga Zone Local Import Runner
 *
 * Jalankan di MacBook / VPS:
 *   pm2 start ecosystem.config.cjs
 *   pm2 status
 *   pm2 logs manga-zone-importer
 *   pm2 stop all && pm2 delete all
 *
 * Auto-restart on crash, auto-resume on reboot:
 *   pm2 startup        # ikuti instruksi output
 *   pm2 save
 */

module.exports = {
  apps: [
    {
      name: 'manga-zone-sitemap-watcher',
      script: 'scripts/local-sitemap-watcher.mjs',
      cwd: __dirname,
      interpreter: 'node',
      args: '--watch --interval=10',
      watch: false,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 30_000,
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/pm2-sitemap.out.log',
      error_file: './logs/pm2-sitemap.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'manga-zone-chapter-checker',
      script: 'scripts/local-import.mjs',
      cwd: __dirname,
      interpreter: 'node',
      args: 'auto-update --skip-images',
      watch: false,
      autorestart: true,
      cron_restart: '0 */2 * * *', // setiap 2 jam
      max_restarts: 20,
      restart_delay: 60_000,
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/pm2-chapters.out.log',
      error_file: './logs/pm2-chapters.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};