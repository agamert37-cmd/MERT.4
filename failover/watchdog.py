"""
MERT.4 Yedek Sunucu İzleme Servisi (Watchdog)
==============================================
BU SCRIPT İKİNCİL BİLGİSAYARDA çalışır.

Görevler:
  1. Birincil CouchDB sunucusunu sürekli izler (15 saniyede bir)
  2. Ardışık 3 başarısız kontrol → failover tetiklenir
  3. Failover: Bu bilgisayardaki Docker container'larını ayağa kaldırır
  4. Birincil geri gelince: ters replikasyon kurarak eksik verileri senkronize eder
  5. Tüm olayları watchdog.log dosyasına kaydeder
  6. Windows 10/11 bildirim sistemi üzerinden uyarı gönderir

Kurulum ve Başlatma: KUR_YEDEK.bat → WATCHDOG.bat
"""

import requests
import subprocess
import json
import time
import logging
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path

# ── Dosya yolları ─────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
CONFIG_FILE = BASE_DIR / 'watchdog_config.json'
LOG_FILE    = BASE_DIR / 'watchdog.log'
STATE_FILE  = BASE_DIR / 'watchdog_state.json'

# ── Varsayılan konfigürasyon ──────────────────────────────────────────────────
DEFAULT_CONFIG = {
    "primary": {
        "host":     "192.168.1.100",
        "port":     5984,
        "user":     "adm1n",
        "password": "135790"
    },
    "secondary": {
        "host":     "localhost",
        "port":     5984,
        "user":     "adm1n",
        "password": "135790"
    },
    "docker": {
        "compose_file":  "C:\\MERT.4\\docker-compose.yml",
        "project_name":  "mert4",
        "startup_wait_sec": 20
    },
    "failover": {
        "check_interval_sec":  15,
        "failure_threshold":   3,
        "recovery_threshold":  5,
        "auto_failback":       False,
        "failback_wait_sec":   60
    },
    "notification": {
        "enabled": True
    }
}


# ─────────────────────────────────────────────────────────────────────────────
# Durum Yöneticisi
# ─────────────────────────────────────────────────────────────────────────────
class WatchdogState:
    def __init__(self):
        self.consecutive_failures:   int  = 0
        self.consecutive_recoveries: int  = 0
        self.failover_active:        bool = False
        self.failover_since:         datetime | None = None
        self.total_failovers:        int  = 0

    def to_dict(self) -> dict:
        return {
            "failover_active":   self.failover_active,
            "failover_since":    self.failover_since.isoformat() if self.failover_since else None,
            "total_failovers":   self.total_failovers,
            "failures":          self.consecutive_failures,
        }

    def save(self):
        try:
            with open(STATE_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.to_dict(), f, indent=2)
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# Konfigürasyon
# ─────────────────────────────────────────────────────────────────────────────
def load_config() -> dict:
    """Konfigürasyon dosyasını yükle; yoksa varsayılan ile oluştur."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                stored = json.load(f)
            # Derin birleştirme — eksik anahtarları varsayılandan tamamla
            merged = {}
            for key in DEFAULT_CONFIG:
                if key in stored and isinstance(stored[key], dict):
                    merged[key] = {**DEFAULT_CONFIG[key], **stored[key]}
                elif key in stored:
                    merged[key] = stored[key]
                else:
                    merged[key] = DEFAULT_CONFIG[key]
            return merged
        except Exception as e:
            logging.error(f"Config okunamadı ({e}), varsayılan kullanılıyor")
    else:
        # İlk çalıştırma: şablon oluştur
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_CONFIG, f, indent=2, ensure_ascii=False)
        logging.warning(f"Config dosyası oluşturuldu: {CONFIG_FILE}")
        logging.warning("Lütfen IP adreslerini ve şifreleri güncelleyin!")
    return DEFAULT_CONFIG


# ─────────────────────────────────────────────────────────────────────────────
# Loglama
# ─────────────────────────────────────────────────────────────────────────────
def setup_logging():
    fmt = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s',
                            datefmt='%Y-%m-%d %H:%M:%S')
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Dosya handler — 10 MB döngüsel
    try:
        from logging.handlers import RotatingFileHandler
        fh = RotatingFileHandler(LOG_FILE, maxBytes=10*1024*1024, backupCount=3, encoding='utf-8')
        fh.setFormatter(fmt)
        root.addHandler(fh)
    except Exception:
        pass

    # Konsol handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    root.addHandler(ch)


# ─────────────────────────────────────────────────────────────────────────────
# Sağlık Kontrolü
# ─────────────────────────────────────────────────────────────────────────────
def check_primary_health(config: dict) -> bool:
    """Birincil CouchDB'ye ping at; True = sağlıklı."""
    p = config['primary']
    url = f"http://{p['host']}:{p['port']}/"
    try:
        r = requests.get(url, auth=(p['user'], p['password']), timeout=5)
        return r.status_code == 200
    except requests.exceptions.ConnectionError:
        return False
    except requests.exceptions.Timeout:
        return False
    except Exception:
        return False


def check_secondary_couchdb(config: dict) -> bool:
    """Bu bilgisayardaki CouchDB'nin çalışıp çalışmadığını kontrol et."""
    s = config['secondary']
    url = f"http://{s['host']}:{s['port']}/"
    try:
        r = requests.get(url, auth=(s['user'], s['password']), timeout=5)
        return r.status_code == 200
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Windows Bildirimleri
# ─────────────────────────────────────────────────────────────────────────────
def notify_windows(title: str, message: str, icon: str = 'Info'):
    """
    Windows 10/11 sistem tepsisi balonu göster.
    icon: 'Info' | 'Warning' | 'Error'
    """
    try:
        safe_title   = title.replace('"', "'")
        safe_message = message.replace('"', "'").replace('\n', ' ')
        ps = (
            f'Add-Type -AssemblyName System.Windows.Forms; '
            f'$n = New-Object System.Windows.Forms.NotifyIcon; '
            f'$n.Icon = [System.Drawing.SystemIcons]::Information; '
            f'$n.Visible = $true; '
            f'$n.ShowBalloonTip(10000, "{safe_title}", "{safe_message}", '
            f'[System.Windows.Forms.ToolTipIcon]::{icon}); '
            f'Start-Sleep -Milliseconds 10500; '
            f'$n.Dispose()'
        )
        flags = 0x08000000  # CREATE_NO_WINDOW
        subprocess.Popen(
            ['powershell', '-WindowStyle', 'Hidden', '-NonInteractive', '-Command', ps],
            creationflags=flags
        )
    except Exception as e:
        logging.debug(f"Bildirim gönderilemedi: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Docker İşlemleri
# ─────────────────────────────────────────────────────────────────────────────
def run_docker_compose(config: dict, command: list[str], timeout: int = 120) -> bool:
    """docker compose komutunu çalıştır."""
    compose_file = config['docker']['compose_file']
    project      = config['docker']['project_name']
    cmd = ['docker', 'compose', '-f', compose_file, '-p', project] + command
    logging.info(f"Çalıştırılıyor: {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=timeout, creationflags=0x08000000
        )
        if result.returncode == 0:
            return True
        logging.error(f"Docker hata çıktısı:\n{result.stderr.strip()}")
        return False
    except subprocess.TimeoutExpired:
        logging.error(f"Docker komutu zaman aşımına uğradı ({timeout}s)")
        return False
    except FileNotFoundError:
        logging.error("Docker bulunamadı — PATH içinde docker.exe olduğundan emin olun")
        return False


def start_docker_secondary(config: dict) -> bool:
    success = run_docker_compose(config, ['up', '-d'])
    if success:
        wait = config['docker'].get('startup_wait_sec', 20)
        logging.info(f"Docker başlatıldı, {wait}s servis başlangıcı bekleniyor…")
        time.sleep(wait)
    return success


def stop_docker_secondary(config: dict) -> bool:
    return run_docker_compose(config, ['down'], timeout=60)


# ─────────────────────────────────────────────────────────────────────────────
# Failover
# ─────────────────────────────────────────────────────────────────────────────
def trigger_failover(config: dict, state: WatchdogState):
    if state.failover_active:
        return

    state.failover_active = True
    state.failover_since  = datetime.now()
    state.total_failovers += 1
    state.save()

    logging.error("=" * 60)
    logging.error("FAILOVER TETİKLENDİ!")
    logging.error(f"Birincil sunucu {config['primary']['host']}:{config['primary']['port']} yanıt vermiyor.")
    logging.error("Bu bilgisayar yedek sunucu olarak devreye alınıyor…")
    logging.error("=" * 60)

    # İkincil CouchDB kontrolü
    if not check_secondary_couchdb(config):
        logging.error("Bu bilgisayardaki CouchDB çalışmıyor! setup_replication.py ile kurun.")
        notify_windows(
            "❌ MERT.4 — Yedek CouchDB Yok",
            "Birincil sunucu çöktü ama bu bilgisayarda CouchDB çalışmıyor! "
            "KUR_YEDEK.bat ile kurulum yapılmış olmalıydı.",
            "Error"
        )
        return

    # Docker başlat
    success = start_docker_secondary(config)
    p = config['primary']

    if success:
        logging.info("✅ Yedek sunucu başarıyla devreye alındı!")
        notify_windows(
            "⚠️ MERT.4 — Yedek Sunucu Aktif",
            f"Birincil sunucu ({p['host']}) çöktü. "
            "Yedek sunucu devreye alındı. "
            "Kullanıcılara yeni adres bildirilmeli.",
            "Warning"
        )
    else:
        logging.error("❌ Docker başlatılamadı — yedek sunucu devreye alınamadı!")
        notify_windows(
            "❌ MERT.4 — Failover Başarısız",
            f"Birincil sunucu ({p['host']}) çöktü ve yedek başlatılamadı! "
            "Sistem yöneticisine haber verin.",
            "Error"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Kurtarma (Birincil Geri Döndüğünde)
# ─────────────────────────────────────────────────────────────────────────────
def handle_recovery(config: dict, state: WatchdogState):
    """Birincil sunucu geri geldi — sync ve isteğe bağlı failback."""
    downtime = ""
    if state.failover_since:
        delta = datetime.now() - state.failover_since
        mins  = int(delta.total_seconds() // 60)
        downtime = f" (kesinti süresi: ~{mins} dakika)"

    logging.info(f"Birincil sunucu geri döndü{downtime}.")

    if not config['failover']['auto_failback']:
        # Manuel failback — sadece bildirim gönder
        notify_windows(
            "✅ MERT.4 — Birincil Sunucu Geri Döndü",
            f"Birincil sunucu yeniden çalışıyor{downtime}. "
            "Yedekteyken yapılan değişiklikler için IT ile iletişime geçin.",
            "Info"
        )
        logging.info("auto_failback=false — Manuel failback gerekli.")
        logging.info("Yedek Docker container'ları çalışmaya devam ediyor.")
        logging.info("Hazır olunca WATCHDOG.bat'ı durdurup KUR_YEDEK.bat'ı tekrar çalıştırın.")
        # State'i sıfırla ama Docker'ı durdurma
        state.failover_active = False
        state.failover_since  = None
        state.save()
        return

    # Otomatik failback
    logging.info("Otomatik failback başlıyor…")
    logging.info("Adım 1/3: Ters replikasyon kuruluyor (yedek → birincil)…")

    try:
        import setup_replication as sr
        s = config['secondary']
        p = config['primary']
        sr.setup_one_way_replication(
            source_host=s['host'], source_port=s['port'],
            source_user=s['user'],  source_pass=s['password'],
            target_host=p['host'], target_port=p['port'],
            target_user=p['user'],  target_pass=p['password'],
            doc_prefix="failback_"
        )
        wait = config['failover'].get('failback_wait_sec', 60)
        logging.info(f"Adım 2/3: {wait}s sync bekleniyor…")
        time.sleep(wait)
    except Exception as e:
        logging.error(f"Ters replikasyon kurulamadı: {e}")
        logging.warning("Failback manuel tamamlanmalı!")

    logging.info("Adım 3/3: Yedek Docker durduruluyor…")
    stop_docker_secondary(config)

    state.failover_active = False
    state.failover_since  = None
    state.save()

    notify_windows(
        "✅ MERT.4 — Otomatik Failback Tamamlandı",
        "Sistem birincil sunucuya geri döndü. "
        "Yedekteki değişiklikler aktarıldı.",
        "Info"
    )
    logging.info("Otomatik failback tamamlandı. Sistem birincil sunucuda.")


# ─────────────────────────────────────────────────────────────────────────────
# Ana Döngü
# ─────────────────────────────────────────────────────────────────────────────
def main():
    setup_logging()
    config = load_config()
    state  = WatchdogState()

    p         = config['primary']
    interval  = config['failover']['check_interval_sec']
    fail_thr  = config['failover']['failure_threshold']
    rec_thr   = config['failover']['recovery_threshold']

    logging.info("=" * 60)
    logging.info("MERT.4 Watchdog v1.0 başlatıldı")
    logging.info(f"İzlenen sunucu  : {p['host']}:{p['port']}")
    logging.info(f"Kontrol aralığı : {interval}s")
    logging.info(f"Hata eşiği      : {fail_thr} ardışık hata")
    logging.info(f"Kurtarma eşiği  : {rec_thr} ardışık başarı")
    logging.info(f"Auto-failback   : {config['failover']['auto_failback']}")
    logging.info("=" * 60)

    while True:
        is_up = check_primary_health(config)

        if is_up:
            if state.failover_active:
                state.consecutive_recoveries += 1
                if state.consecutive_recoveries >= rec_thr:
                    handle_recovery(config, state)
                    state.consecutive_recoveries = 0
                else:
                    logging.info(
                        f"Birincil yanıt veriyor "
                        f"({state.consecutive_recoveries}/{rec_thr} kurtarma onayı)…"
                    )
            else:
                if state.consecutive_failures > 0:
                    logging.info("Birincil sunucu yeniden sağlıklı.")
                state.consecutive_failures   = 0
                state.consecutive_recoveries = 0

        else:
            state.consecutive_recoveries = 0
            state.consecutive_failures  += 1
            logging.warning(
                f"Birincil sunucu yanıt vermiyor "
                f"({state.consecutive_failures}/{fail_thr})…"
            )

            if state.consecutive_failures >= fail_thr:
                trigger_failover(config, state)
                # Failover sonrası kontrolleri yavaşlat
                time.sleep(interval * 2)
                continue

        time.sleep(interval)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        logging.info("Watchdog kullanıcı tarafından durduruldu.")
        sys.exit(0)
    except Exception as e:
        logging.critical(f"Beklenmeyen hata: {e}", exc_info=True)
        sys.exit(1)
