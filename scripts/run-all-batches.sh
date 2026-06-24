#!/bin/bash
# Auto-loop backfill semua dead images sampai selesai
# Fixed: Uses check-dead-count.mjs (ESM module) instead of buggy inline node -e
# Setiap batch: 10,000 images, 3 workers
# Auto-stop jika tidak ada dead images lagi

cd "/Users/mac/VSC Project/Manga Zone"

BATCH_NUM="${1:-5}"   # Allow starting from specific batch
MAX_BATCHES=60

while [ $BATCH_NUM -le $MAX_BATCHES ]; do
  echo "============================================"
  echo "🔄 Starting Batch $BATCH_NUM at $(date '+%H:%M:%S')"
  echo "============================================"

  node scripts/backfill-dead-parallel.mjs --workers=3 --max-images=10000 > /tmp/backfill-batch${BATCH_NUM}.log 2>&1
  EXIT_CODE=$?

  echo "Batch $BATCH_NUM finished with exit code $EXIT_CODE at $(date '+%H:%M:%S')"

  # Wait 30s for DB to settle before checking (avoid race condition with count query)
  echo "Waiting 30s for DB to settle..."
  sleep 30

  # Check if there are still dead images (using dedicated script)
  DEAD_COUNT=$(node scripts/check-dead-count.mjs 2>/dev/null)
  if [ -z "$DEAD_COUNT" ] || [ "$DEAD_COUNT" = "0" ]; then
    # Double-check: might be race condition, wait and retry
    echo "Got 0 or empty. Double-checking in 15s..."
    sleep 15
    DEAD_COUNT=$(node scripts/check-dead-count.mjs 2>/dev/null)
  fi
  if [ -z "$DEAD_COUNT" ]; then DEAD_COUNT=999999; fi  # Default: assume still have dead if check fails

  echo "Dead images remaining: $DEAD_COUNT"

  if [ "$DEAD_COUNT" -lt 5 ]; then
    echo "✅ All done! Less than 5 dead images remaining."
    break
  fi

  if [ $BATCH_NUM -eq $MAX_BATCHES ]; then
    echo "⚠️  Reached max batches ($MAX_BATCHES). Run again to continue."
    break
  fi

  echo "Sleeping 10s..."
  sleep 10
  BATCH_NUM=$((BATCH_NUM + 1))
done

echo "============================================"
echo "🏁 ALL BATCHES COMPLETE at $(date '+%H:%M:%S')"
echo "============================================"

# Final summary
node -e "
const fs = require('fs');
try {
  const p = JSON.parse(fs.readFileSync('backfill-dead-progress.json', 'utf-8'));
  console.log('Chapters completed:', p.completedChapters.length);
  console.log('Chapters failed:', p.failedChapters.length);
  console.log('Total images uploaded:', p.totalImagesUploaded);
} catch(e) { console.log('No progress file'); }
"