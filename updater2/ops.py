"""
MERT.4 Updater v2 — ops.py
Git, Docker ve CouchDB terminal işlemleri.
"""
from __future__ import annotations
import subprocess, threading, time, os, json, urllib.request, urllib.error
from .core import ConfigManager, BackupManager, SummaryManager, REPO_DIR

LogFn = callable  # (msg: str, tag: str) -> None


def _run(cmd: list | str, log: LogFn, cwd=REPO_DIR,
         timeout=120, shell=False) -> tuple[bool, str]:
    """Komutu çalıştır; çıktıyı log'a aktar. (ok, son_satır) döner."""
    try:
        proc = subprocess.Popen(
            cmd, cwd=cwd, shell=shell,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1
        )
        last = ""
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                log(line, "dim")
                last = line
        proc.wait(timeout=timeout)
        return proc.returncode == 0, last
    except subprocess.TimeoutExpired:
        proc.kill()
        log("⚠ Zaman aşımı!", "warning")
        return False, "timeout"
    except Exception as e:
        log(f"⚠ Hata: {e}", "error")
        return False, str(e)


# ─── Git ──────────────────────────────────────────────────────────────────────

def git_fetch(cfg: ConfigManager, log: LogFn) -> bool:
    remote = cfg.get("git_remote", "origin")
    branch = cfg.get("git_branch", "main")
    log(f"▶ git fetch {remote} {branch}", "info")
    ok, _ = _run(["git", "fetch", remote, branch], log)
    if ok:
        log("✓ Fetch tamamlandı", "success")
    return ok


def git_reset(cfg: ConfigManager, log: LogFn) -> bool:
    remote = cfg.get("git_remote", "origin")
    branch = cfg.get("git_branch", "main")
    ref = f"{remote}/{branch}"
    log(f"▶ git reset --hard {ref}", "info")
    ok, _ = _run(["git", "reset", "--hard", ref], log)
    if ok:
        log("✓ Reset tamamlandı", "success")
    return ok


def git_pull(cfg: ConfigManager, log: LogFn) -> bool:
    remote = cfg.get("git_remote", "origin")
    branch = cfg.get("git_branch", "main")
    log(f"▶ git pull {remote} {branch}", "info")
    ok, _ = _run(["git", "pull", remote, branch], log)
    if ok:
        log("✓ Pull tamamlandı", "success")
    return ok


def git_log(n: int = 10, log: LogFn = None) -> list[dict]:
    """Son n commit bilgisini döner."""
    try:
        r = subprocess.run(
            ["git", "log", f"-{n}", "--format=%H|%h|%s|%an|%ar"],
            cwd=REPO_DIR, capture_output=True, text=True, timeout=5
        )
        out = []
        for line in r.stdout.strip().splitlines():
            parts = line.split("|", 4)
            if len(parts) == 5:
                out.append({
                    "hash": parts[0], "short": parts[1],
                    "msg": parts[2], "author": parts[3], "when": parts[4]
                })
        return out
    except Exception:
        return []


def git_current_hash() -> str:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_DIR, capture_output=True, text=True, timeout=5
        )
        return r.stdout.strip()
    except Exception:
        return "?"


def git_diff_stat(cfg: ConfigManager) -> str:
    """Fetch sonrası kaç commit geride/ileride bilgisi."""
    remote = cfg.get("git_remote", "origin")
    branch = cfg.get("git_branch", "main")
    try:
        r = subprocess.run(
            ["git", "rev-list", "--count", "--left-right",
             f"HEAD...{remote}/{branch}"],
            cwd=REPO_DIR, capture_output=True, text=True, timeout=5
        )
        parts = r.stdout.strip().split()
        if len(parts) == 2:
            return f"↑{parts[0]} ↓{parts[1]}"
    except Exception:
        pass
    return ""


# ─── Docker ───────────────────────────────────────────────────────────────────

def _compose(cfg: ConfigManager) -> str:
    return "docker compose"


def docker_build(cfg: ConfigManager, log: LogFn) -> bool:
    cmd = f"{_compose(cfg)} up --build -d"
    log(f"▶ {cmd}", "info")
    ok, _ = _run(cmd, log, shell=True, timeout=600)
    if ok:
        log("✓ Build tamamlandı", "success")
    return ok


def docker_restart(cfg: ConfigManager, log: LogFn) -> bool:
    cmd = f"{_compose(cfg)} restart"
    log(f"▶ {cmd}", "info")
    ok, _ = _run(cmd, log, shell=True, timeout=60)
    if ok:
        log("✓ Restart tamamlandı", "success")
    return ok


def docker_stop(cfg: ConfigManager, log: LogFn) -> bool:
    cmd = f"{_compose(cfg)} down"
    log(f"▶ {cmd}", "info")
    ok, _ = _run(cmd, log, shell=True, timeout=60)
    return ok


def docker_stats() -> list[dict]:
    """Konteyner başına CPU/RAM anlık bilgisi."""
    try:
        r = subprocess.run(
            ["docker", "stats", "--no-stream",
             "--format", "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"],
            capture_output=True, text=True, timeout=10
        )
        out = []
        for line in r.stdout.strip().splitlines():
            parts = line.split("|", 3)
            if len(parts) == 4:
                out.append({
                    "name": parts[0],
                    "cpu":  parts[1].strip("%"),
                    "mem":  parts[2],
                    "net":  parts[3],
                })
        return out
    except Exception:
        return []


def docker_logs(container: str, lines: int = 100) -> str:
    try:
        r = subprocess.run(
            ["docker", "logs", "--tail", str(lines), container],
            capture_output=True, text=True, timeout=10
        )
        return r.stdout + r.stderr
    except Exception as e:
        return str(e)


# ─── CouchDB ──────────────────────────────────────────────────────────────────

class CouchDB:
    def __init__(self, cfg: ConfigManager):
        self._url  = cfg.get("couchdb_url",  "http://localhost:5984")
        self._user = cfg.get("couchdb_user", "admin")
        self._pass = cfg.get("couchdb_pass", "")

    def _req(self, path: str, method="GET", body=None) -> dict | None:
        url = self._url.rstrip("/") + path
        req = urllib.request.Request(url, method=method)
        import base64
        creds = base64.b64encode(
            f"{self._user}:{self._pass}".encode()).decode()
        req.add_header("Authorization", f"Basic {creds}")
        req.add_header("Content-Type", "application/json")
        if body:
            req.data = json.dumps(body).encode()
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.load(resp)
        except Exception:
            return None

    def ping(self) -> bool:
        return self._req("/") is not None

    def list_dbs(self) -> list[str]:
        r = self._req("/_all_dbs")
        return r if isinstance(r, list) else []

    def db_info(self, db: str) -> dict:
        r = self._req(f"/{db}")
        return r or {}

    def compact(self, db: str) -> bool:
        r = self._req(f"/{db}/_compact", method="POST")
        return bool(r and r.get("ok"))

    def delete_db(self, db: str) -> bool:
        r = self._req(f"/{db}", method="DELETE")
        return bool(r and r.get("ok"))

    def replicate(self, source: str, target: str, db: str) -> bool:
        body = {"source": f"{source}/{db}",
                "target": f"{target}/{db}",
                "create_target": True}
        r = self._req("/_replicate", method="POST", body=body)
        return bool(r and r.get("ok"))

    def active_tasks(self) -> list[dict]:
        r = self._req("/_active_tasks")
        return r if isinstance(r, list) else []


# ─── Güncelleme Pipeline ──────────────────────────────────────────────────────

def run_update(cfg: ConfigManager,
               backup_mgr: BackupManager,
               summary_mgr: SummaryManager,
               log: LogFn,
               step_cb=None,      # step_cb(step_index)
               auto_backup=True,
               build=True) -> bool:
    """
    Tam güncelleme akışı:
      0: Yedek  1: Fetch  2: Reset  3: Build  4: Bitti
    """
    def step(i):
        if step_cb:
            step_cb(i)

    t0 = time.time()
    errors = []

    # 0 — Yedek
    step(0)
    if auto_backup:
        log("── Yedek alınıyor ──", "info")
        try:
            backup_mgr.create(label="Otomatik (güncelleme öncesi)", log_fn=log)
        except Exception as e:
            log(f"Yedek hatası: {e}", "warning")

    # 1 — Fetch
    step(1)
    log("── Git fetch ──", "info")
    if not git_fetch(cfg, log):
        errors.append("fetch")

    # 2 — Reset
    step(2)
    log("── Git reset ──", "info")
    if not git_reset(cfg, log):
        errors.append("reset")
        log("⚠ Reset başarısız — pull deneniyor", "warning")
        git_pull(cfg, log)

    # 3 — Build
    step(3)
    if build:
        log("── Docker build ──", "info")
        if not docker_build(cfg, log):
            errors.append("build")

    # 4 — Bitti
    step(4)
    elapsed = time.time() - t0
    ok = len(errors) == 0

    summary_mgr.record({
        "timestamp": time.strftime("%d.%m.%Y %H:%M"),
        "git_hash":  git_current_hash(),
        "duration":  round(elapsed, 1),
        "status":    "success" if ok else "error",
        "errors":    errors,
    })

    if ok:
        log(f"✓ Güncelleme tamamlandı ({elapsed:.1f}s)", "success")
    else:
        log(f"✗ Güncelleme hata ile bitti: {errors}", "error")
    return ok
