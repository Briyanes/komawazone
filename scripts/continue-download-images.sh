#!/bin/bash
# Helper: lanjutkan download chapter images untuk semua manga yang masih belum punya images
# Run: bash scripts/continue-download-images.sh
cd "$(dirname "$0")/.."
echo "🔄 Continue bulk image download..."
echo "   Skip manga yang sudah punya images di R2"
echo ""
node --env-file=.env.local scripts/download-chapters.mjs \
  --images-only \
  --skip-with-images \
  --concurrency=1 \
  --delay=1500 \
  --resume 2>&1 | tee -a scripts/download-images.log