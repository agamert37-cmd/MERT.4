#!/bin/bash
# MERT4 — İzleme Yığını Yöneticisi
# Grafana + Prometheus + CouchDB Exporter
#
# Kullanım:
#   ./IZLEME.sh start    — izleme servislerini başlat
#   ./IZLEME.sh stop     — izleme servislerini durdur
#   ./IZLEME.sh status   — servis durumlarını göster
#   ./IZLEME.sh logs     — canlı logları izle
#   ./IZLEME.sh open     — Grafana'yı tarayıcıda aç

set -e

COMPOSE_CMD="docker compose"
if ! $COMPOSE_CMD version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
fi

GRAFANA_PORT="${GRAFANA_PORT:-3000}"
PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"

# Renk kodları
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

banner() {
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║   MERT4 — CouchDB İzleme Yığını     ║"
  echo "  ╚══════════════════════════════════════╝"
  echo -e "${NC}"
}

cmd_start() {
  banner
  echo -e "${GREEN}▶ İzleme servisleri başlatılıyor...${NC}"

  # .env yoksa oluştur
  if [ ! -f .env ]; then
    echo "COUCHDB_USER=adm1n" > .env
    echo "COUCHDB_PASSWORD=135790" >> .env
    echo "GRAFANA_USER=admin" >> .env
    echo "GRAFANA_PASSWORD=mert2024" >> .env
    echo "# Telegram bildirimleri için (opsiyonel):" >> .env
    echo "# TELEGRAM_BOT_TOKEN=123456:ABC..." >> .env
    echo "# TELEGRAM_CHAT_ID=-100123456" >> .env
    echo -e "${YELLOW}⚠  .env dosyası oluşturuldu — şifrelerinizi kontrol edin!${NC}"
  fi

  $COMPOSE_CMD --profile monitoring up -d

  echo ""
  echo -e "${GREEN}✓ İzleme yığını hazır!${NC}"
  echo ""
  echo -e "${BOLD}Erişim Adresleri:${NC}"
  HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
  echo -e "  📊 Grafana:     ${CYAN}http://${HOST_IP}:${GRAFANA_PORT}${NC}  (admin / mert2024)"
  echo -e "  📈 Prometheus:  ${CYAN}http://${HOST_IP}:${PROMETHEUS_PORT}${NC}"
  echo -e "  🔌 CouchDB Exp: ${CYAN}http://${HOST_IP}:9984/metrics${NC}"
  echo ""
  echo -e "${YELLOW}💡 Telegram bildirimleri için .env dosyasına TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID ekleyin.${NC}"
}

cmd_stop() {
  echo -e "${RED}■ İzleme servisleri durduruluyor...${NC}"
  $COMPOSE_CMD --profile monitoring stop couchdb-exporter prometheus grafana
  echo -e "${GREEN}✓ Durduruldu.${NC}"
}

cmd_status() {
  banner
  echo -e "${BOLD}Servis Durumları:${NC}"
  echo ""

  services=("mert-couchdb" "mert-couchdb-exporter" "mert-prometheus" "mert-grafana")
  for svc in "${services[@]}"; do
    status=$(docker inspect --format='{{.State.Status}}' "$svc" 2>/dev/null || echo "yok")
    if [ "$status" = "running" ]; then
      echo -e "  ${GREEN}● ${svc}${NC} — çalışıyor"
    elif [ "$status" = "yok" ]; then
      echo -e "  ${YELLOW}○ ${svc}${NC} — başlatılmamış"
    else
      echo -e "  ${RED}✗ ${svc}${NC} — $status"
    fi
  done
  echo ""

  # Metrik sayısını kontrol et
  if docker inspect mert-couchdb-exporter &>/dev/null; then
    metric_count=$(curl -s http://localhost:9984/metrics 2>/dev/null | grep -c "^couchdb_" || echo "?")
    echo -e "${BLUE}  CouchDB metrikleri: ${metric_count} adet${NC}"
  fi
}

cmd_logs() {
  echo -e "${BOLD}Canlı loglar (Ctrl+C ile çıkın):${NC}"
  $COMPOSE_CMD logs -f couchdb-exporter prometheus grafana
}

cmd_open() {
  HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
  URL="http://${HOST_IP}:${GRAFANA_PORT}"
  echo -e "${CYAN}Grafana açılıyor: ${URL}${NC}"
  if command -v xdg-open &>/dev/null; then
    xdg-open "$URL"
  elif command -v open &>/dev/null; then
    open "$URL"
  else
    echo -e "${YELLOW}Tarayıcınızda açın: ${URL}${NC}"
  fi
}

case "${1:-help}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  open)    cmd_open ;;
  *)
    banner
    echo "Kullanım: $0 {start|stop|status|logs|open}"
    echo ""
    echo "  start   — Grafana + Prometheus + CouchDB Exporter başlat"
    echo "  stop    — İzleme servislerini durdur"
    echo "  status  — Tüm servislerin durumunu göster"
    echo "  logs    — Canlı log akışı"
    echo "  open    — Grafana'yı tarayıcıda aç"
    ;;
esac
