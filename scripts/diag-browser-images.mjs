/**
 * Diagnose image loading failures in real browser using Playwright.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const BASE = 'https://olluq.xyz';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Find chapter 1 of military base manga (free preview, no VIP)
  const { data: ch } = await sb
    .from('chapters')
    .select('id, number, manga_id, manga:manga!inner(slug, title, content_rating)')
    .eq('manga.slug', 'im-the-only-man-on-the-military-base')
    .order('number', { ascending: true })
    .limit(1)
    .single();

  const { count } = await sb.from('chapter_images').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id);
  console.log(`Chapter ${ch.number} — ${count} images, rating: ${ch.manga.content_rating}`);

  const chapterUrl = `${BASE}/manga/${ch.manga.slug}/chapter/${ch.id}`;
  console.log(`Testing: ${chapterUrl}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();

  const failedRequests = [];
  const allImageResponses = [];
  const consoleErrors = [];

  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('/api/r2/') || url.includes('/api/proxy/') || url.includes('_next/image')) {
      failedRequests.push({ url: url.substring(0, 150), failure: req.failure()?.errorText });
    }
  });

  page.on('response', (resp) => {
    const url = resp.url();
    // Track ALL image-related requests (R2 proxy, image optimizer, direct)
    if (url.includes('/api/r2/image/') || url.includes('/api/proxy/image') || url.includes('_next/image')) {
      const status = resp.status();
      const ct = resp.headers()['content-type'] || '';
      allImageResponses.push({
        status,
        ct: ct.substring(0, 30),
        url: url.substring(0, 120),
      });
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text().substring(0, 300));
    }
  });

  console.log('Navigating...');
  await page.goto(chapterUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log(`Final URL: ${page.url()}`);

  if (page.url().includes('/vip')) {
    console.log('⚠️  REDIRECTED TO VIP!');
  }

  // Scroll to trigger lazy load
  console.log('Scrolling to trigger lazy images...');
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(800);
  }

  console.log('Waiting 10s...');
  await page.waitForTimeout(10000);

  // DOM checks
  const errorElements = await page.locator('text=Gambar gagal dimuat').count();
  const imgTags = await page.locator('img').count();
  const imgNaturalSizes = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map(img => ({
      src: (img.src || '').substring(0, 80),
      naturalWidth: img.naturalWidth,
      complete: img.complete,
    })).filter(i => i.src.includes('r2') || i.src.includes('proxy'));
  });

  await page.screenshot({ path: 'screenshots/diag-chapter-images.png', fullPage: false });

  console.log('\n========= RESULTS =========');
  console.log(`Total img tags: ${imgTags}`);
  console.log(`Image network responses: ${allImageResponses.length}`);
  
  const ok = allImageResponses.filter(r => r.status === 200 && !r.ct.includes('svg')).length;
  const failed = allImageResponses.filter(r => r.status !== 200).length;
  const svg = allImageResponses.filter(r => r.ct.includes('svg')).length;
  console.log(`  200 OK (real image): ${ok}`);
  console.log(`  SVG placeholder: ${svg}`);
  console.log(`  Failed status: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed responses:');
    allImageResponses.filter(r => r.status !== 200).slice(0, 10).forEach(r => 
      console.log(`  ${r.status} ${r.ct}: ${r.url}`));
  }

  console.log(`\nDOM "Gambar gagal dimuat": ${errorElements}`);
  console.log(`\nImg naturalWidth (loaded?) — first 10:`);
  imgNaturalSizes.slice(0, 10).forEach(i => {
    console.log(`  ${i.naturalWidth > 0 ? '✅' : '❌'} ${i.naturalWidth}x | ${i.src}`);
  });

  if (failedRequests.length > 0) {
    console.log(`\nNetwork failures (${failedRequests.length}):`);
    failedRequests.slice(0, 10).forEach(r => console.log(`  ${r.failure}: ${r.url}`));
  }

  if (consoleErrors.length > 0) {
    console.log(`\nConsole errors (${consoleErrors.length}):`);
    [...new Set(consoleErrors)].slice(0, 10).forEach(e => console.log(`  ${e}`));
  }

  await browser.close();
}

main().catch(console.error);