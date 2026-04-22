"""
MERT.4 Updater v2 — cloud.py
Telegram bildirimleri, SSH sync, S3/R2 cloud upload.
"""
from __future__ import annotations
import os, hmac, hashlib, datetime, json, urllib.request, urllib.error, subprocess
from .core import ConfigManager

# ─── Telegram ────────────────────────────────────────────────────────────────

def tg_send(cfg: ConfigManager, text: str) -> bool:
    token   = cfg.get("telegram_token")
    chat_id = cfg.get("telegram_chat_id")
    if not token or not chat_id:
        return False
    url  = f"https://api.telegram.org/bot{token}/sendMessage"
    body = json.dumps({"chat_id": chat_id, "text": text,
                       "parse_mode": "HTML"}).encode()
    req  = urllib.request.Request(url, data=body,
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.load(r).get("ok", False)
    except Exception:
        return False


def tg_test(cfg: ConfigManager) -> bool:
    return tg_send(cfg, "✅ MERT.4 Güncelleme Merkezi — test mesajı")


# ─── SSH Sync ────────────────────────────────────────────────────────────────

def ssh_sync(cfg: ConfigManager, log_fn=None) -> bool:
    log = log_fn or (lambda m, t="dim": None)

    host      = cfg.get("ssh_host")
    port      = cfg.get("ssh_port", "22")
    user      = cfg.get("ssh_user")
    password  = cfg.get("ssh_pass")
    key_path  = cfg.get("ssh_key_path")
    remote    = cfg.get("ssh_remote_path", "/var/www/mert4")

    if not host or not user:
        log("SSH yapılandırması eksik!", "error")
        return False

    from .core import REPO_DIR

    # rsync varsa tercih et
    rsync = _which("rsync")
    if rsync:
        cmd = [rsync, "-avz", "--delete",
               "-e", f"ssh -p {port}" + (f" -i {key_path}" if key_path else ""),
               f"{REPO_DIR}/", f"{user}@{host}:{remote}/"]
        log(f"▶ rsync {user}@{host}:{remote}", "info")
        return _shell_run(cmd, log)

    # scp fallback — dizin kopyala
    scp = _which("scp")
    if scp:
        cmd = [scp, "-r", "-P", port]
        if key_path:
            cmd += ["-i", key_path]
        cmd += [REPO_DIR, f"{user}@{host}:{remote}"]
        log(f"▶ scp {user}@{host}:{remote}", "info")
        return _shell_run(cmd, log)

    log("rsync veya scp bulunamadı!", "error")
    return False


def ssh_test(cfg: ConfigManager) -> tuple[bool, str]:
    host = cfg.get("ssh_host")
    port = cfg.get("ssh_port", "22")
    user = cfg.get("ssh_user")
    key  = cfg.get("ssh_key_path")
    if not host or not user:
        return False, "SSH yapılandırması eksik"
    cmd = ["ssh", "-p", port, "-o", "ConnectTimeout=5",
           "-o", "StrictHostKeyChecking=no"]
    if key:
        cmd += ["-i", key]
    cmd += [f"{user}@{host}", "echo OK"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            return True, "Bağlantı başarılı"
        return False, r.stderr.strip() or "Bağlanamadı"
    except Exception as e:
        return False, str(e)


# ─── Cloud (S3 / R2 / MinIO) ─────────────────────────────────────────────────

def cloud_upload(cfg: ConfigManager, file_path: str,
                 log_fn=None) -> bool:
    log = log_fn or (lambda m, t="dim": None)

    if not os.path.exists(file_path):
        log(f"Dosya bulunamadı: {file_path}", "error")
        return False

    # 1. aws CLI
    if _which("aws"):
        return _upload_aws(cfg, file_path, log)

    # 2. rclone
    if _which("rclone"):
        return _upload_rclone(cfg, file_path, log)

    # 3. Pure Python Sig V4
    return _upload_sigv4(cfg, file_path, log)


def cloud_test(cfg: ConfigManager) -> tuple[bool, str]:
    endpoint  = cfg.get("cloud_endpoint")
    bucket    = cfg.get("cloud_bucket")
    access    = cfg.get("cloud_access_key")
    secret    = cfg.get("cloud_secret_key")
    if not all([endpoint, bucket, access, secret]):
        return False, "Cloud yapılandırması eksik"
    # Bucket HEAD isteği
    try:
        url = endpoint.rstrip("/") + f"/{bucket}"
        req = urllib.request.Request(url, method="HEAD")
        _sign_request(req, access, secret, bucket, "", b"", endpoint)
        with urllib.request.urlopen(req, timeout=8):
            pass
        return True, "Bağlantı başarılı"
    except urllib.error.HTTPError as e:
        if e.code in (200, 403, 301):
            return True, f"HTTP {e.code} — erişilebilir"
        return False, f"HTTP {e.code}"
    except Exception as e:
        return False, str(e)


# ─── İç yardımcılar ──────────────────────────────────────────────────────────

def _which(cmd: str) -> str | None:
    from shutil import which
    return which(cmd)


def _shell_run(cmd: list, log) -> bool:
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                log(line, "dim")
        proc.wait(timeout=300)
        return proc.returncode == 0
    except Exception as e:
        log(str(e), "error")
        return False


def _upload_aws(cfg: ConfigManager, path: str, log) -> bool:
    endpoint = cfg.get("cloud_endpoint")
    bucket   = cfg.get("cloud_bucket")
    prefix   = cfg.get("cloud_prefix", "mert4-backups/")
    key      = cfg.get("cloud_access_key")
    secret   = cfg.get("cloud_secret_key")
    fname    = os.path.basename(path)
    dest     = f"s3://{bucket}/{prefix}{fname}"

    env = os.environ.copy()
    env["AWS_ACCESS_KEY_ID"]     = key
    env["AWS_SECRET_ACCESS_KEY"] = secret

    cmd = ["aws", "s3", "cp", path, dest]
    if endpoint:
        cmd += ["--endpoint-url", endpoint]

    log(f"▶ aws s3 cp → {dest}", "info")
    try:
        proc = subprocess.Popen(cmd, env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True)
        for line in proc.stdout:
            log(line.rstrip(), "dim")
        proc.wait(timeout=300)
        ok = proc.returncode == 0
        log("✓ Upload tamamlandı" if ok else "✗ Upload başarısız", "success" if ok else "error")
        return ok
    except Exception as e:
        log(str(e), "error")
        return False


def _upload_rclone(cfg: ConfigManager, path: str, log) -> bool:
    bucket = cfg.get("cloud_bucket")
    prefix = cfg.get("cloud_prefix", "mert4-backups/")
    fname  = os.path.basename(path)
    dest   = f"mert4remote:{bucket}/{prefix}{fname}"
    cmd    = ["rclone", "copyto", path, dest, "--progress"]
    log(f"▶ rclone copyto → {dest}", "info")
    return _shell_run(cmd, log)


def _upload_sigv4(cfg: ConfigManager, path: str, log) -> bool:
    endpoint = cfg.get("cloud_endpoint", "").rstrip("/")
    bucket   = cfg.get("cloud_bucket")
    prefix   = cfg.get("cloud_prefix", "mert4-backups/")
    access   = cfg.get("cloud_access_key")
    secret   = cfg.get("cloud_secret_key")
    fname    = os.path.basename(path)
    key_path = f"{prefix}{fname}"

    if not all([endpoint, bucket, access, secret]):
        log("Cloud yapılandırması eksik!", "error")
        return False

    with open(path, "rb") as f:
        body = f.read()

    url = f"{endpoint}/{bucket}/{key_path}"
    req = urllib.request.Request(url, data=body, method="PUT")
    req.add_header("Content-Type", "application/octet-stream")
    _sign_request(req, access, secret, bucket, key_path, body, endpoint)

    log(f"▶ PUT {url}", "info")
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            ok = r.status in (200, 201, 204)
            log("✓ Upload tamamlandı" if ok else f"HTTP {r.status}", "success" if ok else "error")
            return ok
    except urllib.error.HTTPError as e:
        log(f"HTTP {e.code}: {e.reason}", "error")
        return False
    except Exception as e:
        log(str(e), "error")
        return False


def _sign_request(req: urllib.request.Request,
                  access: str, secret: str,
                  bucket: str, key: str,
                  body: bytes, endpoint: str):
    """AWS Signature Version 4 — minimal PUT imzalama."""
    now   = datetime.datetime.utcnow()
    date  = now.strftime("%Y%m%d")
    dtime = now.strftime("%Y%m%dT%H%M%SZ")

    # Parse region from endpoint (r2: *.r2.cloudflarestorage.com → auto)
    region = "auto"
    service = "s3"

    payload_hash = hashlib.sha256(body).hexdigest()
    host = req.host or urllib.request.urlparse(endpoint).netloc

    headers = {
        "x-amz-date":           dtime,
        "x-amz-content-sha256": payload_hash,
        "host":                  host,
    }

    signed_headers = ";".join(sorted(headers.keys()))
    canonical_headers = "".join(f"{k}:{v}\n" for k, v in sorted(headers.items()))
    canonical_path = f"/{bucket}/{key}" if key else f"/{bucket}"
    canonical_req  = "\n".join([
        req.get_method(), canonical_path, "",
        canonical_headers, signed_headers, payload_hash
    ])

    scope      = f"{date}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256", dtime, scope,
        hashlib.sha256(canonical_req.encode()).hexdigest()
    ])

    def hmac_sha256(key, msg):
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()

    signing_key = hmac_sha256(
        hmac_sha256(
            hmac_sha256(
                hmac_sha256(f"AWS4{secret}".encode(), date),
                region),
            service),
        "aws4_request")

    sig = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()

    auth = (f"AWS4-HMAC-SHA256 Credential={access}/{scope}, "
            f"SignedHeaders={signed_headers}, Signature={sig}")

    for k, v in headers.items():
        req.add_header(k, v)
    req.add_header("Authorization", auth)
