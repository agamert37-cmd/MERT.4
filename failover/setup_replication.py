"""
MERT.4 CouchDB Replikasyon Kurulumu
=====================================
Bu script İKİNCİL BİLGİSAYARDA bir kez çalıştırılır.

Yaptığı işlemler:
  1. Birincil CouchDB'deki tüm mert_* veritabanlarını listeler
  2. İkincil CouchDB'de eksik olanları oluşturur
  3. Her veritabanı için sürekli replikasyon belgesi kurar (primary → secondary)
  4. Replikasyon durumunu raporlar

Kullanım:
  python setup_replication.py
  veya
  python setup_replication.py --status   (sadece durum raporu)
  python setup_replication.py --reset    (tüm replikasyonları sıfırla ve yeniden kur)
"""

import requests
import json
import time
import sys
import argparse
from pathlib import Path

# ── Sabitler ──────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
CONFIG_FILE = BASE_DIR / 'watchdog_config.json'

# Replike edilecek veritabanları (db-config.ts TABLE_NAMES ile senkron)
MERT_DATABASES = [
    'mert_fisler',
    'mert_urunler',
    'mert_cari_hesaplar',
    'mert_kasa_islemleri',
    'mert_personeller',
    'mert_bankalar',
    'mert_cekler',
    'mert_araclar',
    'mert_arac_shifts',
    'mert_arac_km_logs',
    'mert_uretim_profilleri',
    'mert_uretim_kayitlari',
    'mert_faturalar',
    'mert_fatura_stok',
    'mert_tahsilatlar',
    'mert_guncelleme_notlari',
    'mert_stok_giris',
    'mert_kv_store',
]

# ── Renk kodları (terminal) ───────────────────────────────────────────────────
class C:
    RED    = '\033[91m'
    GREEN  = '\033[92m'
    YELLOW = '\033[93m'
    BLUE   = '\033[94m'
    CYAN   = '\033[96m'
    BOLD   = '\033[1m'
    RESET  = '\033[0m'

def colored(text, color): return f"{color}{text}{C.RESET}"
def ok(msg):   print(colored(f"  ✅  {msg}", C.GREEN))
def warn(msg): print(colored(f"  ⚠️  {msg}", C.YELLOW))
def err(msg):  print(colored(f"  ❌  {msg}", C.RED))
def info(msg): print(colored(f"  ℹ️  {msg}", C.CYAN))
def head(msg): print(colored(f"\n{'─'*60}\n  {msg}\n{'─'*60}", C.BOLD))


# ── Config Yükleme ─────────────────────────────────────────────────────────────
def load_config() -> dict:
    if not CONFIG_FILE.exists():
        err(f"watchdog_config.json bulunamadı: {CONFIG_FILE}")
        err("Önce watchdog.py'yi çalıştırarak şablon oluşturun.")
        sys.exit(1)
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


# ── CouchDB İstemcisi ─────────────────────────────────────────────────────────
class CouchDB:
    def __init__(self, host: str, port: int, user: str, password: str):
        self.base = f"http://{host}:{port}"
        self.auth = (user, password)
        self.session = requests.Session()
        self.session.auth = self.auth

    def get(self, path: str, **kwargs) -> requests.Response:
        return self.session.get(f"{self.base}{path}", timeout=15, **kwargs)

    def put(self, path: str, data=None, **kwargs) -> requests.Response:
        return self.session.put(f"{self.base}{path}", json=data, timeout=15, **kwargs)

    def post(self, path: str, data=None, **kwargs) -> requests.Response:
        return self.session.post(f"{self.base}{path}", json=data, timeout=15, **kwargs)

    def delete(self, path: str, **kwargs) -> requests.Response:
        return self.session.delete(f"{self.base}{path}", timeout=15, **kwargs)

    def ping(self) -> bool:
        try:
            r = self.get('/')
            return r.status_code == 200
        except Exception:
            return False

    def list_databases(self) -> list[str]:
        r = self.get('/_all_dbs')
        r.raise_for_status()
        return r.json()

    def create_database(self, db_name: str) -> bool:
        r = self.put(f"/{db_name}")
        return r.status_code in (201, 412)  # 412 = zaten var

    def get_doc_count(self, db_name: str) -> int:
        try:
            r = self.get(f"/{db_name}")
            r.raise_for_status()
            return r.json().get('doc_count', 0)
        except Exception:
            return -1


# ── Replikasyon ──────────────────────────────────────────────────────────────
def make_replication_id(db_name: str, prefix: str = "") -> str:
    """Replikasyon belgesi için tutarlı bir _id üret."""
    return f"{prefix}mert4_{db_name.replace('mert_', '')}"


def get_replication_docs(couch: CouchDB) -> dict:
    """İkincil CouchDB'deki tüm mevcut replikasyon belgelerini getir."""
    try:
        r = couch.get('/_replicator/_all_docs?include_docs=true')
        r.raise_for_status()
        docs = {}
        for row in r.json().get('rows', []):
            doc = row.get('doc', {})
            if not doc.get('_id', '').startswith('_'):
                docs[doc['_id']] = doc
        return docs
    except Exception as e:
        warn(f"Replikasyon belgeleri okunamadı: {e}")
        return {}


def create_replication_doc(
    couch: CouchDB,
    doc_id: str,
    source_url: str,
    target_url: str,
    db_name: str,
    existing_rev: str | None = None
) -> bool:
    """Tek bir veritabanı için replikasyon belgesi oluştur veya güncelle."""
    doc = {
        "_id":           doc_id,
        "source":        f"{source_url}/{db_name}",
        "target":        f"{target_url}/{db_name}",
        "continuous":    True,
        "create_target": True,
        "worker_processes":   2,
        "http_connections":   4,
    }
    if existing_rev:
        doc["_rev"] = existing_rev

    r = couch.put(f"/_replicator/{doc_id}", data=doc)
    return r.status_code in (201, 200)


def delete_replication_doc(couch: CouchDB, doc_id: str, rev: str) -> bool:
    r = couch.delete(f"/_replicator/{doc_id}?rev={rev}")
    return r.status_code == 200


def build_couch_url(host: str, port: int, user: str, password: str) -> str:
    """Credential içeren CouchDB URL'i oluştur (replikasyon için)."""
    return f"http://{user}:{password}@{host}:{port}"


# ── Ana Fonksiyonlar ──────────────────────────────────────────────────────────
def setup_one_way_replication(
    source_host: str, source_port: int, source_user: str, source_pass: str,
    target_host: str, target_port: int, target_user: str, target_pass: str,
    doc_prefix: str = "",
    databases: list[str] | None = None,
    verbose: bool = True,
) -> dict:
    """
    Kaynak → Hedef yönünde tüm veritabanları için sürekli replikasyon kur.
    Replikasyon belgeleri İKİNCİL (target) CouchDB'nin _replicator'ına yazılır.

    Returns:
        {"created": int, "updated": int, "skipped": int, "errors": int}
    """
    dbs = databases or MERT_DATABASES
    source_url = build_couch_url(source_host, source_port, source_user, source_pass)
    target_url = build_couch_url(target_host, target_port, target_user, target_pass)

    # İkincil CouchDB bağlantısı (replikasyon belgelerini buraya yazıyoruz)
    secondary = CouchDB(target_host, target_port, target_user, target_pass)
    existing  = get_replication_docs(secondary)

    stats = {"created": 0, "updated": 0, "skipped": 0, "errors": 0}

    for db_name in dbs:
        doc_id = make_replication_id(db_name, doc_prefix)
        old_doc = existing.get(doc_id)

        expected_source = f"{source_url}/{db_name}"
        expected_target = f"{target_url}/{db_name}"

        # Zaten doğru şekilde ayarlanmışsa atla
        if old_doc and old_doc.get('source') == expected_source and \
                old_doc.get('target') == expected_target and \
                old_doc.get('continuous') is True:
            if verbose:
                info(f"{db_name:30s} → zaten aktif, atlanıyor")
            stats["skipped"] += 1
            continue

        rev = old_doc.get('_rev') if old_doc else None
        ok_flag = create_replication_doc(
            secondary, doc_id,
            source_url=source_url,
            target_url=target_url,
            db_name=db_name,
            existing_rev=rev,
        )

        if ok_flag:
            action = "güncellendi" if rev else "oluşturuldu"
            if verbose:
                ok(f"{db_name:30s} → replikasyon belgesi {action}")
            stats["updated" if rev else "created"] += 1
        else:
            if verbose:
                err(f"{db_name:30s} → replikasyon belgesi kurulamadı!")
            stats["errors"] += 1

    return stats


def show_replication_status(config: dict):
    """Tüm replikasyonların güncel durumunu göster."""
    head("Replikasyon Durumu")
    s = config['secondary']
    couch = CouchDB(s['host'], s['port'], s['user'], s['password'])

    if not couch.ping():
        err(f"İkincil CouchDB'ye bağlanılamıyor: {s['host']}:{s['port']}")
        return

    try:
        r = couch.get('/_active_tasks')
        r.raise_for_status()
        tasks = {t['doc_id']: t for t in r.json() if t.get('type') == 'replication'}
    except Exception as e:
        err(f"Aktif görevler alınamadı: {e}")
        tasks = {}

    existing = get_replication_docs(couch)
    p = config['primary']

    print(f"\n  {'Veritabanı':<28} {'Replikasyon':<12} {'Belgeler':<10} {'Durum'}")
    print(f"  {'─'*28} {'─'*12} {'─'*10} {'─'*20}")

    for db_name in MERT_DATABASES:
        doc_id = make_replication_id(db_name)
        has_rep = doc_id in existing
        task    = tasks.get(doc_id)

        # İkincil belge sayısı
        local_count = couch.get_doc_count(db_name)

        if task:
            progress = task.get('progress', 0)
            status = f"{colored('AKTIF', C.GREEN)} {progress}%"
        elif has_rep:
            rep_state = existing[doc_id].get('_replication_state', '?')
            if rep_state == 'triggered':
                status = colored('tetiklendi', C.YELLOW)
            elif rep_state == 'completed':
                status = colored('tamamlandı', C.CYAN)
            elif rep_state == 'error':
                status = colored('HATA', C.RED)
            else:
                status = colored('idle', C.BLUE)
        else:
            status = colored('KURULMADI', C.RED)

        count_str = str(local_count) if local_count >= 0 else "?"
        rep_str   = colored("✓ var", C.GREEN) if has_rep else colored("✗ yok", C.RED)
        print(f"  {db_name:<28} {rep_str:<20} {count_str:<10} {status}")

    print()
    info(f"Birincil: {p['host']}:{p['port']}  →  İkincil: {s['host']}:{s['port']}")


def reset_replications(config: dict):
    """Tüm mevcut replikasyon belgelerini sil ve yeniden kur."""
    head("Replikasyonlar Sıfırlanıyor")
    s = config['secondary']
    couch = CouchDB(s['host'], s['port'], s['user'], s['password'])

    existing = get_replication_docs(couch)
    deleted  = 0
    for doc_id, doc in existing.items():
        if 'mert4_' in doc_id:
            if delete_replication_doc(couch, doc_id, doc['_rev']):
                info(f"Silindi: {doc_id}")
                deleted += 1

    ok(f"{deleted} replikasyon belgesi silindi.")
    time.sleep(2)


def main():
    parser = argparse.ArgumentParser(description='MERT.4 CouchDB Replikasyon Kurulumu')
    parser.add_argument('--status', action='store_true', help='Sadece durum raporu göster')
    parser.add_argument('--reset',  action='store_true', help='Replikasyonları sıfırla ve yeniden kur')
    args = parser.parse_args()

    config = load_config()

    if args.status:
        show_replication_status(config)
        return

    if args.reset:
        reset_replications(config)

    # ─── Bağlantı kontrolleri ─────────────────────────────────────────────────
    head("Bağlantı Kontrolleri")

    p  = config['primary']
    s  = config['secondary']
    primary_couch   = CouchDB(p['host'], p['port'], p['user'], p['password'])
    secondary_couch = CouchDB(s['host'], s['port'], s['user'], s['password'])

    print(f"\n  Birincil  CouchDB: {p['host']}:{p['port']}")
    if primary_couch.ping():
        ok("Birincil CouchDB bağlantısı başarılı")
    else:
        err(f"Birincil CouchDB'ye bağlanılamıyor!")
        err("IP adresini ve şifreyi watchdog_config.json'dan kontrol edin.")
        sys.exit(1)

    print(f"\n  İkincil CouchDB: {s['host']}:{s['port']}")
    if secondary_couch.ping():
        ok("İkincil CouchDB bağlantısı başarılı")
    else:
        err("Bu bilgisayardaki CouchDB çalışmıyor!")
        err("CouchDB'yi kurup başlatın, sonra tekrar deneyin.")
        sys.exit(1)

    # ─── Veritabanları oluştur ────────────────────────────────────────────────
    head("İkincil Veritabanları Hazırlanıyor")
    for db_name in MERT_DATABASES:
        secondary_couch.create_database(db_name)
        ok(f"{db_name} hazır")

    # ─── Replikasyon kur ──────────────────────────────────────────────────────
    head("Replikasyon Belgeleri Kuruluyor (Birincil → İkincil)")
    print(f"\n  {p['host']}:{p['port']}  →  {s['host']}:{s['port']}\n")

    stats = setup_one_way_replication(
        source_host=p['host'], source_port=p['port'],
        source_user=p['user'], source_pass=p['password'],
        target_host=s['host'], target_port=s['port'],
        target_user=s['user'], target_pass=s['password'],
        verbose=True,
    )

    # ─── Özet ────────────────────────────────────────────────────────────────
    head("Kurulum Özeti")
    print(
        f"\n  {colored('Oluşturulan:', C.GREEN)} {stats['created']}   "
        f"{colored('Güncellenen:', C.CYAN)} {stats['updated']}   "
        f"{colored('Atlanan:', C.YELLOW)} {stats['skipped']}   "
        f"{colored('Hata:', C.RED)} {stats['errors']}\n"
    )

    if stats['errors'] == 0:
        ok("Replikasyon kurulumu tamamlandı!")
        info(f"Birincil CouchDB'deki tüm veriler şu an bu bilgisayara kopyalanıyor.")
        info(f"Durum için:  python setup_replication.py --status")
        info(f"Watchdog başlatmak için:  WATCHDOG.bat")
    else:
        warn(f"{stats['errors']} veritabanı için replikasyon kurulamadı.")
        warn("Logları kontrol edin ve tekrar deneyin.")

    # ─── Canlı durum ─────────────────────────────────────────────────────────
    print()
    answer = input("  Replikasyon durumunu göster? [E/h] ").strip().lower()
    if answer != 'h':
        time.sleep(3)
        show_replication_status(config)


if __name__ == '__main__':
    main()
