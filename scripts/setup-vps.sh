#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# 🖥️ setup-vps.sh — Bootstrap Manga Zone Import Worker di VPS
# ═══════════════════════════════════════════════════════════════════════════
# Jalankan SEKALI di VPS (sebagai root):
#   curl -sL https://raw.githubusercontent.com/Briyanes/komawazone/main/scripts/setup-vps.sh | bash
# Atau kalau sudah clone repo:
#   bash scripts/setup-vps.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Color helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Pre-flight checks ──────────────────────────────────────────────────────
info "Manga Zone VPS Bootstrap — dimulai..."

# Must be root or have sudo
if [ "$(id -u)" -ne 0 ]; then
  if ! sudo -n true 2>/dev/null; then
    error "Script ini harus dijalankan sebagai root atau dengan sudo: sudo bash setup-vps.sh"
  fi
  SUDO="sudo"
else
  SUDO=""
fi

# Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_FAMILY="${ID_LIKE:-}"
  info "OS terdeteksi: ${PRETTY_NAME:-$OS_ID}"
else
  error "Tidak bisa mendeteksi OS. Script ini support Debian/Ubuntu."
fi

# Must be Debian/Ubuntu based
if [[ "$OS_ID" != "debian" && "$OS_ID" != "ubuntu" && "$OS_FAMILY" != *debian* ]]; then
  error "OS tidak didukung. Gunakan Debian 11/12 atau Ubuntu 22.04/24.04."
fi

# ── Step 1: System update & install base packages ──────────────────────────
info "Step 1/8: Update system & install base packages..."
export DEBIAN_FRONTEND=noninteractive
$SUDO apt-get update -qq
$SUDO apt-get upgrade -y -qq
$SUDO apt-get install -y -qq \
  curl git build-essential \
  ca-certificates gnupg \
  ufw htop \
  chromium 2>/dev/null || true
ok "Base packages terinstall"

# ── Step 2: Install Node.js 20 LTS ─────────────────────────────────────────
info "Step 2/8: Install Node.js 20 LTS..."
if ! command -v node &>/dev/null || [[ "$(node -v 2>/dev/null || echo 'v0')" < "v20" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash - 2>/dev/null
  $SUDO apt-get install -y -qq nodejs
fi
NODE_VER=$(node -v)
ok "Node.js terinstall: $NODE_VER"

# ── Step 3: Install PM2 globally ───────────────────────────────────────────
info "Step 3/8: Install PM2..."
if ! command -v pm2 &>/dev/null; then
  $SUDO npm install -g pm2
fi
ok "PM2 terinstall: $(pm2 --version)"

# ── Step 4: Setup Swap (mencegah OOM di VPS 2GB) ───────────────────────────
info "Step 4/8: Setup Swap file (2GB)..."
SWAP_SIZE="2G"
if [ "$(swapon --show=SIZE --bytes --noheadings 2>/dev/null | head -1)" = "" ]; then
  $SUDO fallocate -l "$SWAP_SIZE" /swapfile
  $SUDO chmod 600 /swapfile
  $SUDO mkswap /swapfile
  $SUDO swapon /swapfile
  # Persist on reboot
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  fi
  # Lower swappiness (use RAM first, swap only when needed)
  echo 'vm.swappiness=10' | $SUDO tee -a /etc/sysctl.conf >/dev/null
  $SUDO sysctl -p >/dev/null 2>&1
  ok "Swap 2GB dibuat & aktif"
else
  warn "Swap sudah ada, skip"
fi

# ── Step 5: Setup project ──────────────────────────────────────────────────
info "Step 5/8: Setup project..."
PROJECT_DIR="/opt/manga-zone"

if [ ! -d "$PROJECT_DIR" ]; then
  info "  Cloning repo ke $PROJECT_DIR..."
  $SUDO mkdir -p "$PROJECT_DIR"
  $SUDO chown -R "$(whoami)" "$PROJECT_DIR"
  git clone https://github.com/Briyanes/komawazone.git "$PROJECT_DIR"
else
  info "  Project sudah ada di $PROJECT_DIR, pulling latest..."
  cd "$PROJECT_DIR"
  git pull origin main || warn "Git pull gagal, lanjut dengan kode yang ada"
fi

cd "$PROJECT_DIR"

# Install dependencies
info "  Installing npm dependencies..."
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
ok "Dependencies terinstall"

# Install Playwright browsers
info "  Installing Playwright Chromium..."
npx playwright install chromium 2>/dev/null || warn "Playwright install gagal (mungkin sudah ada)"
npx playwright install-deps chromium 2>/dev/null || warn "Playwright deps gagal (mungkin sudah ada)"
ok "Playwright siap"

# ── Step 6: Setup .env ─────────────────────────────────────────────────────
info "Step 6/8: Setup .env..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
  if [ -f "$PROJECT_DIR/.env.vps.example" ]; then
    cp "$PROJECT_DIR/.env.vps.example" "$PROJECT_DIR/.env"
    warn "  .env dibuat dari template. EDIT SEKARANG sebelum lanjut!"
    warn "  Jalankan: nano $PROJECT_DIR/.env"
    warn "  Lalu re-run: bash $PROJECT_DIR/scripts/setup-vps.sh"
    exit 0
  else
    error "File .env.vps.example tidak ditemukan. Clone repo dengan benar."
  fi
else
  ok ".env sudah ada"
fi

# Validate critical env vars
ENV_FILE="$PROJECT_DIR/.env"
if grep -q "your-project-ref" "$ENV_FILE" || grep -q "your-account-id" "$ENV_FILE"; then
  error ".env masih berisi placeholder! Edit dulu: nano $ENV_FILE"
fi
ok ".env valid"

# ── Step 7: Setup logs directory & PM2 ─────────────────────────────────────
info "Step 7/8: Setup PM2 workers..."
mkdir -p "$PROJECT_DIR/logs"

# Stop existing workers if any
pm2 delete all 2>/dev/null || true

# Start with VPS ecosystem config
if [ -f "$PROJECT_DIR/ecosystem.vps.config.cjs" ]; then
  pm2 start "$PROJECT_DIR/ecosystem.vps.config.cjs"
else
  # Fallback ke ecosystem.config.cjs yang sudah ada
  pm2 start "$PROJECT_DIR/ecosystem.config.cjs"
fi
pm2 save
ok "PM2 workers berjalan"

# ── Step 8: Setup systemd auto-start on boot ───────────────────────────────
info "Step 8/8: Setup auto-start saat VPS reboot..."
# PM2 startup akan generate command systemd
pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>&1 | grep -v "^$" || true
ok "PM2 auto-start configured"

# ── Setup UFW Firewall ─────────────────────────────────────────────────────
info "Bonus: Setup UFW firewall (SSH only)..."
$SUDO ufw allow OpenSSH 2>/dev/null || $SUDO ufw allow 22/tcp 2>/dev/null || true
$SUDO ufw --force enable 2>/dev/null || warn "UFW setup gagal, skip"
ok "Firewall aktif (SSH only)"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ VPS SETUP SELESAI!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "📊 Status Workers:"
pm2 list
echo ""
echo "📋 Log files:"
echo "   $PROJECT_DIR/logs/pm2-sitemap.out.log"
echo "   $PROJECT_DIR/logs/pm2-sitemap.err.log"
echo "   $PROJECT_DIR/logs/pm2-chapters.out.log"
echo "   $PROJECT_DIR/logs/pm2-chapters.err.log"
echo ""
echo "🔍 Monitoring commands:"
echo "   pm2 status              # cek status workers"
echo "   pm2 logs                # realtime logs (Ctrl+C untuk keluar)"
echo "   pm2 monit               # dashboard CPU/RAM"
echo "   pm2 restart all         # restart semua workers"
echo "   pm2 stop all            # stop semua workers"
echo ""
echo "🚀 VPS siap! MacBook Anda sekarang boleh dimatikan."
echo ""