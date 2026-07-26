#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# 🚀 deploy-to-vps.sh — Update VPS dari MacBook (satu baris command)
# ═══════════════════════════════════════════════════════════════════════════
# Cara pakai (jalankan dari MacBook):
#   ./scripts/deploy-to-vps.sh                    # pakai IP default dari .env
#   ./scripts/deploy-to-vps.sh root@123.45.67.89  # IP custom
#   VPS_SSH_USER=root VPS_SSH_HOST=123.45.67.89 ./scripts/deploy-to-vps.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Color helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Parse SSH target ───────────────────────────────────────────────────────
SSH_TARGET="${1:-}"

if [ -z "$SSH_TARGET" ]; then
  SSH_TARGET="${VPS_SSH_USER:-root}@${VPS_SSH_HOST:-}"
fi

# Coba load dari .env kalau tidak ada argumen
if [ -z "$SSH_TARGET" ] || [ "$SSH_TARGET" = "root@" ]; then
  if [ -f .env ]; then
    VPS_SSH_HOST_FROM_ENV=$(grep -E '^VPS_SSH_HOST=' .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
    VPS_SSH_USER_FROM_ENV=$(grep -E '^VPS_SSH_USER=' .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "root")
    if [ -n "$VPS_SSH_HOST_FROM_ENV" ]; then
      SSH_TARGET="${VPS_SSH_USER_FROM_ENV:-root}@${VPS_SSH_HOST_FROM_ENV}"
    fi
  fi
fi

if [ -z "$SSH_TARGET" ] || [ "$SSH_TARGET" = "root@" ]; then
  echo "❌ Error: SSH target tidak ditemukan!"
  echo ""
  echo "Cara pakai:"
  echo "  ./scripts/deploy-to-vps.sh root@123.45.67.89"
  echo ""
  echo "Atau tambahkan ke .env:"
  echo "  VPS_SSH_HOST=123.45.67.89"
  echo "  VPS_SSH_USER=root"
  exit 1
fi

PROJECT_DIR="/opt/manga-zone"
SSH_CMD="ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ${SSH_TARGET}"

info "🚀 Deploy ke VPS: ${SSH_TARGET}"
info "📁 Project dir: ${PROJECT_DIR}"
echo ""

# ── Step 1: Test SSH connection ─────────────────────────────────────────────
info "Step 1/5: Test SSH connection..."
if ! $SSH_CMD "echo ok" &>/dev/null; then
  error "Tidak bisa SSH ke ${SSH_TARGET}. Cek SSH key & IP VPS."
fi
ok "SSH connection OK"

# ── Step 2: Git pull di VPS ────────────────────────────────────────────────
info "Step 2/5: Git pull di VPS..."
$SSH_CMD "cd ${PROJECT_DIR} && git pull origin main" || error "Git pull gagal di VPS"
ok "Code updated"

# ── Step 3: Install dependencies (jika package-lock berubah) ───────────────
info "Step 3/5: Cek & install dependencies..."
$SSH_CMD "cd ${PROJECT_DIR} && npm ci --omit=dev 2>/dev/null || npm install --omit=dev" || warn "npm install warning (mungkin tidak ada perubahan)"
ok "Dependencies OK"

# ── Step 4: Reload PM2 workers (zero-downtime) ─────────────────────────────
info "Step 4/5: Reload PM2 workers (zero-downtime)..."
$SSH_CMD "cd ${PROJECT_DIR} && pm2 reload ecosystem.vps.config.cjs 2>/dev/null || pm2 reload ecosystem.config.cjs" || error "PM2 reload gagal"
ok "Workers reloaded"

# ── Step 5: Tampilkan status ───────────────────────────────────────────────
info "Step 5/5: Status VPS..."
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ DEPLOY BERHASIL!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
$SSH_CMD "pm2 list"
echo ""
info "Logs realtime: ssh ${SSH_TARGET} 'pm2 logs'"
info "Monitoring:    ssh ${SSH_TARGET} 'pm2 monit'"