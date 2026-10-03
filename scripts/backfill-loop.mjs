#!/usr/bin/env node
/**
 * backfill-loop.mjs — jalankan image-backfill.mjs berulang sampai backlog habis.
 *
 * Worker tunggal default-nya sangat kecil (LIMIT=5 chapter/run, dirancang
 * hemat untuk cron). Saat gelombang import besar menumpuk backlog ribuan
 * chapter, jalankan loop ini dari mesin lokal:
 *
 *   npm run backfill:loop
 *   LIMIT=50 MANGA_SLUG=some-slug npm run backfill:loop   # terarah
 *   MAX_ITER=200 SLEEP_MS=60000 npm run backfill:loop     # rapuh/santai
 *
 * Berhenti otomatis bila: backlog 0, worker exit non-zero, atau MAX_ITER habis.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_ITER = Number(process.env.MAX_ITER || 50);
const SLEEP_MS = Number(process.env.SLEEP_MS || 30_000);

// Muat .env.local (sama seperti loadEnv di image-backfill.mjs)
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
}

const REST_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const REST_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function backlogCount() {
  const r = await fetch(
    `${REST_BASE}/chapters?select=id&deleted_at=is.null&thumbnail_url=is.null&limit=1`,
    { headers: { apikey: REST_KEY, Authorization: `Bearer ${REST_KEY}`, Prefer: 'count=exact' } },
  );
  const cr = r.headers.get('content-range') || '?/';
  return Number(cr.split('/')[1]);
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

let iter = 0;
while (iter < MAX_ITER) {
  iter++;
  const before = await backlogCount().catch(() => NaN);
  console.log(`\n━━━ iterasi ${iter}/${MAX_ITER} — backlog ${isNaN(before) ? '?' : before} chapter ━━━`);

  const code = await new Promise((resolve) => {
    const p = spawn('node', ['scripts/image-backfill.mjs'], { stdio: 'inherit' });
    p.on('exit', resolve);
  });
  if (code !== 0) {
    console.log(`[loop] worker exit ${code} — berhenti (cek log di atas)`);
    break;
  }

  const after = await backlogCount().catch(() => NaN);
  console.log(`[loop] backlog: ${isNaN(before) ? '?' : before} → ${isNaN(after) ? '?' : after}`);
  if (after === 0) {
    console.log('[loop] backlog habis 🎉');
    break;
  }
  if (!isNaN(before) && !isNaN(after) && after >= before) {
    console.log('[loop] backlog tidak berkurang — kemungkinan sumber bermasalah, berhenti agar tidak loop sia-sia');
    break;
  }
  await sleep(SLEEP_MS);
}
console.log(`[loop] selesai setelah ${iter} iterasi.`);
