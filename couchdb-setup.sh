#!/bin/bash
# [AJAN-2 | claude/serene-gagarin | 2026-03-25]
# CouchDB ilk kurulum scripti — CORS + veritabanları oluşturma
# Kullanım: bash couchdb-setup.sh [COUCHDB_URL] [USER] [PASSWORD]

COUCH_URL="${1:-http://localhost:5984}"
COUCH_USER="${2:-admin}"
COUCH_PASS="${3:-mert2024}"
AUTH="${COUCH_USER}:${COUCH_PASS}@"
BASE="http://${AUTH}${COUCH_URL#http://}"

echo "=== MERT.4 CouchDB Kurulumu ==="
echo "URL: ${COUCH_URL}"
echo ""

# ── CORS Ayarları ──────────────────────────────────────────────
echo "[1/3] CORS ayarlanıyor..."
curl -s -X PUT "${BASE}/_node/_local/_config/httpd/enable_cors" -d '"true"'
curl -s -X PUT "${BASE}/_node/_local/_config/cors/origins" -d '"*"'
curl -s -X PUT "${BASE}/_node/_local/_config/cors/methods" -d '"GET, PUT, POST, HEAD, DELETE"'
curl -s -X PUT "${BASE}/_node/_local/_config/cors/headers" -d '"accept, authorization, content-type, origin, referer"'
curl -s -X PUT "${BASE}/_node/_local/_config/cors/credentials" -d '"true"'
echo ""
echo "  CORS aktif."

# ── Sistem veritabanları ───────────────────────────────────────
echo ""
echo "[2/3] Sistem veritabanları kontrol ediliyor..."
for sysdb in _users _replicator _global_changes; do
  curl -s -X PUT "${BASE}/${sysdb}" > /dev/null 2>&1
done
echo "  Sistem DB'leri hazır."

# ── Uygulama veritabanları ─────────────────────────────────────
echo ""
echo "[3/3] Uygulama veritabanları oluşturuluyor..."

DATABASES=(
  mert_fisler
  mert_urunler
  mert_cari_hesaplar
  mert_kasa_islemleri
  mert_personeller
  mert_bankalar
  mert_cekler
  mert_araclar
  mert_arac_shifts
  mert_arac_km_logs
  mert_uretim_profilleri
  mert_uretim_kayitlari
  mert_faturalar
  mert_fatura_stok
  mert_tahsilatlar
  mert_kv_store
)

for db in "${DATABASES[@]}"; do
  result=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "${BASE}/${db}")
  if [ "$result" = "201" ]; then
    echo "  + ${db} oluşturuldu"
  elif [ "$result" = "412" ]; then
    echo "  = ${db} zaten var"
  else
    echo "  ! ${db} hata (HTTP ${result})"
  fi
done

echo ""
echo "=== Kurulum tamamlandı! ==="
echo "CouchDB Fauxton UI: ${COUCH_URL}/_utils"
echo ""
