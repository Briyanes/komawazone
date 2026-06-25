/**
 * Quick production image health check
 * Scans homepage, manga detail, and chapter reader for broken images
 */

const HOMEPAGE = 'https://olluq.xyz/';

async function fetchUrls(url) {
  const res = await fetch(url);
  const html = await res.text();
  const urls = [...html.matchAll(/api\/r2\/image\/[^"\\]+/g)].map((m) => m[0].replace(/\\$/, ''));
  return [...new Set(urls)];
}

async function checkUrl(path) {
  try {
    const res = await fetch(`https://olluq.xyz/${path}`, { method: 'HEAD' });
    return { status: res.status, ok: res.ok };
  } catch {
    return { status: 0, ok: false };
  }
}

async function main() {
  console.log('=== PRODUCTION IMAGE HEALTH CHECK ===\n');

  // 1. Homepage covers
  console.log('📡 Fetching homepage...');
  const homeUrls = await fetchUrls(HOMEPAGE);
  console.log(`   Found ${homeUrls.length} unique image URLs on homepage`);

  // Check all homepage images in parallel
  const results = await Promise.all(homeUrls.map(async (url) => ({ url, ...(await checkUrl(url)) })));
  const broken = results.filter((r) => !r.ok);
  console.log(`   ✅ Working: ${results.length - broken.length}`);
  console.log(`   ❌ Broken:  ${broken.length}`);
  if (broken.length > 0) {
    broken.forEach((r) => console.log(`      ${r.status}  ${r.url}`));
  }

  // 2. Check a manga detail page
  console.log('\n📡 Fetching manga detail page...');
  const mangaUrls = await fetchUrls('https://olluq.xyz/manga/glorious-homecoming-naru');
  console.log(`   Found ${mangaUrls.length} unique image URLs`);

  const mangaResults = await Promise.all(mangaUrls.slice(0, 20).map(async (url) => ({ url, ...(await checkUrl(url)) })));
  const mangaBroken = mangaResults.filter((r) => !r.ok);
  console.log(`   ✅ Working: ${mangaResults.length - mangaBroken.length} (of ${mangaResults.length} checked)`);
  console.log(`   ❌ Broken:  ${mangaBroken.length}`);
  if (mangaBroken.length > 0) {
    mangaBroken.forEach((r) => console.log(`      ${r.status}  ${r.url}`));
  }

  // 3. Check chapter reader
  console.log('\n📡 Fetching chapter reader...');
  const chapterUrls = await fetchUrls('https://olluq.xyz/manga/glorious-homecoming-naru/chapter/1043192e-66fa-4a3a-9a73-0f9290646019');
  console.log(`   Found ${chapterUrls.length} chapter image URLs`);

  const chResults = await Promise.all(chapterUrls.map(async (url) => {
    const res = await fetch(`https://olluq.xyz/${url}`);
    return { url, status: res.status, size: res.headers.get('content-length') };
  }));
  const chBroken = chResults.filter((r) => r.status !== 200);
  console.log(`   ✅ Working: ${chResults.length - chBroken.length}`);
  console.log(`   ❌ Broken:  ${chBroken.length}`);
  if (chBroken.length > 0) {
    chBroken.forEach((r) => console.log(`      ${r.status}  ${r.url}`));
  }

  // 4. Check if any external (non-R2) URLs exist
  console.log('\n📡 Checking for external CDN URLs...');
  const homeHtml = await (await fetch(HOMEPAGE)).text();
  const externalUrls = [...homeHtml.matchAll(/src="(https?:\/\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !u.includes('olluq.xyz'));
  console.log(`   External image URLs on homepage: ${externalUrls.length}`);
  if (externalUrls.length > 0) {
    externalUrls.slice(0, 10).forEach((u) => console.log(`      ${u}`));
  }

  // 5. Check multiple manga pages for broken covers
  console.log('\n📡 Checking multiple manga pages...');
  const mangaApi = await (await fetch('https://olluq.xyz/api/v1/manga?page=1&limit=20')).json();
  const slugs = mangaApi.data.map((m) => m.slug);

  let totalBrokenCovers = 0;
  for (const slug of slugs.slice(0, 5)) {
    const coverUrl = mangaApi.data.find((m) => m.slug === slug)?.cover_url;
    if (coverUrl) {
      const r = await checkUrl(coverUrl.replace(/^\//, ''));
      if (!r.ok) {
        console.log(`   ❌ ${slug}: ${coverUrl} → ${r.status}`);
        totalBrokenCovers++;
      }
    }
  }
  if (totalBrokenCovers === 0) {
    console.log('   ✅ All checked covers OK');
  }

  console.log('\n=== SUMMARY ===');
  const totalBroken = broken.length + mangaBroken.length + chBroken.length + totalBrokenCovers;
  if (totalBroken === 0) {
    console.log('🎉 ALL IMAGES WORKING! No broken images found.');
  } else {
    console.log(`⚠️  Total broken: ${totalBroken}`);
  }
}

main().catch(console.error);