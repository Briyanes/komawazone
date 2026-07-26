/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🖥️ PM2 Ecosystem Config — VPS Edition (Manga Zone Import Worker)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PERBEDAAN DENGAN VERSI MACBOOK:
 *   - 3 workers (ada image-downloader tambahan)
 *   - Tanpa caffeinate (VPS tidak sleep)
 *   - Memory threshold auto-restart (hemat RAM)
 *   - Log rotation bawaan (hemat disk VPS)
 *   - max_memory_restart untuk mencegah OOM
 *
 * Cara pakai di VPS:
 *   pm2 start ecosystem.vps.config.cjs
 *   pm2 status
 *   pm2 logs
 *   pm2 monit
 *
 * Auto-restart on reboot:
 *   pm2 startup systemd    # ikuti instruksi output
 *   pm2 save
 * ═══════════════════════════════════════════════════════════════════════════
 */

module.exports = {
  apps: [
    // ─────────────────────────────────────────────────────────────────────
    // Worker 1: Sitemap Watcher
    // Scan sitemap source setiap 10 menit untuk deteksi manga/chapter baru
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'vps-sitemap-watcher',
      script: 'scripts/local-sitemap-watcher.mjs',
      cwd: __dirname,
      interpreter: 'node',
      args: '--watch --interval=10',
      watch: false,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 30_000,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        VPS_MODE: 'true',
      },
      out_file: './logs/pm2-sitemap.out.log',
      error_file: './logs/pm2-sitemap.err.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ─────────────────────────────────────────────────────────────────────
    // Worker 2: Chapter Checker (Metadata Only)
    // Cek & import chapter baru setiap 2 jam — fast metadata-only scan
    // Tidak download images (Worker 3 yang handle itu)
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'vps-chapter-checker',
      script: 'scripts/local-import.mjs',
      cwd: __dirname,
      interpreter: 'node',
      args: 'auto-update --skip-images',
      watch: false,
      autorestart: true,
      cron_restart: '0 */2 * * *', // setiap 2 jam
      max_restarts: 20,
      restart_delay: 60_000,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        VPS_MODE: 'true',
      },
      out_file: './logs/pm2-chapters.out.log',
      error_file: './logs/pm2-chapters.err.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ─────────────────────────────────────────────────────────────────────
    // Worker 3: Image Downloader (VPS ONLY)
    // Full auto-update WITH image download setiap 6 jam.
    // auto-update otomatis detect chapter dengan thumbnail null → re-download.
    // --limit 100 agar tidak OOM di VPS 2GB.
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'vps-image-downloader',
      script: 'scripts/local-import.mjs',
      cwd: __dirname,
      interpreter: 'node',
      args: 'auto-update --limit 100',
      watch: false,
      autorestart: true,
      cron_restart: '0 */6 * * *', // setiap 6 jam
      max_restarts: 10,
      restart_delay: 120_000,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        VPS_MODE: 'true',
      },
      out_file: './logs/pm2-images.out.log',
      error_file: './logs/pm2-images.err.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};