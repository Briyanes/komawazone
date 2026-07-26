#!/usr/bin/env node
/**
 * local-import.mjs — Master Local Import CLI
 *
 * Jalankan import manga/chapter langsung dari MacBook.
 * Lebih powerful dari Vercel cron: no timeout, no memory limit,
 * full CPU/bandwidth laptop.
 *
 * Usage:
 *   npm run import:local -- manga    --url "https://04x-1s.manhwaland.land/manga/hana/"
 *   npm run import:local -- chapters --url "https://04x-1s.manhwaland.land/manga/hana/"
 *   npm run import:local -- full     --url "https://04x-1s.manhwaland.land/manga/hana/"
 *   npm run import:local -- batch    --file manga-list.txt
 *   npm run import:local -- sitemap  --url "https://04x-1s.manhwaland.land/sitemap_index.xml"
 *   npm run import:local -- auto-update
 *
 * Flags:
 *   --delay <ms>        Delay between requests (default: 2000)
 *   --concurrency <n>   Parallel downloads (default: 2, max: 5)
 *   --dry-run           Preview tanpa write ke DB/R2
 *   --rating <general|mature>  Content rating (default: general)
 *   --skip-images       Skip download/upload gambar (metadata only)
 *   --limit <n>         Batasi jumlah chapter yang diimport
 *   --proxy             Force gunakan proxy pool (Webshare)
 */

import {
  loadEnv, initSupabase, initR2, ProxyPool,
  fetchHtml, downloadImage, parseChapterImages,
  scrapeMangaMeta, scrapeChapterList,
  parseSitemapIndex, parseSitemapUrls,
  rewriteSourceUrl, DomainRotator, closeBrowser, ServerError, SERVER_ERROR_CODES,
  ProgressBar, sleep, sleepWithJitter, getDomainDelay, RateLimiter, slugify,
} from './lib/local-import-utils.mjs';

// ─── Parse CLI Args ──────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const opts = { mode };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const rawKey = arg.slice(2);
      // Normalize kebab-case → camelCase (e.g. dry-run → dryRun)
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        opts[key] = next;
        i++;
      } else {
        opts[key] = true;
      }
    }
  }

  // Defaults
  opts.delay = parseInt(opts.delay || '2000', 10);
  opts.concurrency = Math.min(parseInt(opts.concurrency || '2', 10), 5);
  opts.rating = opts.rating || 'general';

  return opts;
}

function printBanner(mode) {
  const modeLabels = {
    manga: '📦 Import Manga Metadata',
    chapters: '📖 Import Chapters + Images',
    full: '🚀 Full Import (Manga + Chapters + Images)',
    batch: '📦 Batch Import from File',
    sitemap: '🗺️  Sitemap Scan + Auto Import',
    'auto-update': '🔄 Auto-Update All Manga Chapters',
  };
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  ${modeLabels[mode] || mode}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

function printHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🖥️  Manga Zone — Local Import Tool                       ║
╚═══════════════════════════════════════════════════════════╝

USAGE:
  npm run import:local -- <mode> [options]

MODES:
  manga         Import metadata manga saja (title, cover, genres)
  chapters      Import chapters + download images untuk manga yang sudah ada
  full          Import lengkap: metadata + chapters + images (mode terlengkap)
  batch         Import massal dari file teks (satu URL per baris)
  sitemap       Scan sitemap XML sumber, import semua manga
  auto-update   Scan semua manga di DB dengan source_url, cek chapter baru

EXAMPLES:
  # Import satu manga (metadata + chapters + images)
  npm run import:local -- full --url "https://04x-1s.manhwaland.land/manga/hana/"

  # Cepat: hanya metadata manga
  npm run import:local -- manga --url "https://04x-1s.manhwaland.land/manga/hana/"

  # Tambah chapters untuk manga yang sudah ada (via --url atau --slug)
  npm run import:local -- chapters --url "https://04x-1s.manhwaland.land/manga/hana/"
  npm run import:local -- chapters --slug hana

  # Batch import dari file
  npm run import:local -- batch --file manga-list.txt

  # Scan sitemap & import semua
  npm run import:local -- sitemap --url "https://04x-1s.manhwaland.land/sitemap_index.xml"

  # Auto-update semua manga di database (cek chapter baru)
  npm run import:local -- auto-update

OPTIONS:
  --url <url>        Source URL (wajib untuk manga/chapters/full/sitemap)
  --slug <slug>      Manga slug di database (alternatif untuk chapters)
  --file <path>      Path file teks berisi daftar URL (untuk batch)
  --limit <n>        Batasi jumlah chapter yang diimport
  --delay <ms>       Delay antar request (default: 2000)
  --concurrency <n>  Parallel downloads (default: 2, max: 5)
  --dry-run          Preview tanpa write ke DB/R2
  --skip-images      Skip download gambar (metadata chapter saja)
  --proxy            Force gunakan proxy pool (Webshare rotating IPs)
  --rating <r>       Content rating: general|mature (default: general)
  --resume           Lanjut dari checkpoint terakhir (skip manga yang sudah sukses)
  --help             Tampilkan bantuan ini

TIPS:
  • Tidak ada timeout seperti Vercel cron — bisa import ratusan chapter
  • Untuk import semalam, gunakan tmux: tmux new -s import
  • Progress tersimpan ke DB, bisa dipantau di /admin/import
`);
}

// ─── Mode: manga ─────────────────────────────────────────────────

async function importManga(url, opts, ctx) {
  const finalUrl = rewriteSourceUrl(url);
  if (finalUrl !== url) {
    console.log(`� Domain rewrite: ${url} → ${finalUrl}`);
  }
  console.log(`�📄 Scraping: ${finalUrl}\n`);

  const { html } = await fetchHtml(finalUrl, ctx.proxyPool, { delayMs: opts.delay });
  const meta = scrapeMangaMeta(html, url); // keep original URL for DB storage

  if (!meta.title) {
    console.error('❌ Tidak bisa parse title dari halaman ini!');
    return { status: 'failed', error: 'No title found' };
  }

  console.log(`  📝 Title:   ${meta.title}`);
  console.log(`  🎨 Cover:   ${meta.cover_url ? '✅' : '❌'}`);
  console.log(`  📝 Desc:    ${meta.description ? meta.description.slice(0, 60) + '...' : '❌'}`);
  console.log(`  🏷️  Genres: ${meta.genres.join(', ') || 'none'}`);
  console.log(`  👤 Author: ${meta.author || '-'}`);
  console.log(`  📊 Status: ${meta.status}`);
  console.log(`  📦 Type:   ${meta.type}\n`);

  if (opts.dryRun) {
    console.log('🔍 DRY-RUN — tidak write ke DB');
    return { status: 'dry-run', meta };
  }

  // Check existing
  const slug = slugify(meta.title);
  const { data: existing } = await ctx.supabase
    .from('manga')
    .select('id, slug, title')
    .or(`slug.eq.${slug},source_url.eq.${url}`)
    .limit(1);

  let mangaId;

  if (existing && existing.length > 0) {
    // Update existing
    mangaId = existing[0].id;
    console.log(`  🔄 Updating existing manga (ID: ${mangaId})`);

    const updateData = {
      title: meta.title,
      description: meta.description || null,
      author: meta.author || null,
      artist: meta.artist || null,
      status: meta.status,
      type: meta.type,
      source_url: url,
      updated_at: new Date().toISOString(),
    };

    // Download cover if missing or external
    if (meta.cover_url) {
      const coverKey = `covers/${mangaId}.jpg`;
      if (await ctx.r2.exists(coverKey)) {
        console.log('  ⏭️  Cover sudah ada di R2');
      } else {
        console.log('  ⬇️  Downloading cover...');
        try {
          const { buffer, contentType } = await downloadImage(meta.cover_url, ctx.proxyPool, { delayMs: opts.delay });
          await ctx.r2.upload(buffer, contentType, coverKey);
          updateData.cover_url = `/api/r2/image/${coverKey}`;
          console.log('  ✅ Cover uploaded to R2');
        } catch (err) {
          console.warn(`  ⚠️  Cover download failed: ${err.message}`);
          updateData.cover_url = meta.cover_url;
        }
      }
    }

    await ctx.supabase.from('manga').update(updateData).eq('id', mangaId);
    console.log('  ✅ Manga updated');
  } else {
    // Insert new
    console.log(`  ➕ Creating new manga (slug: ${slug})`);

    const insertData = {
      slug,
      title: meta.title,
      description: meta.description || null,
      author: meta.author || null,
      artist: meta.artist || null,
      status: meta.status,
      type: meta.type,
      source_url: url,
      content_rating: opts.rating,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error } = await ctx.supabase
      .from('manga')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      console.error(`  ❌ DB error: ${error.message}`);
      return { status: 'failed', error: error.message };
    }

    mangaId = inserted.id;

    // Download cover
    if (meta.cover_url) {
      const coverKey = `covers/${mangaId}.jpg`;
      console.log('  ⬇️  Downloading cover...');
      try {
        const { buffer, contentType } = await downloadImage(meta.cover_url, ctx.proxyPool, { delayMs: opts.delay });
        await ctx.r2.upload(buffer, contentType, coverKey);
        await ctx.supabase.from('manga').update({ cover_url: `/api/r2/image/${coverKey}` }).eq('id', mangaId);
        console.log('  ✅ Cover uploaded to R2');
      } catch (err) {
        console.warn(`  ⚠️  Cover download failed: ${err.message}`);
        await ctx.supabase.from('manga').update({ cover_url: meta.cover_url }).eq('id', mangaId);
      }
    }

    // Add genres
    if (meta.genres.length > 0) {
      for (const genreName of meta.genres) {
        const genreSlug = slugify(genreName);
        // Upsert genre
        const { data: genre } = await ctx.supabase
          .from('genres')
          .upsert({ slug: genreSlug, name: genreName }, { onConflict: 'slug' })
          .select('id')
          .single();

        if (genre) {
          await ctx.supabase.from('manga_genres').upsert({
            manga_id: mangaId,
            genre_id: genre.id,
          }, { onConflict: 'manga_id,genre_id' });
        }
      }
      console.log(`  ✅ Added ${meta.genres.length} genres`);
    }

    console.log(`  ✅ Manga created (ID: ${mangaId})`);
  }

  return { status: 'success', mangaId, meta };
}

// ─── Mode: chapters ──────────────────────────────────────────────

async function importChapters(mangaSlug, opts, ctx) {
  // Find manga by slug
  const { data: manga, error } = await ctx.supabase
    .from('manga')
    .select('id, slug, title, source_url')
    .eq('slug', mangaSlug)
    .single();

  if (error || !manga) {
    console.error(`❌ Manga dengan slug "${mangaSlug}" tidak ditemukan!`);
    process.exit(1);
  }

  console.log(`📚 Manga: ${manga.title} (ID: ${manga.id})`);

  if (!manga.source_url) {
    console.error('❌ Manga tidak punya source_url — tidak bisa scrape chapters!');
    process.exit(1);
  }

  const sourceUrl = rewriteSourceUrl(manga.source_url);
  if (sourceUrl !== manga.source_url) {
    console.log(`� Domain rewrite: ${manga.source_url} → ${sourceUrl}`);
  }
  console.log(`🔗 Source: ${sourceUrl}\n`);

  // Scrape chapter list from manga page
  console.log('📖 Scraping chapter list...');
  const { html } = await fetchHtml(sourceUrl, ctx.proxyPool, { delayMs: opts.delay });
  const sourceChapters = scrapeChapterList(html);

  console.log(`   Found ${sourceChapters.length} chapters di source\n`);

  if (sourceChapters.length === 0) {
    console.error('❌ Tidak ada chapter ditemukan di halaman source!');
    return;
  }

  // Get existing chapters from DB (including thumbnail_url to check if images were downloaded)
  const { data: existingChapters } = await ctx.supabase
    .from('chapters')
    .select('id, number, source_url, thumbnail_url')
    .eq('manga_id', manga.id);

  const existingMap = new Map();
  if (existingChapters) {
    for (const ch of existingChapters) {
      const key = ch.number.toFixed(2);
      existingMap.set(key, ch);
    }
  }

  // Determine which chapters are new or need image download
  const toImport = [];
  for (const srcCh of sourceChapters) {
    const key = srcCh.number.toFixed(2);
    const existing = existingMap.get(key);
    if (!existing) {
      // New chapter — full import
      toImport.push({ ...srcCh, isNew: true });
    } else if (!existing.thumbnail_url) {
      // Exists but no thumbnail = images not downloaded yet — re-download
      toImport.push({ ...srcCh, isNew: false, chapterId: existing.id });
    }
    // else: chapter exists with images — skip
  }

  console.log(`   📊 New: ${toImport.filter(c => c.isNew).length} | Need images: ${toImport.filter(c => !c.isNew).length} | Skip: ${sourceChapters.length - toImport.length}\n`);

  // Apply --limit
  if (opts.limit) {
    const limit = parseInt(opts.limit, 10);
    console.log(`   🔢 Applying --limit ${limit} (from ${toImport.length} to ${Math.min(limit, toImport.length)})\n`);
    toImport.length = Math.min(limit, toImport.length);
  }

  if (toImport.length === 0) {
    console.log('✅ Semua chapter sudah ada! Tidak ada yang perlu diimport.');
    return;
  }

  if (opts.dryRun) {
    console.log('🔍 DRY-RUN — berikut chapter yang akan diimport:');
    for (const ch of toImport.slice(0, 20)) {
      console.log(`   ${ch.isNew ? '➕' : '🔄'} Ch ${ch.number} — ${ch.url}`);
    }
    if (toImport.length > 20) console.log(`   ... dan ${toImport.length - 20} lainnya`);
    return;
  }

  const progress = new ProgressBar(toImport.length, 'Chapters');
  const delayMs = opts.delay;

  // CDN-down detection: track consecutive chapters smart-skipped due to server errors
  let consecutiveCdnSkips = 0;
  const CDN_PAUSE_THRESHOLD = 3;       // Pause after 3 consecutive smart-skips
  const CDN_PAUSE_DURATION = 300_000;  // 5 minutes pause

  // Process chapters sequentially (to respect rate limits)
  for (const ch of toImport) {
    // Circuit breaker check
    if (ctx.rateLimiter?.isTripped()) {
      console.error('\n🚨 CIRCUIT BREAKER TRIPPED — terlalu banyak error berturut-turut!');
      console.error('   Hentikan import untuk keamanan. Coba lagi nanti atau gunakan --proxy.');
      break;
    }

    let chapterSmartSkipped = false; // Flag: was this chapter smart-skipped?

    try {
      await sleepWithJitter(delayMs);

      // Scrape chapter page for images
      const { html: chHtml } = await fetchHtml(ch.url, ctx.proxyPool, { delayMs });
      const imageUrls = parseChapterImages(chHtml);

      if (imageUrls.length === 0) {
        console.warn(`\n  ⚠️  Ch ${ch.number}: No images found — skipping`);
        progress.tick(false);
        continue;
      }

      let chapterId = ch.chapterId;

      // Insert chapter record if new
      if (ch.isNew) {
        const { data: newCh, error: chError } = await ctx.supabase
          .from('chapters')
          .insert({
            manga_id: manga.id,
            number: ch.number,
            title: ch.title || null,
            source_url: ch.url,
            release_date: ch.releaseDate,
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (chError) {
          console.warn(`\n  ⚠️  Ch ${ch.number}: DB error — ${chError.message}`);
          progress.tick(false);
          continue;
        }
        chapterId = newCh.id;
      }

      // Download & upload images
      if (!opts.skipImages) {
        const imgProgress = [];
        let consecutiveServerErrors = 0; // Track consecutive 5xx for smart-skip
        for (let i = 0; i < imageUrls.length; i++) {
          const imgUrl = imageUrls[i];
          const safeExt = (imgUrl.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
          const ext = ['jpg', 'jpeg', 'png', 'webp'].includes(safeExt) ? safeExt : 'jpg';
          const r2Key = `pages/${chapterId}/${i + 1}.${ext}`;

          // Skip if already in R2
          if (await ctx.r2.exists(r2Key)) {
            imgProgress.push({ page: i + 1, url: `/api/r2/image/${r2Key}`, status: 'skip' });
            continue;
          }

          try {
            const { buffer, contentType } = await downloadImage(imgUrl, ctx.proxyPool, { delayMs, timeoutMs: 30_000, refererUrl: ch.url });
            const r2Url = await ctx.r2.upload(buffer, contentType, r2Key);
            imgProgress.push({ page: i + 1, url: r2Url, status: 'ok' });
            consecutiveServerErrors = 0; // Reset on success
          } catch (imgErr) {
            // Smart-skip: if 5 consecutive CDN/server errors (522/503/502), skip rest of chapter
            if (imgErr.isServerError) {
              consecutiveServerErrors++;
              if (consecutiveServerErrors >= 5) {
                const remaining = imageUrls.length - i - 1;
                console.warn(`\n  🚨 Ch ${ch.number}: 5 consecutive server errors (HTTP ${imgErr.statusCode}) — SKIPPING remaining ${remaining} pages`);
                console.warn(`     Server CDN sedang down. Chapter akan ditandai partial, coba lagi nanti.`);
                // Mark remaining pages as failed (keep original URL)
                for (let j = i + 1; j < imageUrls.length; j++) {
                  imgProgress.push({ page: j + 1, url: imageUrls[j], status: 'fail' });
                }
                chapterSmartSkipped = true; // Flag for CDN-down auto-pause
                break;
              }
            }
            console.warn(`\n  ⚠️  Ch ${ch.number} page ${i + 1}: ${imgErr.message}`);
            // Fallback: keep original URL
            imgProgress.push({ page: i + 1, url: imgUrl, status: 'fail' });
          }

          // Domain-aware delay between images with jitter
          await sleepWithJitter(getDomainDelay(imgUrl, 800));
        }

        // Insert chapter_images
        const imageRows = imgProgress.map((img, idx) => ({
          chapter_id: chapterId,
          number: idx + 1,
          image_url: img.url,
        }));

        // Delete existing images first (if updating)
        if (!ch.isNew) {
          await ctx.supabase.from('chapter_images').delete().eq('chapter_id', chapterId);
        }

        // Batch insert
        for (let i = 0; i < imageRows.length; i += 100) {
          await ctx.supabase.from('chapter_images').insert(imageRows.slice(i, i + 100));
        }

        const okCount = imgProgress.filter(i => i.status === 'ok').length;
        const skipCount = imgProgress.filter(i => i.status === 'skip').length;
        const failCount = imgProgress.filter(i => i.status === 'fail').length;

        // Update thumbnail to 5th image (project convention)
        if (imgProgress.length >= 5) {
          const thumbUrl = imgProgress[4].url;
          await ctx.supabase.from('chapters').update({ thumbnail_url: thumbUrl }).eq('id', chapterId);
        } else if (imgProgress.length > 0) {
          const thumbUrl = imgProgress[0].url;
          await ctx.supabase.from('chapters').update({ thumbnail_url: thumbUrl }).eq('id', chapterId);
        }

        progress.tick(true);
        if (okCount > 0 || failCount > 0) {
          process.stdout.write(` — Ch ${ch.number}: ${okCount}✅ ${skipCount}⏭️ ${failCount}❌`);
        }
      } else {
        // Metadata only
        progress.tick(true);
        process.stdout.write(` — Ch ${ch.number}: metadata only`);
      }
    } catch (err) {
      console.warn(`\n  ❌ Ch ${ch.number}: ${err.message}`);
      progress.tick(false);
    }

    // ─── CDN-Down Auto-Pause ──────────────────────────────────────
    // If this chapter was smart-skipped (5 consecutive 5xx errors),
    // increment counter. After 3 consecutive smart-skips, the CDN is
    // clearly down — pause for 5 minutes to let it recover.
    if (chapterSmartSkipped) {
      consecutiveCdnSkips++;
      if (consecutiveCdnSkips >= CDN_PAUSE_THRESHOLD) {
        console.log(`\n\n⏸️  CDN DOWN DETECTED — ${consecutiveCdnSkips} chapters smart-skipped berturut-turut`);
        console.log(`   Pausing ${CDN_PAUSE_DURATION / 60_000} menit untuk recovery server...`);
        console.log(`   (Tekan Ctrl+C untuk batalkan, atau tunggu otomatis)`);
        await sleep(CDN_PAUSE_DURATION);
        console.log(`\n▶️  Resuming import setelah CDN pause...\n`);
        consecutiveCdnSkips = 0; // Reset after pause
      }
    } else {
      // Reset counter if a chapter succeeded (CDN is back up)
      consecutiveCdnSkips = 0;
    }
  }

  progress.done();

  // Update manga updated_at
  await ctx.supabase.from('manga').update({ updated_at: new Date().toISOString() }).eq('id', manga.id);
  console.log(`\n✅ Import chapters selesai untuk "${manga.title}"\n`);
}

// ─── Mode: full ──────────────────────────────────────────────────

async function importFull(url, opts, ctx) {
  console.log('━━━ Step 1/2: Import Manga Metadata ━━━\n');
  const mangaResult = await importManga(url, opts, ctx);

  if (mangaResult.status !== 'success') {
    console.error('\n❌ Manga import gagal, skip chapters');
    return;
  }

  // Get slug from result
  const { data: manga } = await ctx.supabase
    .from('manga')
    .select('slug')
    .eq('id', mangaResult.mangaId)
    .single();

  console.log('\n━━━ Step 2/2: Import Chapters + Images ━━━\n');
  await importChapters(manga.slug, opts, ctx);
}

// ─── Mode: batch ─────────────────────────────────────────────────

async function importBatch(filePath, opts, ctx) {
  const fs = await import('fs');
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File tidak ditemukan: ${filePath}`);
    process.exit(1);
  }

  const urls = fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  console.log(`📋 Found ${urls.length} URLs di file\n`);

  // Safety guard: warn if bulk >20 manga without proxy
  if (urls.length > 20 && !opts.proxy) {
    console.warn('⚠️  PERINGATAN: Bulk import >20 manga tanpa --proxy!');
    console.warn('   Risiko IP block meningkat. Disarankan gunakan --proxy.\n');
    console.log('   Melanjutkan dalam 5 detik... (Ctrl+C untuk batalkan)');
    await sleep(5000);
  }

  const progress = new ProgressBar(urls.length, 'Batch');

  for (const url of urls) {
    if (ctx.rateLimiter.isTripped()) {
      console.error('\n🚨 CIRCUIT BREAKER TRIPPED — bulk import dihentikan!');
      break;
    }
    try {
      console.log(`\n  ─── ${url} ───`);
      await importFull(url, { ...opts, dryRun: false }, ctx);
      ctx.rateLimiter.ok();
      progress.tick(true);
    } catch (err) {
      ctx.rateLimiter.err(0);
      console.error(`  ❌ Failed: ${err.message}`);
      progress.tick(false);
    }
    await sleepWithJitter(opts.delay * 2); // Jittered delay between manga
  }

  progress.done();
}

// ─── Mode: sitemap ───────────────────────────────────────────────

async function importSitemap(sitemapUrl, opts, ctx) {
  // Fetch sitemap index → get child sitemaps → get manga URLs
  let mangaUrls = [];

  if (sitemapUrl.includes('sitemap_index') || sitemapUrl.includes('sitemap.xml')) {
    const childSitemaps = await parseSitemapIndex(sitemapUrl, ctx.proxyPool);
    console.log('');

    for (const childUrl of childSitemaps) {
      const urls = await parseSitemapUrls(childUrl, ctx.proxyPool);
      mangaUrls = mangaUrls.concat(urls);
      console.log(`   📄 ${childUrl.split('/').pop()}: ${urls.length} manga URLs`);
      await sleep(opts.delay);
    }
  } else {
    // Direct sitemap URL
    mangaUrls = await parseSitemapUrls(sitemapUrl, ctx.proxyPool);
  }

  console.log(`\n📊 Total manga URLs found: ${mangaUrls.length}\n`);

  if (mangaUrls.length === 0) {
    console.log('❌ Tidak ada manga URL ditemukan di sitemap!');
    return;
  }

  if (opts.dryRun) {
    console.log('🔍 DRY-RUN — berikut 20 URL pertama:');
    for (const url of mangaUrls.slice(0, 20)) {
      console.log(`   ${url}`);
    }
    if (mangaUrls.length > 20) console.log(`   ... dan ${mangaUrls.length - 20} lainnya`);
    return;
  }

  const progress = new ProgressBar(mangaUrls.length, 'Sitemap Import');

  // Safety guard: warn if bulk >20 manga without proxy
  if (mangaUrls.length > 20 && !opts.proxy) {
    console.warn('⚠️  PERINGATAN: Sitemap import >20 manga tanpa --proxy!');
    console.warn('   Risiko IP block meningkat. Disarankan gunakan --proxy.\n');
    console.log('   Menglanjutkan dalam 5 detik... (Ctrl+C untuk batalkan)');
    await sleep(5000);
  }

  for (const url of mangaUrls) {
    if (ctx.rateLimiter.isTripped()) {
      console.error('\n🚨 CIRCUIT BREAKER TRIPPED — sitemap import dihentikan!');
      break;
    }
    try {
      await importManga(url, opts, ctx);
      ctx.rateLimiter.ok();
      progress.tick(true);
    } catch (err) {
      ctx.rateLimiter.err(0);
      console.error(`\n  ❌ ${url}: ${err.message}`);
      progress.tick(false);
    }
    await sleepWithJitter(opts.delay * 2); // Jittered delay between manga
  }

  progress.done();
}

// ─── Mode: auto-update ──────────────────────────────────────────

// Helper: format milliseconds to human-readable time
function formatDuration(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

// Helper: write progress to file for crash recovery
async function saveProgress(filepath, data) {
  const fs = await import('fs/promises');
  try {
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  } catch { /* silent fail — progress file is nice-to-have */ }
}

async function autoUpdate(opts, ctx) {
  console.log('🔍 Mencari manga dengan source_url yang belum di-soft-delete...\n');

  const { data: mangaList, error } = await ctx.supabase
    .from('manga')
    .select('id, slug, title, source_url')
    .not('source_url', 'is', null)
    .is('deleted_at', null)
    .order('updated_at', { ascending: true })
    .limit(opts.limit ? parseInt(opts.limit, 10) : 999999);

  if (error) {
    console.error('❌ Gagal query manga:', error.message);
    process.exit(1);
  }

  console.log(`📊 Ditemukan ${mangaList.length} manga dengan source_url\n`);

  if (mangaList.length === 0) {
    console.log('❌ Tidak ada manga yang punya source_url!');
    return;
  }

  // Stats tracking
  const stats = {
    total: mangaList.length,
    processed: 0,
    ok: 0,
    errors: 0,
    skipped: 0,
    newChapters: 0,
    updatedChapters: 0,
    startTime: Date.now(),
    processedSlugs: [],
  };
  const progressFile = '.import-progress.json';

  // ─── Resume support: skip manga that already succeeded in previous run ───
  const completedSlugs = new Set();
  if (opts.resume) {
    try {
      const fs = await import('fs/promises');
      const oldProgress = JSON.parse(await fs.readFile(progressFile, 'utf8'));
      if (oldProgress.processedSlugs) {
        for (const entry of oldProgress.processedSlugs) {
          if (entry.status === 'ok') completedSlugs.add(entry.slug);
        }
      }
      console.log(`📌 Resume mode: ${completedSlugs.size} manga sudah sukses sebelumnya — akan skip\n`);
    } catch {
      console.log('📌 Resume mode: tidak ada progress file — mulai fresh\n');
    }
  }

  for (let i = 0; i < mangaList.length; i++) {
    const manga = mangaList[i];
    const mangaNum = i + 1;
    const elapsedMs = Date.now() - stats.startTime;
    const avgPerManga = stats.processed > 0 ? elapsedMs / stats.processed : 0;
    const remaining = (mangaList.length - mangaNum) * avgPerManga;
    const pct = ((mangaNum / mangaList.length) * 100).toFixed(1);
    const etaStr = stats.processed > 0 ? formatDuration(remaining) : '—';

    // Header line: [1/1000] (0.1%) ETA: 2h 30m
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  📚 [${mangaNum}/${mangaList.length}] (${pct}%) ETA: ${etaStr}`);
    console.log(`     ${manga.title}`);
    console.log(`${'═'.repeat(60)}`);

    // Circuit breaker
    if (ctx.rateLimiter?.isTripped()) {
      console.error('\n🚨 CIRCUIT BREAKER TRIPPED — auto-update dihentikan!');
      break;
    }

    // Resume: skip manga that already succeeded in previous run
    if (completedSlugs.has(manga.slug)) {
      stats.skipped++;
      stats.processed++;
      process.stdout.write(`  ⏭️  Skip (already done)`);
      continue;
    }

    try {
      await importChapters(manga.slug, { ...opts, skipImages: opts.skipImages }, ctx);
      stats.ok++;
      stats.processedSlugs.push({ slug: manga.slug, status: 'ok' });
    } catch (err) {
      stats.errors++;
      console.error(`  ❌ [${manga.slug}]: ${err.message}`);
      stats.processedSlugs.push({ slug: manga.slug, status: 'error', error: err.message });
    }

    stats.processed++;

    // Save progress every 5 manga
    if (stats.processed % 5 === 0) {
      await saveProgress(progressFile, {
        ...stats,
        elapsedTime: formatDuration(Date.now() - stats.startTime),
        lastSlug: manga.slug,
        timestamp: new Date().toISOString(),
      });
    }

    await sleepWithJitter(opts.delay * 2);
  }

  // Final summary
  const totalTime = formatDuration(Date.now() - stats.startTime);
  console.log('\n' + '═'.repeat(60));
  console.log('  📊 AUTO-UPDATE SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  📦 Total manga:    ${stats.total}`);
  console.log(`  ✅ Success:        ${stats.ok}`);
  console.log(`  ❌ Errors:         ${stats.errors}`);
  console.log(`  ⏭️  No changes:     ${stats.skipped}`);
  console.log(`  ⏱️  Total time:     ${totalTime}`);
  if (stats.total > 0) {
    const avgTime = formatDuration((Date.now() - stats.startTime) / stats.total);
    console.log(`  📈 Avg per manga:  ${avgTime}`);
  }
  console.log('═'.repeat(60) + '\n');

  // Final save
  await saveProgress(progressFile, {
    ...stats,
    elapsedTime: totalTime,
    status: 'completed',
    timestamp: new Date().toISOString(),
  });
}

// ─── Main ────────────────────────────────────────────────────────

const VALID_MODES = ['manga', 'chapters', 'full', 'batch', 'sitemap', 'auto-update'];

async function main() {
  const opts = parseArgs();
  let caffeinateProc = null; // macOS sleep prevention (auto-started)

  // --help flag
  if (opts.mode === '--help' || opts.help === true || opts.mode === 'help') {
    printHelp();
    process.exit(0);
  }

  if (!opts.mode || !VALID_MODES.includes(opts.mode)) {
    console.error('❌ Mode tidak valid!');
    console.error('   Gunakan: manga, chapters, full, batch, sitemap, atau auto-update');
    console.error('   Contoh: npm run import:local -- full --url "https://..."');
    console.error('   Atau:   npm run import:local -- --help');
    process.exit(1);
  }

  printBanner(opts.mode);

  // Load env + init clients
  loadEnv();

  // ─── macOS Sleep Prevention: auto-start caffeinate ───────────────
  // MacBook sleep kills the import process. caffeinate prevents it.
  if (process.platform === 'darwin') {
    try {
      const { execSync } = await import('child_process');
      const { spawn } = await import('child_process');
      // Check if caffeinate is already running
      const running = execSync('pgrep -x caffeinate 2>/dev/null || true', { encoding: 'utf8' });
      if (running.trim()) {
        console.log('☕ caffeinate already running — MacBook tidak akan sleep');
      } else {
        caffeinateProc = spawn('caffeinate', ['-dimsu'], { stdio: 'ignore', detached: false });
        console.log('☕ caffeinate auto-started — MacBook tidak akan sleep selama import');
      }
    } catch {
      console.warn('⚠️  Tidak bisa start caffeinate — pastikan MacBook tidak sleep!');
      console.warn('   Tip: jalankan manual di terminal lain: caffeinate -dimsu &');
    }
  }

  // Apply --source-domain override if provided
  if (opts['source-domain']) {
    process.env.SOURCE_DOMAIN_OVERRIDE = opts['source-domain'];
    console.log(`🔀 Source domain override: ${opts['source-domain']}`);
  }

  const supabase = initSupabase();
  const r2 = initR2();
  const proxyPool = new ProxyPool(!!opts.proxy);
  proxyPool.init();
  const rateLimiter = new RateLimiter();

  // Init DomainRotator (best-effort: skip if migration 053 not applied yet)
  let domainRotator = null;
  try {
    domainRotator = new DomainRotator(supabase);
    await domainRotator.init();
  } catch (err) {
    console.warn(`⚠️  DomainRotator init failed (non-fatal): ${err.message}`);
    console.warn('   Pastikan migration 053_multi_source_architecture.sql sudah di-apply');
  }

  const ctx = { supabase, r2, proxyPool, rateLimiter, domainRotator };

  console.log(`⚙️  Config: delay=${opts.delay}ms, concurrency=${opts.concurrency}, dryRun=${!!opts.dryRun}, skipImages=${!!opts.skipImages}, proxy=${!!opts.proxy}, rating=${opts.rating}\n`);

  try {
    switch (opts.mode) {
      case 'manga':
        if (!opts.url) {
          console.error('❌ --url required! Contoh: npm run import:local -- manga --url "https://..."');
          process.exit(1);
        }
        await importManga(opts.url, opts, ctx);
        break;

      case 'chapters': {
        // Support --url (resolve slug from DB) or --slug directly
        let mangaSlug = opts.slug;

        if (!mangaSlug && opts.url) {
          // Try find manga by source_url
          const { data: manga } = await ctx.supabase
            .from('manga')
            .select('slug')
            .eq('source_url', opts.url)
            .single();

          if (manga) {
            mangaSlug = manga.slug;
          } else {
            console.error(`❌ Manga dengan URL "${opts.url}" tidak ditemukan di DB.`);
            console.error('   Gunakan mode "full" untuk import manga baru, atau perbaiki --slug');
            process.exit(1);
          }
        }

        if (!mangaSlug) {
          console.error('❌ --url atau --slug required!');
          console.error('   Contoh: npm run import:local -- chapters --url "https://..."');
          console.error('   Atau:   npm run import:local -- chapters --slug hana');
          process.exit(1);
        }
        await importChapters(mangaSlug, opts, ctx);
        break;
      }

      case 'full':
        if (!opts.url) {
          console.error('❌ --url required! Contoh: npm run import:local -- full --url "https://..."');
          process.exit(1);
        }
        await importFull(opts.url, opts, ctx);
        break;

      case 'batch':
        if (!opts.file) {
          console.error('❌ --file required! Contoh: npm run import:local -- batch --file manga-list.txt');
          process.exit(1);
        }
        await importBatch(opts.file, opts, ctx);
        break;

      case 'sitemap':
        if (!opts.url) {
          console.error('❌ --url required! Contoh: npm run import:local -- sitemap --url "https://.../sitemap_index.xml"');
          process.exit(1);
        }
        await importSitemap(opts.url, opts, ctx);
        break;

      case 'auto-update':
        await autoUpdate(opts, ctx);
        break;
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ SELESAI!');
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n💥 Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    // Always close browser if it was launched
    await closeBrowser();
    // Kill caffeinate if we started it (release sleep prevention)
    if (caffeinateProc) {
      caffeinateProc.kill();
      console.log('☕ caffeinate stopped');
    }
  }
}

main();
