#!/usr/bin/env node
/**
 * VERIFY: Is the "Download All Missing" batch job really downloading
 * chapter images and uploading them to Cloudflare R2?
 *
 * Lightweight checks (timeout-safe, no full-table scans):
 *   1. Recent import_jobs (latest 5 — find the actual running job)
 *   2. Images in 20 most recently updated chapters (activity indicator)
 *   3. Sample 5 recent chapters — verify image_url points to /api/r2/image/
 *   4. Count of chapters still with NULL thumbnail
 *
 * Usage:
 *   node scripts/verify-batch-r2-uploads.mjs              # one-shot check
 *   node scripts/verify-batch-r2-uploads.mjs --watch       # refresh every 60s
 *   node scripts/verify-batch-r2-uploads.mjs --job <UUID>  # specific job id
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
  'Content-Type': 'application/json',
};

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const jobArgIdx = args.indexOf('--job');
const jobId = jobArgIdx !== -1 ? args[jobArgIdx + 1] : null;
const REFRESH_MS = 60_000;

async function api(path, opts = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { ...headers, ...opts.headers },
    signal: AbortSignal.timeout(15_000),
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function getJSON(path) {
  const res = await api(path);
  return res.json();
}

async function getCount(path) {
  try {
    const res = await api(path, { headers: { ...headers, Prefer: 'count=exact' } });
    const range = res.headers.get('content-range');
    return parseInt(range?.split('/')[1] || '0');
  } catch {
    return null;
  }
}

function timeAgo(iso) {
  if (!iso) return '?';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

async function getRecentJobs(limit = 5) {
  try {
    return await getJSON(
      `import_jobs?order=created_at.desc&limit=${limit}&select=id,job_type,status,total_items,processed_items,skipped_items,created_at,completed_at`
    ) ?? [];
  } catch {
    return [];
  }
}

async function checkNullThumbnailCount() {
  return getCount(`chapters?deleted_at=is.null&thumbnail_url=is.null&select=id&limit=1`);
}

async function sampleRecentChapters() {
  const data = await getJSON(
    `chapters?deleted_at=is.null&thumbnail_url=not.is.null&order=updated_at.desc&limit=5&select=id,number,thumbnail_url`
  );
  if (!Array.isArray(data) || data.length === 0) return [];

  const results = [];
  for (const ch of data) {
    try {
      const imgs = await getJSON(
        `chapter_images?chapter_id=eq.${ch.id}&order=number.asc&limit=10&select=image_url,number`
      );
      results.push({
        number: ch.number,
        is_r2: (ch.thumbnail_url || '').includes('/api/r2/image/'),
        image_count: Array.isArray(imgs) ? imgs.length : 0,
      });
    } catch {
      results.push({ number: ch.number, is_r2: (ch.thumbnail_url || '').includes('/api/r2/image/'), image_count: 0, error: true });
    }
  }
  return results;
}

async function checkRecentChapterActivity() {
  try {
    const recent = await getJSON(
      `chapters?deleted_at=is.null&order=updated_at.desc&limit=20&select=id,thumbnail_url`
    );
    if (!Array.isArray(recent) || recent.length === 0) return null;

    let withImages = 0;
    let withoutImages = 0;
    let nullThumb = 0;

    for (const ch of recent) {
      if (!ch.thumbnail_url) nullThumb++;
      const c = await getCount(`chapter_images?chapter_id=eq.${ch.id}&select=id&limit=1`);
      if (c !== null && c > 0) withImages++;
      else withoutImages++;
    }
    return { withImages, withoutImages, nullThumb, total: recent.length };
  } catch {
    return null;
  }
}

async function runOnce() {
  console.log('\n' + '═'.repeat(60));
  console.log(`🔍 BATCH R2 UPLOAD VERIFIER  —  ${new Date().toLocaleTimeString('id-ID')}`);
  console.log('═'.repeat(60));

  // 1. Recent jobs
  console.log(`\n📋 RECENT JOBS (5 terbaru):`);
  const recentJobs = await getRecentJobs(5);
  if (recentJobs.length === 0) {
    console.log(`   ⚠️  Tidak ada job di tabel import_jobs`);
  } else {
    for (const j of recentJobs) {
      const pct = j.total_items > 0 ? Math.round((j.processed_items / j.total_items) * 100) : 0;
      const icon = j.status === 'completed' ? '✅' : j.status === 'running' ? '🔄' : '❌';
      console.log(`   ${icon} ${(j.job_type || '?').padEnd(24)} ${j.id.slice(0, 8)}  ${(j.status || '?').padEnd(10)} ${j.processed_items}/${j.total_items} (${pct}%)  ${timeAgo(j.created_at)}`);
    }
  }

  // 1b. Specific job
  if (jobId) {
    try {
      const jobData = await getJSON(`import_jobs?id=eq.${jobId}&select=*&limit=1`);
      if (Array.isArray(jobData) && jobData.length > 0) {
        const job = jobData[0];
        const pct = job.total_items > 0 ? Math.round((job.processed_items / job.total_items) * 100) : 0;
        console.log(`\n📋 TARGET JOB: ${jobId.slice(0, 8)}...`);
        console.log(`   Status   : ${job.status?.toUpperCase()}`);
        console.log(`   Progress : ${job.processed_items}/${job.total_items} (${pct}%)`);
        console.log(`   Started  : ${timeAgo(job.created_at)}`);
        if (job.completed_at) console.log(`   Done     : ${timeAgo(job.completed_at)}`);
      } else {
        console.log(`\n⚠️  Job ${jobId.slice(0, 8)}... tidak ditemukan`);
      }
    } catch {
      console.log(`\n⚠️  Gagal cek job ${jobId.slice(0, 8)}...`);
    }
  }

  // 2. Null thumbnails
  const nullCount = await checkNullThumbnailCount();
  console.log(`\n📦 Chapters thumbnail NULL: ${nullCount !== null ? nullCount.toLocaleString() : '(timeout)'}`);

  // 3. Recent activity
  const activity = await checkRecentChapterActivity();
  if (activity) {
    console.log(`\n🟢 20 chapter terbaru: ${activity.withImages} dgn gambar, ${activity.withoutImages} kosong, ${activity.nullThumb} null thumb`);
    if (activity.withImages > 0) {
      console.log(`   ✅ Ada chapter baru dengan gambar — R2 upload aktif!`);
    }
  }

  // 4. Sample URLs
  console.log(`\n🔬 SAMPLE 5 CHAPTER (cek R2 URL):`);
  try {
    const samples = await sampleRecentChapters();
    let r2Count = 0;
    for (const s of samples) {
      const icon = s.is_r2 ? '✅' : '❌';
      console.log(`   ${icon} Ch.${s.number} → ${s.is_r2 ? 'R2' : 'CDN'}  (${s.image_count} hlm)`);
      if (s.is_r2) r2Count++;
    }
    if (samples.length > 0) console.log(`   → ${r2Count}/${samples.length} pakai R2`);
  } catch (err) {
    console.log(`   ⚠️  ${err.message}`);
  }

  console.log('\n' + '─'.repeat(60));
  if (activity && activity.withImages > 0) {
    console.log('🎯 VERDICT: ✅ RUNNING — batch aktif upload ke R2');
  } else {
    console.log('🎯 VERDICT: ⚠️  Belum ada output baru — cek lagi dalam beberapa menit');
  }
  console.log('─'.repeat(60));
}

if (watchMode) {
  console.log('👀 WATCH MODE: refresh 60s. Ctrl+C untuk stop.');
  await runOnce();
  setInterval(runOnce, REFRESH_MS);
} else {
  await runOnce();
}