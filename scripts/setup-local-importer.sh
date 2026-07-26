#!/bin/bash
# =============================================================
# Manga Zone — Local Import Setup Script (macOS / Linux)
# =============================================================
# Setup MacBook untuk auto-import manga & chapters:
#   1. Install PM2 (process manager)
#   2. Install npm dependencies
#   3. Apply DB migration (multi-source architecture)
#   4. Start PM2 workers (sitemap watcher + chapter checker)
#   5. Enable auto-start on boot (launchd on macOS)
#
# Usage:
#   chmod +x scripts/setup-local-importer.sh
#   ./scripts/setup-local-importer.sh
# =============================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}✅ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()   { echo -e "${RED}❌ $1${NC}"; }
step()  { echo -e "\n${BOLD}── $1 ──${NC}"; }

# ---- Pre-flight checks ----
step "0. Pre-flight checks"

if [ ! -f ".env" ] && [ ! -f ".env.local" ]; then
  err "No .env or .env.local found in project root."
  echo "    Copy .env.example to .env and fill in your secrets."
  exit 1
fi

if [ ! -f ".env.local" ]; then
  warn ".env.local not found, but .env exists — OK"
fi

# Check required env vars
source_env() {
  for f in .env .env.local; do
    if [ -f "$f" ]; then
      set -a
      # shellcheck disable=SC1090
      source "$f"
      set +a
    fi
  done
}
source_env

if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  err "NEXT_PUBLIC_SUPABASE_URL is not set in .env"
  exit 1
fi
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  err "SUPABASE_SERVICE_ROLE_KEY is not set in .env"
  exit 1
fi
if [ -z "${R2_ACCOUNT_ID:-}" ] || [ -z "${R2_BUCKET_NAME:-}" ]; then
  err "R2 credentials not set (R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)"
  exit 1
fi

info "Environment variables OK"

# ---- Node version ----
step "1. Node.js version"
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node.js >= 18 required (current: $(node -v))"
  exit 1
fi
info "Node.js $(node -v) OK"

# ---- npm install ----
step "2. Install npm dependencies"
if [ ! -d "node_modules" ]; then
  npm ci || npm install
else
  info "node_modules exists, skipping"
fi

# ---- Install PM2 ----
step "3. Install PM2"
if command -v pm2 &> /dev/null; then
  info "PM2 already installed: $(pm2 --version)"
else
  warn "Installing PM2 globally..."
  npm install -g pm2
  info "PM2 installed: $(pm2 --version)"
fi

# ---- Create logs dir ----
step "4. Create directories"
mkdir -p "$PROJECT_ROOT/logs"
mkdir -p "$PROJECT_ROOT/.sitemap-snapshots"
info "Created logs/ and .sitemap-snapshots/"

# ---- Apply DB migration ----
step "5. Apply DB migration (053_multi_source_architecture.sql)"
MIGRATION_FILE="$PROJECT_ROOT/supabase/migrations/053_multi_source_architecture.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
  warn "Migration file not found, skipping"
else
  echo "    Migration file exists: $MIGRATION_FILE"
  echo "    Apply this migration to your Supabase project via dashboard or:"
  echo "    supabase db push --db-url \"\${NEXT_PUBLIC_SUPABASE_URL}\""
  warn "Manual step: ensure migration 053 is applied to Supabase"
fi

# ---- Stop existing PM2 processes ----
step "6. Stop existing PM2 processes"
pm2 delete manga-zone-sitemap-watcher 2>/dev/null || true
pm2 delete manga-zone-chapter-checker 2>/dev/null || true
info "Cleared old processes"

# ---- Start PM2 ----
step "7. Start PM2 workers"
pm2 start ecosystem.config.cjs
sleep 2
pm2 status
info "PM2 workers started"

# ---- Auto-start on boot ----
step "8. Enable auto-start on boot"
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "    macOS detected — run this command to enable boot persistence:"
  echo ""
  echo "    ${BOLD}pm2 startup${NC}"
  echo ""
  echo "    PM2 will output a command. Copy-paste-run that command."
  echo "    Then save current process list:"
  echo ""
  echo "    ${BOLD}pm2 save${NC}"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo "    Linux detected — run:"
  echo "    ${BOLD}pm2 startup${NC}"
  echo "    ${BOLD}pm2 save${NC}"
fi

# ---- Summary ----
step "✅ Setup Complete!"
cat <<EOF

${GREEN}${BOLD}Manga Zone Local Importer is now running!${NC}

${BOLD}What's running:${NC}
  • manga-zone-sitemap-watcher  — checks for new manga every 10 min
  • manga-zone-chapter-checker  — checks for new chapters every 2 hours

${BOLD}Useful commands:${NC}
  pm2 status                      — show running processes
  pm2 logs                        — tail all logs
  pm2 logs manga-zone-sitemap-watcher — tail sitemap watcher only
  pm2 stop all                    — stop everything
  pm2 restart all                 — restart everything
  pm2 monit                       — real-time dashboard

${BOLD}Manual import:${NC}
  npm run import:local                      — interactive menu
  npm run import:local:sitemap              — import from sitemaps
  npm run import:local:chapters             — check & import new chapters
  npm run import:local:full                 — full manga + chapters

${BOLD}Logs:${NC}
  $PROJECT_ROOT/logs/pm2-sitemap.out.log
  $PROJECT_ROOT/logs/pm2-chapters.out.log

EOF