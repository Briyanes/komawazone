import https from 'https';

const CHAPTER_ID = 'f1249f5d-e378-40f6-94dc-7d8c30dee4d3';
const TOTAL_IMAGES = 236;
const BASE = `https://olluq.xyz/api/r2/image/chapters/${CHAPTER_ID}`;

function fetchHead(url) {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        chunks.push(chunk);
        if (size > 500) req.destroy(); // Only need first bytes
      });
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, size, buf, contentType: res.headers['content-type'] });
      });
      res.on('error', () => resolve({ status: 0, size: 0, buf: Buffer.alloc(0), contentType: '' }));
    });
    req.on('error', () => resolve({ status: 0, size: 0, buf: Buffer.alloc(0), contentType: '' }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, size: 0, buf: Buffer.alloc(0), contentType: '' }); });
  });
}

function detectType(buf) {
  if (buf.length < 4) return 'unknown';
  // WebP: RIFF....WEBP
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('ascii') === 'PNG') return 'png';
  // GIF: 47 49 46
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'gif';
  // HTML (error page)
  if (buf.slice(0, 1).toString('ascii') === '<') return 'html';
  return 'unknown';
}

(async () => {
  console.log(`🔍 Auditing ${TOTAL_IMAGES} images for chapter ${CHAPTER_ID}\n`);

  const results = [];
  const categories = { valid: [], tiny: [], broken: [], missing: [] };

  for (let i = 1; i <= TOTAL_IMAGES; i++) {
    const url = `${BASE}/${i}.jpg`;
    const res = await fetchHead(url);
    const type = detectType(res.buf);
    const isTiny = res.size < 1000;
    const isPlaceholder = type === 'png' && res.size < 200; // 1x1 PNG is ~68 bytes

    let category;
    if (res.status !== 200) category = 'missing';
    else if (isPlaceholder) category = 'broken';
    else if (isTiny) category = 'tiny';
    else category = 'valid';

    results.push({ i, status: res.status, size: res.size, type, category });
    categories[category].push(i);

    const status = category === 'valid' ? '✅' : category === 'tiny' ? '⚠️' : '❌';
    process.stdout.write(`${status} ${i}.jpg: ${res.status} ${res.size}b ${type} [${category}]\n`);
  }

  console.log('\n════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('════════════════════════════════════════');
  console.log(`✅ Valid images:   ${categories.valid.length}`);
  console.log(`⚠️ Tiny (<1KB):    ${categories.tiny.length}`);
  console.log(`❌ Broken (1x1):   ${categories.broken.length}`);
  console.log(`❌ Missing (404):  ${categories.missing.length}`);
  console.log('════════════════════════════════════════');

  if (categories.broken.length > 0) {
    console.log(`\n❌ BROKEN IMAGES (1x1 PNG placeholders): ${categories.broken.length}`);
    // Show ranges
    let start = categories.broken[0];
    let prev = start;
    const ranges = [];
    for (let j = 1; j < categories.broken.length; j++) {
      if (categories.broken[j] !== prev + 1) {
        ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = categories.broken[j];
      }
      prev = categories.broken[j];
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    console.log(`   Ranges: ${ranges.join(', ')}`);
  }

  if (categories.tiny.length > 0) {
    console.log(`\n⚠️ TINY IMAGES (<1KB, possibly corrupted): ${categories.tiny.length}`);
    categories.tiny.forEach(i => {
      const r = results.find(x => x.i === i);
      console.log(`   ${i}.jpg: ${r.size}b (${r.type})`);
    });
  }
})();