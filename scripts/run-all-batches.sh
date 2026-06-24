#!/bin/bash
# Auto-loop backfill semua dead images sampai selesai
# Optimized: 5 workers, 15k images/batch, faster delays
# Setiap batch ~15 min → ~56 batch × 15 min = ~14 jam total

cd "/Users/mac/VSC Project/Manga Zone"

BATCH_NUM="${1:-6}"   # Start from batch 6 (1-5 already done)
MAX_BATCHES=200       # Increased limit

while [ $BATCH_NUM -le $MAX_BATCHES ]; do
  echo "============================================"
  echo "🔄 Starting Batch $BATCH_NUM at $(date '+%H:%M:%S')"
  echo "============================================"

  node scripts/backfill-dead-parallel.mjs --workers=5 --max-images=15000 > /tmp/backfill-batch${BATCH_NUM}.log 2>&1
  EXIT_CODE=$?

  echo "Batch $BATCH_NUM finished with exit code $EXIT_CODE at $(date '+%H:%M:%S')"
  tail -15 /tmp/backfill-batch${BATCH_NUM}.log

  # Wait 15s for DB to settle
  echo "Waiting 15s for DB to settle..."
  sleep 15

  # Check dead count (parse "Dead:" line from output)
  DEAD_OUTPUT=$(node scripts/check-dead-count.mjs 2>/dev/null)
  echo "$DEAD_OUTPUT"
  DEAD_COUNT=$(echo "$DEAD_OUTPUT" | grep "^Dead:" | grep -oE '[0-9,]+' | tr -d ',')

  if [ -z "$DEAD_COUNT" ]; then DEAD_COUNT=999999; fi

  echo "Dead images remaining: $DEAD_COUNT"

  if [ "$DEAD_COUNT" -lt 100 ]; then
    echo "✅ Almost done! Less than 100 dead images remaining."
    break
  fi

  echo "Sleeping 5s..."
  sleep 5
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
  console.log('Total images uploaded:', p.totalImagesUploaded?.toLocaleString());
} catch(e) { console.log('No progress file'); }
"