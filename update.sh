#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  update.sh — GitHub'dan güncel kodu çekip Docker'ı yeniden başlatır
#  Kullanım: ./update.sh
#            ./update.sh --branch main
#            ./update.sh --no-cache        (image cache'ini temizle)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Renkler ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log()     { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[HATA]${NC}  $1"; exit 1; }

# ─── Parametreler ────────────────────────────────────────────────────
BRANCH="main"
NO_CACHE=""
GITHUB_REPO="https://github.com/agamert37-cmd/MERT.4.git"   # ← KENDİ REPO URL'İNİ GİR

while [[ $# -gt 0 ]]; do
  case $1 in
    --branch) BRANCH="$2"; shift 2 ;;
    --no-cache) NO_CACHE="--no-cache"; shift ;;
    --repo) GITHUB_REPO="$2"; shift 2 ;;
    *) warn "Bilinmeyen parametre: $1"; shift ;;
  esac
done

# ─── Script'in bulunduğu dizine git ─────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     İŞLEYEN ET — Docker Güncelleme          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ─── 1. Gereksinim Kontrolü ─────────────────────────────────────────
log "Docker kontrol ediliyor..."
docker info > /dev/null 2>&1 || error "Docker çalışmıyor. 'sudo systemctl start docker' dene."

command -v git > /dev/null 2>&1 || error "Git kurulu değil."
success "Docker ve Git hazır"

# ─── 2. Git Repo Yapısını Kontrol Et ────────────────────────────────
if [ -d ".git" ]; then
  # Mevcut repo var — remote URL'yi güncelle ve pull yap
  log "Mevcut Git repo bulundu."

  CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
  if [ "$CURRENT_REMOTE" != "$GITHUB_REPO" ] && [ -n "$GITHUB_REPO" ]; then
    log "GitHub remote güncelleniyor..."
    git remote set-url origin "$GITHUB_REPO"
    success "Remote → $GITHUB_REPO"
  fi

  log "GitHub'dan güncel kod çekiliyor (branch: ${BOLD}$BRANCH${NC})..."
  git fetch origin "$BRANCH" 2>&1 || error "git fetch başarısız. GitHub bağlantısı veya URL kontrol et."
  git reset --hard "origin/$BRANCH" 2>&1
  success "Kod güncellendi → $(git log -1 --format='%h %s' 2>/dev/null)"

else
  # Repo yok — clone et
  if [ -n "$GITHUB_REPO" ]; then
    log "Repo bulunamadı, GitHub'dan clone ediliyor..."
    PARENT_DIR="$(dirname "$SCRIPT_DIR")"
    FOLDER_NAME="$(basename "$SCRIPT_DIR")"
    cd "$PARENT_DIR"
    git clone --branch "$BRANCH" "$GITHUB_REPO" "$FOLDER_NAME" || error "git clone başarısız."
    cd "$FOLDER_NAME"
    success "Repo clone edildi."
  else
    warn "Git repo yok ve GITHUB_REPO boş. Yerel kod kullanılıyor."
  fi
fi

# ─── 3. .env Dosyası Kontrolü ───────────────────────────────────────
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  warn ".env bulunamadı, .env.example kopyalanıyor..."
  cp .env.example .env
  warn "⚠  .env dosyasını düzenleyip gerekli değerleri gir!"
fi

# ─── 4. Çalışan Container'ı Durdur ─────────────────────────────────
log "Mevcut container durduruluyor..."
docker compose down --remove-orphans 2>/dev/null || true
success "Container durduruldu"

# ─── 5. Eski Image'ı Temizle (opsiyonel) ────────────────────────────
if [ -n "$NO_CACHE" ]; then
  warn "--no-cache: Eski image tamamen siliniyor..."
  docker compose rm -f 2>/dev/null || true
  # Proje adıyla eşleşen image'ları temizle
  COMPOSE_PROJECT=$(basename "$SCRIPT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]-')
  docker image rm "${COMPOSE_PROJECT}-mert-site" 2>/dev/null || true
  docker image prune -f 2>/dev/null || true
fi

# ─── 6. Yeni Image Build Et ─────────────────────────────────────────
log "Docker image build ediliyor ${NO_CACHE:+(cache temiz)}..."
BUILD_START=$(date +%s)

docker compose build $NO_CACHE 2>&1 | while IFS= read -r line; do
  # Build çıktısını renklendir
  if echo "$line" | grep -q "ERROR\|error"; then
    echo -e "${RED}  $line${NC}"
  elif echo "$line" | grep -q "Step\|--->\|Successfully"; then
    echo -e "${CYAN}  $line${NC}"
  else
    echo "  $line"
  fi
done

BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))
success "Build tamamlandı (${BUILD_TIME}s)"

# ─── 7. Container'ı Başlat ─────────────────────────────────────────
log "Container başlatılıyor..."
docker compose up -d

# Kısa bekleme — nginx'in ayağa kalkması için
sleep 2

# ─── 8. Durum Kontrolü ─────────────────────────────────────────────
CONTAINER_STATUS=$(docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || docker compose ps)
echo ""
echo -e "${BOLD}── Container Durumu ──────────────────────────${NC}"
echo "$CONTAINER_STATUS"
echo ""

# Health check
CONTAINER_NAME=$(docker compose ps -q 2>/dev/null | head -1)
if [ -n "$CONTAINER_NAME" ]; then
  STATUS=$(docker inspect --format='{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")
  if [ "$STATUS" = "running" ]; then
    # Port'u bul
    PORT=$(docker compose port mert-site 80 2>/dev/null | cut -d: -f2 || echo "8080")
    echo -e "${GREEN}${BOLD}✓ Uygulama çalışıyor!${NC}"
    echo -e "  ${BOLD}→ http://localhost:${PORT}${NC}"
    echo ""
  else
    warn "Container çalışmıyor (Status: $STATUS). Log:"
    docker compose logs --tail=30
  fi
fi

# ─── 9. Özet ───────────────────────────────────────────────────────
echo -e "${BOLD}── Kullanışlı Komutlar ───────────────────────${NC}"
echo "  docker compose logs -f          # Canlı log"
echo "  docker compose restart          # Yeniden başlat"
echo "  docker compose down             # Durdur"
echo "  ./update.sh --no-cache          # Cache temizleyip güncelle"
echo ""
