"""
MERT.4 Updater v2 — core.py
Config, Backup ve Summary yöneticileri.
"""
from __future__ import annotations
import os, json, datetime, subprocess, shutil, time

REPO_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_FILE = os.path.join(REPO_DIR, "mert4_config.json")
BACKUP_DIR  = os.path.join(REPO_DIR, ".mert4_backups")
BACKUP_IDX  = os.path.join(BACKUP_DIR, "index.json")
SUMMARY_FILE= os.path.join(BACKUP_DIR, "summary.json")
MAX_BACKUPS = 10


# ─── ConfigManager ────────────────────────────────────────────────────────────

class ConfigManager:
    DEFAULTS: dict = {
        "app_url":              "http://localhost:8080",
        "git_remote":           "origin",
        "git_branch":           "main",
        "couchdb_url":          "http://localhost:5984",
        "couchdb_user":         "admin",
        "couchdb_pass":         "",
        "telegram_token":       "",
        "telegram_chat_id":     "",
        "telegram_on_build":    True,
        "telegram_on_error":    True,
        "telegram_on_couch_down": True,
        "ssh_host":             "",
        "ssh_port":             "22",
        "ssh_user":             "",
        "ssh_pass":             "",
        "ssh_key_path":         "",
        "ssh_remote_path":      "/var/www/mert4",
        "cloud_type":           "r2",
        "cloud_endpoint":       "",
        "cloud_bucket":         "",
        "cloud_access_key":     "",
        "cloud_secret_key":     "",
        "cloud_prefix":         "mert4-backups/",
        "cloud_auto_on_backup": False,
    }

    def __init__(self):
        self._data: dict = dict(self.DEFAULTS)
        self.load()

    def load(self):
        if not os.path.exists(CONFIG_FILE):
            return
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                self._data.update(json.load(f))
        except Exception:
            pass

    def save(self):
        os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)

    def get(self, key: str, fallback: str = "") -> str:
        return str(self._data.get(key, self.DEFAULTS.get(key, fallback)))

    def get_bool(self, key: str) -> bool:
        v = self._data.get(key, self.DEFAULTS.get(key, False))
        return bool(v)

    def set(self, key: str, value) -> None:
        self._data[key] = value


# ─── BackupManager ────────────────────────────────────────────────────────────

class BackupManager:
    def __init__(self, compose_cmd: str = "docker compose"):
        os.makedirs(BACKUP_DIR, exist_ok=True)
        self._compose = compose_cmd

    def _load(self) -> list:
        if not os.path.exists(BACKUP_IDX):
            return []
        try:
            with open(BACKUP_IDX, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save(self, data: list):
        with open(BACKUP_IDX, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def list(self) -> list:
        return self._load()

    def create(self, label: str = "", include_docker: bool = False,
               log_fn=None) -> str:
        log = log_fn or (lambda m, t="dim": None)
        ts  = datetime.datetime.now()
        bid = ts.strftime("%Y%m%d_%H%M%S")

        # Git hash
        try:
            r = subprocess.run(
                ["git", "log", "--format=%H|%h|%s", "-1"],
                cwd=REPO_DIR, capture_output=True, text=True, timeout=5
            )
            parts = r.stdout.strip().split("|", 2) if r.returncode == 0 else []
            git_hash  = parts[0] if parts else ""
            git_short = parts[1] if len(parts) > 1 else ""
            git_msg   = parts[2] if len(parts) > 2 else ""
        except Exception:
            git_hash = git_short = git_msg = ""

        entry = {
            "id": bid,
            "timestamp":     ts.strftime("%d.%m.%Y %H:%M"),
            "label":         label or "Manuel yedek",
            "git_hash":      git_hash,
            "git_hash_short":git_short,
            "git_msg":       git_msg,
            "docker_file":   None,
        }

        # Docker image kaydet (isteğe bağlı)
        if include_docker:
            log("🐳 Docker image kaydediliyor...", "info")
            img_path = os.path.join(BACKUP_DIR, f"{bid}.docker.tar")
            try:
                r = subprocess.run(
                    f"{self._compose} images -q",
                    shell=True, cwd=REPO_DIR,
                    capture_output=True, text=True, timeout=10
                )
                images = r.stdout.strip().splitlines()
                if images:
                    subprocess.run(
                        ["docker", "save", "-o", img_path] + images,
                        cwd=REPO_DIR, timeout=300, check=True
                    )
                    entry["docker_file"] = img_path
                    log(f"  Docker image: {img_path}", "dim")
            except Exception as e:
                log(f"  Docker kayıt hatası: {e}", "warning")

        index = self._load()
        index.insert(0, entry)

        # Maksimum yedek sayısını aş → eskiyi sil
        while len(index) > MAX_BACKUPS:
            old = index.pop()
            df = old.get("docker_file")
            if df and os.path.exists(df):
                try:
                    os.unlink(df)
                except Exception:
                    pass

        self._save(index)
        log(f"✓ Yedek alındı: {bid}", "success")
        return bid

    def restore(self, backup_id: str, compose_cmd: str,
                log_fn=None) -> bool:
        log = log_fn or (lambda m, t="dim": None)
        index = self._load()
        entry = next((b for b in index if b["id"] == backup_id), None)
        if not entry:
            log("Yedek bulunamadı!", "error")
            return False

        git_hash = entry.get("git_hash", "")
        if not git_hash:
            log("Git hash eksik!", "error")
            return False

        try:
            subprocess.run(
                ["git", "checkout", git_hash, "--", "."],
                cwd=REPO_DIR, check=True, timeout=30
            )
            log(f"✓ Kod geri yüklendi: {entry['git_hash_short']}", "success")
        except Exception as e:
            log(f"Git checkout hatası: {e}", "error")
            return False

        docker_file = entry.get("docker_file")
        if docker_file and os.path.exists(docker_file):
            log("🐳 Docker image yükleniyor...", "info")
            try:
                subprocess.run(
                    ["docker", "load", "-i", docker_file],
                    check=True, timeout=300
                )
                log("✓ Docker image yüklendi", "success")
            except Exception as e:
                log(f"Docker load hatası: {e}", "warning")
        else:
            log("Yeniden build başlatılıyor...", "info")
            subprocess.run(
                f"{compose_cmd} up --build -d",
                shell=True, cwd=REPO_DIR, timeout=600
            )

        return True

    def delete(self, backup_id: str):
        index = self._load()
        entry = next((b for b in index if b["id"] == backup_id), None)
        if entry:
            df = entry.get("docker_file")
            if df and os.path.exists(df):
                try:
                    os.unlink(df)
                except Exception:
                    pass
            index = [b for b in index if b["id"] != backup_id]
            self._save(index)


# ─── SummaryManager ───────────────────────────────────────────────────────────

class SummaryManager:
    MAX = 20

    def __init__(self):
        os.makedirs(BACKUP_DIR, exist_ok=True)

    def _load(self) -> list:
        if not os.path.exists(SUMMARY_FILE):
            return []
        try:
            with open(SUMMARY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save(self, data: list):
        with open(SUMMARY_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def record(self, entry: dict):
        data = self._load()
        data.insert(0, entry)
        if len(data) > self.MAX:
            data = data[:self.MAX]
        self._save(data)

    def all(self) -> list:
        return self._load()
