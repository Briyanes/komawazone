#!/usr/bin/env node
/**
 * Fix manifest R2 yang mengandung double-slash (cdn.olluq.xyz//pages/...) —
 * warisan migrasi path proxy /api/r2/image/pages/... yang membuat gambar
 * 404 di CDN. Idempotent: hanya rewrite manifest yang terdampak.
 *
 * Usage: node scripts/fix-manifest-double-slash.mjs [--dry-run]
 */
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const envLocal = path.resolve(__dirname, '..', '.env.local');
  if (fs.existsSync(envLocal)) {
    for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}
loadEnv();

const DRY = process.argv.includes('--dry-run');
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const BUCKET = process.env.R2_BUCKET;

// Daftar semua key manifest
const keys = [];
let token;
do {
  const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'manifests/ch/', ContinuationToken: token, MaxKeys: 1000 }));
  for (const o of r.Contents ?? []) keys.push(o.Key);
  token = r.IsTruncated ? r.NextContinuationToken : undefined;
} while (token);
console.log(`[fix] ${keys.length} manifest discan`);

let checked = 0; let fixed = 0;
const CONC = 25;
let idx = 0;
const worker = async () => {
  while (true) {
    const key = keys[idx++];
    if (!key) return;
    checked++;
    try {
      const g = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const body = await g.Body.transformToString('utf-8');
      if (!/olluq\.xyz\/{2,}/.test(body)) return;
      const clean = body.replace(/olluq\.xyz\/{2,}/g, 'olluq.xyz/');
      if (!DRY) {
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET, Key: key, Body: clean,
          ContentType: 'application/json', CacheControl: 'public, max-age=300',
        }));
      }
      fixed++;
      if (fixed % 500 === 0) console.log(`[fix] ...${fixed} diperbaiki (${checked}/${keys.length})`);
    } catch (e) {
      console.error(`[fix] ✗ ${key}: ${e.message}`);
    }
  }
};
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`[fix] ${DRY ? 'DRY-RUN ' : ''}selesai: ${fixed}/${keys.length} manifest double-slash diperbaiki`);
