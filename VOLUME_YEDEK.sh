#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  VOLUME_YEDEK.sh — CouchDB Docker volume yedeği alır ve geri yükler
#  Kullanım:
#    ./VOLUME_YEDEK.sh              # Yedek al
#    ./VOLUME_YEDEK.sh --restore    # Yedek listesini göster ve geri yükle
#    ./VOLUME_YEDEK.sh --list       # Mevcut yedekleri listele
#    ./VOLUME_YEDEK.sh --auto       # Otomatik günlük yedek (cron için)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[UYARI]${NC} $1"; }
error()   { echo -e "${RED}[HATA]${NC}  $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/couchdb_yedekler"
CONTAINER="mert-couchdb"
VOLUME="mert4_couchdb_data"
MODE="backup"
MAX_BACKUPS=7   # Kaç yedek tutulsun (otomatik silme)

while [[ $# -gt 0 ]]; do
  case $1 in
    --restore) MODE="restore"; shift ;;
    --list)    MODE="list"; shift ;;
    --auto)    MODE="auto"; shift ;;
    *) warn "Bilinmeyen parametre: $1"; shift ;;
  esac
done

mkdir -p "$BACKUP_DIR"

# ─── Docker kontrolü ────────────────────────────────────────────────
check_docker() {
  docker info > /dev/null 2>&1 || error "Docker çalışmıyor."
  docker ps --filter "name=$CONTAINER" --filter "status=running" -q | grep -q . || {
    warn "CouchDB container çalışmıyor. Volume'dan doğrudan yedek alınıyor..."
    return 1
  }
  return 0
}

# ─── Yedek Al ───────────────────────────────────────────────────────
do_backup() {
  local TIMESTAMP
  TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
  local BACKUP_FILE="$BACKUP_DIR/couchdb_yedek_${TIMESTAMP}.tar.gz"
  local META_FILE="$BACKUP_DIR/couchdb_yedek_${TIMESTAMP}.meta"

  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║     CouchDB Volume Yedekleme                 ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
  echo ""

  log "Yedek dosyası: couchdb_yedek_${TIMESTAMP}.tar.gz"

  # Container durdurulmadan yedek alınabilir (CouchDB MVCC tabanlı)
  if check_docker; then
    log "CouchDB container çalışıyor — online yedek alınıyor..."
    # Volume içeriğini geçici bir alpine container ile tar'la
    docker run --rm \
      -v "${VOLUME}:/data:ro" \
      -v "$BACKUP_DIR:/backup" \
      alpine:latest \
      tar czf "/backup/couchdb_yedek_${TIMESTAMP}.tar.gz" -C /data .
  else
    log "Offline yedek alınıyor (volume direkt)..."
    docker run --rm \
      -v "${VOLUME}:/data:ro" \
      -v "$BACKUP_DIR:/backup" \
      alpine:latest \
      tar czf "/backup/couchdb_yedek_${TIMESTAMP}.tar.gz" -C /data .
  fi

  # Boyut hesapla
  local SIZE
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)

  # Meta dosyası oluştur
  cat > "$META_FILE" <<EOF
timestamp=$TIMESTAMP
date=$(date '+%Y-%m-%d %H:%M:%S')
file=couchdb_yedek_${TIMESTAMP}.tar.gz
size=$SIZE
container=$CONTAINER
volume=$VOLUME
host=$(hostname)
EOF

  success "Yedek tamamlandı: $BACKUP_FILE ($SIZE)"

  # Eski yedekleri temizle
  cleanup_old_backups

  echo ""
  echo -e "${BOLD}── Yedek Bilgisi ─────────────────────────────${NC}"
  echo "  Dosya: couchdb_yedek_${TIMESTAMP}.tar.gz"
  echo "  Boyut: $SIZE"
  echo "  Konum: $BACKUP_DIR/"
  echo ""
}

# ─── Eski yedekleri temizle ─────────────────────────────────────────
cleanup_old_backups() {
  local count
  count=$(ls -1 "$BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l)
  if [ "$count" -gt "$MAX_BACKUPS" ]; then
    local to_delete=$(( count - MAX_BACKUPS ))
    log "Eski yedekler temizleniyor ($to_delete adet)..."
    ls -1t "$BACKUP_DIR"/*.tar.gz | tail -n "$to_delete" | while read -r f; do
      rm -f "$f"
      rm -f "${f%.tar.gz}.meta"
      log "Silindi: $(basename "$f")"
    done
  fi
}

# ─── Yedekleri Listele ──────────────────────────────────────────────
do_list() {
  echo ""
  echo -e "${BOLD}── Mevcut CouchDB Yedekleri ──────────────────${NC}"
  echo ""

  local backups
  backups=$(ls -1t "$BACKUP_DIR"/*.tar.gz 2>/dev/null || true)

  if [ -z "$backups" ]; then
    warn "Henüz yedek alınmamış. './VOLUME_YEDEK.sh' çalıştırın."
    return
  fi

  local i=0
  while IFS= read -r f; do
    i=$((i+1))
    local meta="${f%.tar.gz}.meta"
    local size
    size=$(du -sh "$f" | cut -f1)
    if [ -f "$meta" ]; then
      local date
      date=$(grep "^date=" "$meta" | cut -d= -f2-)
      echo -e "  ${BOLD}[$i]${NC} $(basename "$f")"
      echo "       Tarih: $date | Boyut: $size"
    else
      echo -e "  ${BOLD}[$i]${NC} $(basename "$f") ($size)"
    fi
    echo ""
  done <<< "$backups"
}

# ─── Geri Yükle ─────────────────────────────────────────────────────
do_restore() {
  do_list

  local backups
  backups=$(ls -1t "$BACKUP_DIR"/*.tar.gz 2>/dev/null || true)
  if [ -z "$backups" ]; then
    error "Geri yüklenecek yedek bulunamadı."
  fi

  echo -e "${YELLOW}Hangi yedeği geri yüklemek istiyorsunuz? (numara girin):${NC}"
  read -r CHOICE

  local selected
  selected=$(echo "$backups" | sed -n "${CHOICE}p")
  if [ -z "$selected" ]; then
    error "Geçersiz seçim."
  fi

  echo ""
  warn "UYARI: Bu işlem mevcut CouchDB verilerini SİLECEK ve seçilen yedek ile değiştirecek!"
  echo -e "${YELLOW}Devam etmek istiyor musunuz? (evet/hayır):${NC}"
  read -r CONFIRM

  if [ "$CONFIRM" != "evet" ]; then
    log "İptal edildi."
    exit 0
  fi

  log "Container durduruluyor..."
  cd "$SCRIPT_DIR" && docker compose stop couchdb 2>/dev/null || true
  sleep 2

  log "Volume temizleniyor..."
  docker run --rm \
    -v "${VOLUME}:/data" \
    alpine:latest \
    sh -c "rm -rf /data/*"

  log "Yedek geri yükleniyor: $(basename "$selected")"
  docker run --rm \
    -v "${VOLUME}:/data" \
    -v "$BACKUP_DIR:/backup:ro" \
    alpine:latest \
    tar xzf "/backup/$(basename "$selected")" -C /data

  log "CouchDB yeniden başlatılıyor..."
  cd "$SCRIPT_DIR" && docker compose start couchdb 2>/dev/null || docker compose up -d couchdb
  sleep 3

  success "Geri yükleme tamamlandı: $(basename "$selected")"
}

# ─── Otomatik Yedek (cron için) ────────────────────────────────────
do_auto() {
  log "Otomatik yedek başlatılıyor..."
  do_backup
  echo ""
  log "Cron job eklemek için (günlük gece 2'de):"
  echo "  crontab -e"
  echo "  0 2 * * * $SCRIPT_DIR/VOLUME_YEDEK.sh --auto >> $BACKUP_DIR/auto_yedek.log 2>&1"
}

# ─── Ana Akış ───────────────────────────────────────────────────────
case $MODE in
  backup)  do_backup ;;
  restore) do_restore ;;
  list)    do_list ;;
  auto)    do_auto ;;
esac
