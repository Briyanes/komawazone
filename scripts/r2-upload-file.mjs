#!/usr/bin/env node
/**
 * Upload satu file ke R2 — utilitas pendukung (mis. backup CSV dump).
 * Usage: node scripts/r2-upload-file.mjs <file> <r2-key> [contentType]
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

const [file, key, contentType] = process.argv.slice(2);
if (!file || !key) { console.error('Usage: node scripts/r2-upload-file.mjs <file> <r2-key> [contentType]'); process.exit(1); }

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const buf = fs.readFileSync(file);
await s3.send(new PutObjectCommand({
  Bucket: process.env.R2_BUCKET,
  Key: key,
  Body: buf,
  ContentType: contentType || 'application/octet-stream',
}));
console.log(`[r2-upload] ${file} (${(buf.length / 1024 / 1024).toFixed(1)} MB) → ${key}`);
