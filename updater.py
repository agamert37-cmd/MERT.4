#!/usr/bin/env python3
"""
MERT.4 Proje Güncelleme Aracı  v4.0
Windows GUI uygulaması - Git & Docker & CouchDB işlemleri
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import subprocess
import threading
import os
import datetime
import time
import webbrowser
import json
import shutil
import re
import math
import urllib.request

# ─── Ayarlar ────────────────────────────────────────────────────────────────
REPO_DIR              = os.path.dirname(os.path.abspath(__file__))
REMOTE                = "origin"
BRANCH                = "main"
APP_URL               = "http://localhost:8080"
STATUS_REFRESH_MS     = 30_000   # 30 saniye
CONSOLE_MAX_LINES     = 1_200    # bu limitin üstünde eski satırlar silinir
BACKUP_DIR            = os.path.join(REPO_DIR, ".mert4_backups")
BACKUP_INDEX          = os.path.join(BACKUP_DIR, "index.json")
DOCKER_IMAGE_NAME     = "mert4-mert-site"   # docker image adı
MAX_BACKUPS           = 10                  # en fazla kaç yedek saklanır
SUMMARY_FILE          = os.path.join(REPO_DIR, ".mert4_backups", "summary.json")
COUCHDB_URL           = "http://localhost:5984"
COUCHDB_SETUP_SCRIPT  = os.path.join(REPO_DIR, "couchdb-setup.sh")
COUCHDB_CONTAINER     = "mert-couchdb"
COUCHDB_DBS           = [
    "mert_fisler", "mert_urunler", "mert_cari_hesaplar", "mert_kasa_islemleri",
    "mert_personeller", "mert_bankalar", "mert_cekler", "mert_araclar",
    "mert_arac_shifts", "mert_arac_km_logs", "mert_uretim_profilleri",
    "mert_uretim_kayitlari", "mert_faturalar", "mert_fatura_stok",
    "mert_tahsilatlar", "mert_kv",
]

# ─── Renkler (Catppuccin Mocha) ──────────────────────────────────────────────
BG_DARK   = "#1e1e2e"
BG_CARD   = "#2a2a3d"
BG_INPUT  = "#313244"
FG_TEXT   = "#cdd6f4"
FG_DIM    = "#7f849c"
FG_TITLE  = "#f5c2e7"
ACCENT    = "#89b4fa"
ACCENT_H  = "#6da3f5"
SUCCESS   = "#a6e3a1"
SUCCESS_H = "#88d08a"
WARNING   = "#f9e2af"
WARNING_H = "#e8ce95"
ERROR     = "#f38ba8"
ERROR_H   = "#de6f88"
PURPLE    = "#cba6f7"
PURPLE_H  = "#b48ef0"
TEAL      = "#94e2d5"
TEAL_H    = "#78cfc2"
PEACH     = "#fab387"
PEACH_H   = "#e89a72"
NEUTRAL_H = "#6a7090"
BORDER    = "#45475a"


# ─── Yardımcılar ─────────────────────────────────────────────────────────────

def _hover_color(base: str) -> str:
    try:
        r, g, b = int(base[1:3], 16), int(base[3:5], 16), int(base[5:7], 16)
        return f"#{max(0,r-22):02x}{max(0,g-22):02x}{max(0,b-22):02x}"
    except Exception:
        return base


def _bind_hover(widget: tk.Widget, normal: str, hover: str):
    widget.bind("<Enter>", lambda e: widget.configure(bg=hover))
    widget.bind("<Leave>", lambda e: widget.configure(bg=normal))


# ─── Yedekleme Yöneticisi ─────────────────────────────────────────────────────

class BackupManager:
    """Git hash + isteğe bağlı Docker image yedekleme/geri yükleme."""

    def __init__(self):
        os.makedirs(BACKUP_DIR, exist_ok=True)

    # ── Index okuma/yazma ──────────────────────────────────────────────────────
    def _load_index(self) -> list:
        if not os.path.exists(BACKUP_INDEX):
            return []
        try:
            with open(BACKUP_INDEX, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save_index(self, index: list):
        with open(BACKUP_INDEX, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, indent=2)

    # ── Yedek oluştur ─────────────────────────────────────────────────────────
    def create(self, label: str = "", include_docker: bool = False,
               log_fn=None) -> dict | None:
        """
        Yedek oluşturur.
        - Git hash'i kaydeder (her zaman)
        - include_docker=True ise docker image'ı da tar olarak yedekler
        log_fn: oluşturulan satırları loglamak için callback(msg, tag)
        """
        def log(msg, tag="dim"):
            if log_fn:
                log_fn(msg, tag)

        ts = datetime.datetime.now()
        backup_id = ts.strftime("%Y%m%d_%H%M%S")
        ts_str    = ts.strftime("%d.%m.%Y %H:%M:%S")

        # Git bilgileri
        try:
            r = subprocess.run(
                ["git", "log", "--format=%H|%s|%ar", "-1"],
                cwd=REPO_DIR, capture_output=True, text=True, timeout=10
            )
            parts = r.stdout.strip().split("|", 2) if r.returncode == 0 else []
            git_hash = parts[0] if parts else "unknown"
            git_msg  = parts[1] if len(parts) > 1 else ""
            git_ago  = parts[2] if len(parts) > 2 else ""
        except Exception:
            git_hash = "unknown"
            git_msg  = ""
            git_ago  = ""

        # Docker image yedekleme (opsiyonel)
        docker_file = None
        if include_docker:
            tar_path = os.path.join(BACKUP_DIR, f"docker_{backup_id}.tar")
            log(f"Docker image kaydediliyor → {os.path.basename(tar_path)}", "dim")
            try:
                r = subprocess.run(
                    ["docker", "save", "-o", tar_path, DOCKER_IMAGE_NAME],
                    capture_output=True, text=True, timeout=300
                )
                if r.returncode == 0:
                    size_mb = os.path.getsize(tar_path) / (1024 * 1024)
                    log(f"Docker image yedeklendi ({size_mb:.1f} MB)", "success")
                    docker_file = os.path.basename(tar_path)
                else:
                    log(f"Docker yedekleme başarısız: {r.stderr.strip()}", "warning")
            except Exception as e:
                log(f"Docker yedekleme hatası: {e}", "warning")

        entry = {
            "id":           backup_id,
            "timestamp":    ts_str,
            "label":        label or "Manuel yedek",
            "git_hash":     git_hash,
            "git_hash_short": git_hash[:7],
            "git_msg":      git_msg,
            "git_ago":      git_ago,
            "docker_file":  docker_file,
        }

        index = self._load_index()
        index.insert(0, entry)

        # Eski yedekleri temizle
        if len(index) > MAX_BACKUPS:
            removed = index[MAX_BACKUPS:]
            index   = index[:MAX_BACKUPS]
            for old in removed:
                if old.get("docker_file"):
                    old_path = os.path.join(BACKUP_DIR, old["docker_file"])
                    try:
                        os.remove(old_path)
                    except Exception:
                        pass

        self._save_index(index)
        log(f"✓ Yedek oluşturuldu: {backup_id}  ({git_hash[:7]}  {git_msg[:50]})", "success")
        return entry

    # ── Geri yükle ────────────────────────────────────────────────────────────
    def restore(self, backup_id: str, compose_cmd: str,
                log_fn=None) -> bool:
        """Verilen yedeğe geri döner."""
        def log(msg, tag="dim"):
            if log_fn:
                log_fn(msg, tag)

        index = self._load_index()
        entry = next((e for e in index if e["id"] == backup_id), None)
        if not entry:
            log(f"Yedek bulunamadı: {backup_id}", "error")
            return False

        git_hash = entry["git_hash"]
        log(f"Geri yükleme başlatılıyor → {entry['timestamp']}  ({git_hash[:7]})", "info")

        # Docker image geri yükle (varsa)
        docker_ok = False
        if entry.get("docker_file"):
            tar_path = os.path.join(BACKUP_DIR, entry["docker_file"])
            if os.path.exists(tar_path):
                log("Docker image geri yükleniyor...", "dim")
                r = subprocess.run(
                    ["docker", "load", "-i", tar_path],
                    capture_output=True, text=True, timeout=300
                )
                if r.returncode == 0:
                    log("Docker image geri yüklendi.", "success")
                    docker_ok = True
                else:
                    log(f"Docker load hatası: {r.stderr.strip()}", "warning")

        # Container durdur
        log("Container durduruluyor...", "dim")
        subprocess.run(f"{compose_cmd} down", shell=True, cwd=REPO_DIR,
                       capture_output=True, text=True, timeout=60)

        # Git hash'e dön
        log(f"Kod geri yükleniyor: git checkout {git_hash[:7]}...", "dim")
        r = subprocess.run(
            ["git", "checkout", git_hash],
            cwd=REPO_DIR, capture_output=True, text=True, timeout=30
        )
        if r.returncode != 0:
            log(f"Git checkout hatası: {r.stderr.strip()}", "error")
            return False
        log(f"Kod geri yüklendi: {git_hash[:7]}", "success")

        # Container'ı yeniden başlat (docker image varsa up -d, yoksa build et)
        if docker_ok:
            log("Container yedek image ile başlatılıyor...", "dim")
            subprocess.run(f"{compose_cmd} up -d", shell=True, cwd=REPO_DIR,
                           capture_output=True, text=True, timeout=60)
        else:
            log("Docker image yoktu, yeniden build ediliyor...", "dim")
            subprocess.run(f"{compose_cmd} up --build -d", shell=True, cwd=REPO_DIR,
                           capture_output=True, text=True, timeout=600)

        log("━━━ Geri yükleme tamamlandı! ━━━", "success")
        return True

    # ── Liste ─────────────────────────────────────────────────────────────────
    def list(self) -> list:
        return self._load_index()

    def delete(self, backup_id: str):
        index = self._load_index()
        entry = next((e for e in index if e["id"] == backup_id), None)
        if entry and entry.get("docker_file"):
            try:
                os.remove(os.path.join(BACKUP_DIR, entry["docker_file"]))
            except Exception:
                pass
        index = [e for e in index if e["id"] != backup_id]
        self._save_index(index)


# ─── Özet Yöneticisi ──────────────────────────────────────────────────────────

class SummaryManager:
    """Her güncelleme sonrası özet kaydeder ve okur."""

    MAX_HISTORY = 20   # saklanacak maksimum özet sayısı

    def _load(self) -> list:
        if not os.path.exists(SUMMARY_FILE):
            return []
        try:
            with open(SUMMARY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save(self, data: list):
        os.makedirs(os.path.dirname(SUMMARY_FILE), exist_ok=True)
        with open(SUMMARY_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def record(self, entry: dict):
        """Yeni bir özet ekler (en başa)."""
        history = self._load()
        history.insert(0, entry)
        history = history[:self.MAX_HISTORY]
        self._save(history)

    def all(self) -> list:
        return self._load()


def _collect_update_diff(old_hash: str) -> dict:
    """
    old_hash: güncelleme öncesi HEAD hash'i
    Döndürür: {commits: [...], files_changed: int, insertions: int, deletions: int, diff_stat: str}
    """
    result = {
        "commits": [],
        "files_changed": 0,
        "insertions": 0,
        "deletions": 0,
        "diff_stat": "",
    }
    if not old_hash or old_hash == "unknown":
        return result

    # Yeni gelen commitler
    try:
        r = subprocess.run(
            ["git", "log", f"{old_hash}..HEAD", "--format=%h|%s|%ar"],
            cwd=REPO_DIR, capture_output=True, text=True, timeout=10
        )
        if r.returncode == 0:
            for line in r.stdout.strip().splitlines():
                parts = line.split("|", 2)
                if len(parts) == 3:
                    result["commits"].append({
                        "hash": parts[0], "msg": parts[1], "ago": parts[2]
                    })
    except Exception:
        pass

    # Dosya istatistikleri
    try:
        r = subprocess.run(
            ["git", "diff", "--shortstat", old_hash, "HEAD"],
            cwd=REPO_DIR, capture_output=True, text=True, timeout=10
        )
        stat = r.stdout.strip()
        result["diff_stat"] = stat
        # "3 files changed, 42 insertions(+), 7 deletions(-)"
        m = re.search(r"(\d+) file", stat)
        if m:
            result["files_changed"] = int(m.group(1))
        m = re.search(r"(\d+) insertion", stat)
        if m:
            result["insertions"] = int(m.group(1))
        m = re.search(r"(\d+) deletion", stat)
        if m:
            result["deletions"] = int(m.group(1))
    except Exception:
        pass

    return result


# ─── Grafik Motoru (saf tkinter Canvas) ───────────────────────────────────────

class ChartCanvas:
    """
    Yeniden kullanılabilir Canvas tabanlı grafik çizici.
    Çizgi, çubuk ve gösterge (gauge) grafikleri destekler.
    """

    ML, MR, MT, MB = 42, 12, 22, 28   # kenar boşlukları (px)

    def __init__(self, parent: tk.Widget, width: int, height: int,
                 title: str, bg: str = "#1e1e2e"):
        self.w      = width
        self.h      = height
        self.title  = title
        self.bg     = bg
        self.canvas = tk.Canvas(parent, width=width, height=height,
                                bg=bg, highlightthickness=0, bd=0)

    # ── İç koordinat sistemi ────────────────────────────────────────────────
    def _px(self, x_norm: float) -> float:
        """0‥1 → piksel X (sol→sağ, kenar boşlukları dahil)."""
        return self.ML + x_norm * (self.w - self.ML - self.MR)

    def _py(self, y_norm: float) -> float:
        """0‥1 → piksel Y (0=alt, 1=üst)."""
        return self.MT + (1 - y_norm) * (self.h - self.MT - self.MB)

    # ── Temizle ─────────────────────────────────────────────────────────────
    def clear(self):
        self.canvas.delete("all")
        # Başlık
        self.canvas.create_text(
            self.w // 2, 11, text=self.title,
            font=("Segoe UI", 8, "bold"), fill="#7f849c", anchor="center"
        )

    # ── Yatay grid çizgileri ─────────────────────────────────────────────────
    def _draw_grid(self, n: int = 4, color: str = "#2a2a3d"):
        for i in range(n + 1):
            y = self._py(i / n)
            self.canvas.create_line(
                self._px(0), y, self._px(1), y,
                fill=color, dash=(2, 4)
            )

    # ── Y ekseni etiketleri ─────────────────────────────────────────────────
    def _y_labels(self, vmin: float, vmax: float, n: int = 4, fmt: str = "{:.0f}"):
        for i in range(n + 1):
            v = vmin + (vmax - vmin) * i / n
            y = self._py(i / n)
            self.canvas.create_text(
                self.ML - 4, y, text=fmt.format(v),
                font=("Consolas", 7), fill="#555577", anchor="e"
            )

    # ── Çizgi grafik ────────────────────────────────────────────────────────
    def draw_line(self, values: list[float], color: str,
                  fill_color: str = "", dot_color: str = "",
                  x_labels: list[str] | None = None,
                  y_fmt: str = "{:.1f}", grid: bool = True):
        """values: sayı listesi (en eskiden en yeniye)."""
        self.clear()
        if len(values) < 2:
            self.canvas.create_text(
                self.w // 2, self.h // 2, text="Veri yok",
                font=("Segoe UI", 8), fill="#555577"
            )
            return

        vmin = min(values) * 0.9
        vmax = max(values) * 1.1 if max(values) > 0 else 1
        n    = len(values)

        if grid:
            self._draw_grid(4)
        self._y_labels(vmin, vmax, 4, y_fmt)

        # Normalize
        def norm_y(v): return (v - vmin) / (vmax - vmin) if vmax != vmin else 0.5

        pts = [(self._px(i / (n - 1)), self._py(norm_y(v)))
               for i, v in enumerate(values)]

        # Dolu alan (fill)
        if fill_color:
            poly = [pts[0][0], self._py(0)]
            for px, py in pts:
                poly += [px, py]
            poly += [pts[-1][0], self._py(0)]
            self.canvas.create_polygon(poly, fill=fill_color, outline="", smooth=True)

        # Çizgi
        flat = [c for p in pts for c in p]
        self.canvas.create_line(*flat, fill=color, width=2, smooth=True)

        # Noktalar + değer etiketleri
        dc = dot_color or color
        for i, (px, py) in enumerate(pts):
            self.canvas.create_oval(px-3, py-3, px+3, py+3, fill=dc, outline=self.bg)
            # Son noktaya değer yaz
            if i == n - 1 or n <= 8:
                self.canvas.create_text(
                    px, py - 9, text=y_fmt.format(values[i]),
                    font=("Consolas", 7), fill=color, anchor="center"
                )

        # X ekseni etiketleri
        if x_labels:
            step = max(1, n // 6)
            for i, lbl in enumerate(x_labels):
                if i % step == 0 or i == n - 1:
                    px = self._px(i / (n - 1))
                    self.canvas.create_text(
                        px, self.h - 8, text=lbl,
                        font=("Consolas", 7), fill="#555577", anchor="center"
                    )

    # ── Çubuk grafik (ikili: yeşil/kırmızı) ─────────────────────────────────
    def draw_bars(self, pos_vals: list[float], neg_vals: list[float],
                  pos_color: str = "#a6e3a1", neg_color: str = "#f38ba8",
                  x_labels: list[str] | None = None, grid: bool = True):
        """pos_vals: eklemeler, neg_vals: silmeler (mutlak değer)."""
        self.clear()
        n = max(len(pos_vals), len(neg_vals))
        if n == 0:
            self.canvas.create_text(
                self.w // 2, self.h // 2, text="Veri yok",
                font=("Segoe UI", 8), fill="#555577"
            )
            return

        # Maksimum değer
        combined = list(pos_vals) + list(neg_vals)
        vmax = max(combined) if combined else 1
        if vmax == 0:
            vmax = 1

        if grid:
            self._draw_grid(4)
        self._y_labels(0, vmax, 4)

        bar_w_total = (self.w - self.ML - self.MR) / max(n, 1)
        gap         = max(1, bar_w_total * 0.1)
        bar_w       = (bar_w_total - gap * 3) / 2

        for i in range(n):
            cx = self._px(i / max(n - 1, 1)) if n > 1 else self._px(0.5)
            base_y = self._py(0)

            # Ekleme çubuğu (sol)
            if i < len(pos_vals) and pos_vals[i] > 0:
                h_px = (pos_vals[i] / vmax) * (self.h - self.MT - self.MB)
                x0 = cx - bar_w - gap / 2
                self.canvas.create_rectangle(
                    x0, base_y - h_px, x0 + bar_w, base_y,
                    fill=pos_color, outline="", width=0
                )

            # Silme çubuğu (sağ)
            if i < len(neg_vals) and neg_vals[i] > 0:
                h_px = (neg_vals[i] / vmax) * (self.h - self.MT - self.MB)
                x0 = cx + gap / 2
                self.canvas.create_rectangle(
                    x0, base_y - h_px, x0 + bar_w, base_y,
                    fill=neg_color, outline="", width=0
                )

        # X etiketleri
        if x_labels:
            step = max(1, n // 6)
            for i, lbl in enumerate(x_labels):
                if i % step == 0 or i == n - 1:
                    cx = self._px(i / max(n - 1, 1)) if n > 1 else self._px(0.5)
                    self.canvas.create_text(
                        cx, self.h - 8, text=lbl,
                        font=("Consolas", 7), fill="#555577", anchor="center"
                    )

        # Legend
        self.canvas.create_rectangle(self.ML, 13, self.ML + 8, 19,
                                     fill=pos_color, outline="")
        self.canvas.create_text(self.ML + 11, 16, text="+ekle",
                                font=("Consolas", 7), fill=pos_color, anchor="w")
        self.canvas.create_rectangle(self.ML + 48, 13, self.ML + 56, 19,
                                     fill=neg_color, outline="")
        self.canvas.create_text(self.ML + 59, 16, text="-sil",
                                font=("Consolas", 7), fill=neg_color, anchor="w")

    # ── Gösterge (Gauge / Arc) ───────────────────────────────────────────────
    def draw_gauge(self, value: float, max_val: float,
                   label: str, unit: str,
                   low_color: str = "#a6e3a1",
                   mid_color: str = "#f9e2af",
                   high_color: str = "#f38ba8",
                   history: list[float] | None = None):
        """Yarım daire gösterge + mini geçmiş çizgisi."""
        self.clear()

        pct   = min(1.0, value / max_val) if max_val > 0 else 0
        cx    = self.w // 2
        cy    = int(self.h * 0.62)
        r     = min(cx - self.ML - 4, cy - self.MT - 4)

        # Arka plan yayı
        self.canvas.create_arc(
            cx - r, cy - r, cx + r, cy + r,
            start=0, extent=180,
            style="arc", outline="#2a2a3d", width=10
        )

        # Renk seç
        if pct < 0.5:
            arc_color = low_color
        elif pct < 0.8:
            arc_color = mid_color
        else:
            arc_color = high_color

        # Değer yayı
        extent = pct * 180
        if extent > 0:
            self.canvas.create_arc(
                cx - r, cy - r, cx + r, cy + r,
                start=180 - extent, extent=extent,
                style="arc", outline=arc_color, width=10
            )

        # İbre
        angle_rad = math.pi * (1 - pct)
        ix = cx + (r - 14) * math.cos(angle_rad)
        iy = cy - (r - 14) * math.sin(angle_rad)
        self.canvas.create_line(cx, cy, ix, iy, fill="#cdd6f4", width=2)
        self.canvas.create_oval(cx-4, cy-4, cx+4, cy+4, fill="#cdd6f4", outline="")

        # Değer metni
        val_str = f"{value:.1f}{unit}" if isinstance(value, float) else f"{value}{unit}"
        self.canvas.create_text(
            cx, cy - r // 3,
            text=val_str, font=("Segoe UI", 12, "bold"),
            fill=arc_color, anchor="center"
        )
        self.canvas.create_text(
            cx, cy - r // 3 + 16,
            text=label, font=("Segoe UI", 7),
            fill="#7f849c", anchor="center"
        )

        # Min/Max etiketleri
        self.canvas.create_text(
            cx - r - 2, cy + 6, text="0",
            font=("Consolas", 7), fill="#555577", anchor="e"
        )
        self.canvas.create_text(
            cx + r + 2, cy + 6, text=str(int(max_val)),
            font=("Consolas", 7), fill="#555577", anchor="w"
        )

        # Mini geçmiş çizgisi (altta)
        if history and len(history) >= 2:
            hmax   = max(history) or 1
            hx0    = self.ML
            hx1    = self.w - self.MR
            hy0    = self.h - 6
            hy1    = cy + 8
            hrange = hy0 - hy1
            pts    = []
            for i, v in enumerate(history):
                hx = hx0 + (hx1 - hx0) * i / (len(history) - 1)
                hy = hy0 - (v / hmax) * hrange
                pts += [hx, hy]
            if len(pts) >= 4:
                self.canvas.create_line(*pts, fill=arc_color,
                                        width=1, smooth=True)


def _detect_compose_cmd() -> str:
    """docker compose (V2) varsa onu kullan, yoksa docker-compose (V1) ile dön."""
    try:
        r = subprocess.run(
            ["docker", "compose", "version"],
            capture_output=True, text=True, timeout=5
        )
        if r.returncode == 0:
            return "docker compose"
    except Exception:
        pass
    return "docker-compose"


# ─── Ana Uygulama ─────────────────────────────────────────────────────────────

class MertUpdater(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("MERT.4 — Güncelleme Merkezi")
        self.geometry("960x900")
        self.minsize(780, 640)
        self.configure(bg=BG_DARK)
        self.resizable(True, True)
        try:
            self.iconbitmap(default="")
        except Exception:
            pass

        self._running      = False
        self._task_start   = 0.0
        self._compose_cmd  = _detect_compose_cmd()
        self._behind_count = 0
        self._backup_mgr      = BackupManager()
        self._summary_mgr     = SummaryManager()
        self._pre_update_hash = ""
        # Canlı Docker istatistikleri
        self._cpu_history:  list[float] = []
        self._ram_history:  list[float] = []
        self._cpu_now       = 0.0
        self._ram_now       = 0.0
        self._ram_max       = 512.0    # MB — ilk varsayım, docker stats'tan güncellenir
        self._stats_after   = None

        # Sağlık monitörü
        self._health_ok         = False
        self._health_ms         = 0
        self._health_history:   list[float] = []   # response ms geçmişi
        self._health_up_since:  float | None = None  # uptime başlangıç epoch
        self._health_last_toast = 0.0  # son toast zamanı (spam önleme)

        # CouchDB monitörü
        self._couch_ok          = False
        self._couch_ms          = 0
        self._couch_history:    list[float] = []
        self._couch_doc_counts: dict[str, int] = {}
        self._couch_total_docs  = 0
        self._couch_up_since:   float | None = None

        # Otomatik güncelleme zamanlayıcısı
        self._auto_timer_active     = False
        self._auto_timer_remaining  = 0    # saniye
        self._auto_timer_after_id   = None
        self._auto_timer_intervals  = {"15 dk": 900, "30 dk": 1800,
                                        "1 sa": 3600, "2 sa": 7200}

        # Toast kuyruğu
        self._toast_widgets: list[tk.Frame] = []

        self._build_ui()
        self._check_status()
        self._schedule_status_refresh()

        # Kısayollar
        self.bind("<F5>",       lambda e: self._do_full_update())
        self.bind("<Control-r>", lambda e: self._do_update())
        self.bind("<Control-b>", lambda e: self._do_build())
        self.bind("<Control-l>", lambda e: self._clear_console())

    # ─── UI ─────────────────────────────────────────────────────────────────
    def _build_ui(self):
        # ── Başlık ──────────────────────────────────────────────────────────
        header = tk.Frame(self, bg=BG_DARK)
        header.pack(fill="x", padx=20, pady=(16, 4))

        self.title_lbl = tk.Label(
            header, text="⚙  MERT.4  Güncelleme Merkezi  v4.0",
            font=("Segoe UI", 17, "bold"), fg=FG_TITLE, bg=BG_DARK
        )
        self.title_lbl.pack(side="left")

        tk.Label(
            header, text=f"dal: {BRANCH}  •  compose: {self._compose_cmd}  •  CouchDB: :5984",
            font=("Segoe UI", 8), fg=FG_DIM, bg=BG_DARK
        ).pack(side="right", pady=(6, 0))

        # ── Durum kartı ─────────────────────────────────────────────────────
        scard = tk.Frame(self, bg=BG_CARD, highlightbackground=BORDER, highlightthickness=1)
        scard.pack(fill="x", padx=20, pady=(6, 4))

        sinner = tk.Frame(scard, bg=BG_CARD)
        sinner.pack(fill="x", padx=14, pady=10)

        self.status_dot = tk.Label(sinner, text="●", font=("Segoe UI", 14), fg=FG_DIM, bg=BG_CARD)
        self.status_dot.pack(side="left")

        self.status_label = tk.Label(
            sinner, text="Durum kontrol ediliyor...",
            font=("Segoe UI", 11), fg=FG_TEXT, bg=BG_CARD
        )
        self.status_label.pack(side="left", padx=(8, 0))

        # Sağlık göstergesi (app erişilebilirlik)
        self.health_dot = tk.Label(
            sinner, text="●", font=("Segoe UI", 11), fg=FG_DIM, bg=BG_CARD
        )
        self.health_dot.pack(side="left", padx=(16, 0))
        self.health_lbl = tk.Label(
            sinner, text="App kontrol ediliyor…",
            font=("Segoe UI", 9), fg=FG_DIM, bg=BG_CARD
        )
        self.health_lbl.pack(side="left", padx=(3, 0))

        # CouchDB sağlık göstergesi
        self.couch_dot = tk.Label(
            sinner, text="●", font=("Segoe UI", 11), fg=FG_DIM, bg=BG_CARD
        )
        self.couch_dot.pack(side="left", padx=(12, 0))
        self.couch_lbl = tk.Label(
            sinner, text="CouchDB kontrol ediliyor…",
            font=("Segoe UI", 9), fg=FG_DIM, bg=BG_CARD
        )
        self.couch_lbl.pack(side="left", padx=(3, 0))

        # Sağ taraf: commit bilgisi + "behind" badge + aç butonu
        right = tk.Frame(sinner, bg=BG_CARD)
        right.pack(side="right")

        self.behind_lbl = tk.Label(
            right, text="", font=("Segoe UI", 9, "bold"),
            fg=WARNING, bg=BG_CARD
        )
        self.behind_lbl.pack(side="right", padx=(6, 0))

        self.commit_label = tk.Label(
            right, text="", font=("Consolas", 9), fg=FG_DIM, bg=BG_CARD
        )
        self.commit_label.pack(side="right", padx=(0, 6))

        self.open_btn = tk.Button(
            right, text="🌐 Aç",
            command=lambda: webbrowser.open(APP_URL),
            font=("Segoe UI", 9), fg=BG_DARK, bg=ACCENT,
            relief="flat", cursor="hand2", padx=8, pady=2, bd=0
        )
        self.open_btn.pack(side="right", padx=(0, 8))
        _bind_hover(self.open_btn, ACCENT, ACCENT_H)

        # ── Ana butonlar ─────────────────────────────────────────────────────
        btn_frame = tk.Frame(self, bg=BG_DARK)
        btn_frame.pack(fill="x", padx=20, pady=(4, 2))

        buttons = [
            ("🔄  Güncelle",        self._do_update,    ACCENT,   ACCENT_H,  "Ctrl+R"),
            ("🔨  Build & Başlat",  self._do_build,     SUCCESS,  SUCCESS_H, "Ctrl+B"),
            ("♻  Yeniden Başlat",  self._do_restart,   TEAL,     TEAL_H,    ""),
            ("⏹  Durdur",          self._do_stop,      WARNING,  WARNING_H, ""),
            ("📋  Loglar",          self._do_logs,      FG_DIM,   NEUTRAL_H, ""),
            ("🗑  Temizle",         self._do_clean,     ERROR,    ERROR_H,   ""),
        ]

        for i, (text, cmd, color, hover, shortcut) in enumerate(buttons):
            lbl = text + (f"  [{shortcut}]" if shortcut else "")
            btn = tk.Button(
                btn_frame, text=lbl, command=cmd,
                font=("Segoe UI", 9, "bold"),
                fg=BG_DARK, bg=color, activebackground=hover,
                relief="flat", cursor="hand2",
                padx=10, pady=7, bd=0
            )
            btn.pack(side="left", padx=(0 if i == 0 else 5, 0), fill="x", expand=True)
            _bind_hover(btn, color, hover)

        # ── Tam güncelleme + diff satırı ─────────────────────────────────────
        quick_frame = tk.Frame(self, bg=BG_DARK)
        quick_frame.pack(fill="x", padx=20, pady=(2, 4))

        self.auto_var = tk.BooleanVar(value=True)
        tk.Checkbutton(
            quick_frame, text="Güncellemeden sonra otomatik build",
            variable=self.auto_var, font=("Segoe UI", 9),
            fg=FG_DIM, bg=BG_DARK, selectcolor=BG_CARD,
            activebackground=BG_DARK, activeforeground=FG_TEXT
        ).pack(side="left")

        diff_btn = tk.Button(
            quick_frame, text="🔍 Diff",
            command=self._do_show_diff,
            font=("Segoe UI", 9), fg=BG_DARK, bg=PURPLE,
            relief="flat", cursor="hand2", padx=10, pady=4, bd=0
        )
        diff_btn.pack(side="left", padx=(10, 0))
        _bind_hover(diff_btn, PURPLE, PURPLE_H)

        full_btn = tk.Button(
            quick_frame, text="⚡  Tek Tuşla: Güncelle + Build + Başlat  [F5]",
            command=self._do_full_update,
            font=("Segoe UI", 10, "bold"),
            fg=BG_DARK, bg=FG_TITLE, activebackground=_hover_color(FG_TITLE),
            relief="flat", cursor="hand2", padx=12, pady=4, bd=0
        )
        full_btn.pack(side="right")
        _bind_hover(full_btn, FG_TITLE, _hover_color(FG_TITLE))

        # ── Otomatik güncelleme zamanlayıcısı ────────────────────────────────
        timer_frame = tk.Frame(self, bg=BG_DARK)
        timer_frame.pack(fill="x", padx=20, pady=(0, 2))

        self._timer_toggle_btn = tk.Button(
            timer_frame, text="⏱  Otomatik Güncelleme: Kapalı",
            command=self._toggle_auto_timer,
            font=("Segoe UI", 9), fg=FG_DIM, bg=BG_CARD,
            relief="flat", cursor="hand2", padx=10, pady=3, bd=0
        )
        self._timer_toggle_btn.pack(side="left")
        _bind_hover(self._timer_toggle_btn, BG_CARD, "#353550")

        # Interval seçici
        self._timer_interval_var = tk.StringVar(value="30 dk")
        interval_menu = tk.OptionMenu(
            timer_frame, self._timer_interval_var,
            *self._auto_timer_intervals.keys()
        )
        interval_menu.config(
            font=("Segoe UI", 8), fg=FG_DIM, bg=BG_CARD,
            activebackground="#353550", relief="flat",
            highlightthickness=0, bd=0
        )
        interval_menu["menu"].config(bg=BG_CARD, fg=FG_TEXT, font=("Segoe UI", 8))
        interval_menu.pack(side="left", padx=(4, 0))

        self._timer_countdown_lbl = tk.Label(
            timer_frame, text="",
            font=("Consolas", 9), fg=TEAL, bg=BG_DARK
        )
        self._timer_countdown_lbl.pack(side="left", padx=(8, 0))

        # ── İlerleme çubuğu + süre etiketi ───────────────────────────────────
        prog_row = tk.Frame(self, bg=BG_DARK)
        prog_row.pack(fill="x", padx=20, pady=(4, 0))

        self.progress = ttk.Progressbar(prog_row, mode="indeterminate")
        self.progress.pack(side="left", fill="x", expand=True)

        self.elapsed_lbl = tk.Label(
            prog_row, text="", font=("Consolas", 9), fg=FG_DIM, bg=BG_DARK, width=10
        )
        self.elapsed_lbl.pack(side="right", padx=(6, 0))

        # ── Son commitler paneli ──────────────────────────────────────────────
        cbar = tk.Frame(self, bg=BG_DARK)
        cbar.pack(fill="x", padx=20, pady=(6, 0))

        tk.Label(
            cbar, text="Son Commitler",
            font=("Segoe UI", 9, "bold"), fg=FG_DIM, bg=BG_DARK
        ).pack(side="left")

        tk.Button(
            cbar, text="↺", command=self._refresh_commits,
            font=("Segoe UI", 9), fg=FG_DIM, bg=BG_DARK,
            relief="flat", cursor="hand2", bd=0, padx=4
        ).pack(side="left", padx=(4, 0))

        self.commits_box = tk.Text(
            self, font=("Consolas", 9), wrap="none",
            bg=BG_CARD, fg=FG_DIM, relief="flat", bd=0,
            padx=10, pady=6, height=4, state="disabled",
            highlightbackground=BORDER, highlightthickness=1
        )
        self.commits_box.pack(fill="x", padx=20, pady=(3, 0))
        self.commits_box.tag_configure("hash", foreground=ACCENT)
        self.commits_box.tag_configure("msg",  foreground=FG_TEXT)
        self.commits_box.tag_configure("date", foreground=FG_DIM)
        self.commits_box.tag_configure("new",  foreground=SUCCESS)

        # ── Yedekler paneli ──────────────────────────────────────────────────
        bbar = tk.Frame(self, bg=BG_DARK)
        bbar.pack(fill="x", padx=20, pady=(8, 0))

        tk.Label(
            bbar, text="Yedekler",
            font=("Segoe UI", 9, "bold"), fg=FG_DIM, bg=BG_DARK
        ).pack(side="left")

        # Manuel yedek al butonu
        man_btn = tk.Button(
            bbar, text="📦 Yedek Al",
            command=self._do_manual_backup,
            font=("Segoe UI", 8), fg=BG_DARK, bg=TEAL,
            relief="flat", cursor="hand2", bd=0, padx=8, pady=2
        )
        man_btn.pack(side="left", padx=(8, 0))
        _bind_hover(man_btn, TEAL, TEAL_H)

        # Docker image dahil et checkbox
        self.backup_docker_var = tk.BooleanVar(value=False)
        tk.Checkbutton(
            bbar, text="Docker image dahil",
            variable=self.backup_docker_var,
            font=("Segoe UI", 8), fg=FG_DIM, bg=BG_DARK,
            selectcolor=BG_CARD, activebackground=BG_DARK
        ).pack(side="left", padx=(10, 0))

        # Refresh
        tk.Button(
            bbar, text="↺", command=self._refresh_backups,
            font=("Segoe UI", 9), fg=FG_DIM, bg=BG_DARK,
            relief="flat", cursor="hand2", bd=0, padx=4
        ).pack(side="left", padx=(4, 0))

        # Yedekler listesi (kaydırmalı çerçeve)
        b_outer = tk.Frame(
            self, bg=BG_CARD,
            highlightbackground=BORDER, highlightthickness=1
        )
        b_outer.pack(fill="x", padx=20, pady=(3, 0))

        # Canvas + scrollbar ile kaydırılabilir yedek listesi
        self._backup_canvas = tk.Canvas(
            b_outer, bg=BG_CARD, height=90, highlightthickness=0
        )
        b_vsb = ttk.Scrollbar(b_outer, orient="vertical",
                               command=self._backup_canvas.yview)
        self._backup_canvas.configure(yscrollcommand=b_vsb.set)
        b_vsb.pack(side="right", fill="y")
        self._backup_canvas.pack(side="left", fill="both", expand=True)

        self._backup_inner = tk.Frame(self._backup_canvas, bg=BG_CARD)
        self._backup_canvas_window = self._backup_canvas.create_window(
            (0, 0), window=self._backup_inner, anchor="nw"
        )
        self._backup_inner.bind(
            "<Configure>",
            lambda e: self._backup_canvas.configure(
                scrollregion=self._backup_canvas.bbox("all")
            )
        )
        self._backup_canvas.bind(
            "<Configure>",
            lambda e: self._backup_canvas.itemconfig(
                self._backup_canvas_window, width=e.width
            )
        )

        # Boş durum etiketi
        self._backup_empty_lbl = tk.Label(
            self._backup_inner, text="Henüz yedek yok",
            font=("Segoe UI", 9), fg=FG_DIM, bg=BG_CARD, pady=10
        )
        self._backup_empty_lbl.pack()

        self.after(300, self._refresh_backups)

        # ── CouchDB Veritabanı Paneli ──────────────────────────────────────────
        couch_bar = tk.Frame(self, bg=BG_DARK)
        couch_bar.pack(fill="x", padx=20, pady=(8, 0))

        tk.Label(
            couch_bar, text="CouchDB Veritabanları",
            font=("Segoe UI", 9, "bold"), fg=FG_DIM, bg=BG_DARK
        ).pack(side="left")

        # CouchDB Kurulum butonu
        couch_setup_btn = tk.Button(
            couch_bar, text="🔧 CouchDB Kurulum",
            command=self._do_couchdb_setup,
            font=("Segoe UI", 8), fg=BG_DARK, bg=PEACH,
            relief="flat", cursor="hand2", bd=0, padx=8, pady=2
        )
        couch_setup_btn.pack(side="left", padx=(8, 0))
        _bind_hover(couch_setup_btn, PEACH, PEACH_H)

        # CouchDB Compact butonu
        couch_compact_btn = tk.Button(
            couch_bar, text="📦 Compact",
            command=self._do_couchdb_compact,
            font=("Segoe UI", 8), fg=BG_DARK, bg=TEAL,
            relief="flat", cursor="hand2", bd=0, padx=8, pady=2
        )
        couch_compact_btn.pack(side="left", padx=(4, 0))
        _bind_hover(couch_compact_btn, TEAL, TEAL_H)

        # Refresh butonu
        tk.Button(
            couch_bar, text="↺", command=lambda: self._poll_couchdb(),
            font=("Segoe UI", 9), fg=FG_DIM, bg=BG_DARK,
            relief="flat", cursor="hand2", bd=0, padx=4
        ).pack(side="left", padx=(4, 0))

        # CouchDB istatistik çerçevesi
        self._couch_stats_frame = tk.Frame(
            self, bg=BG_CARD,
            highlightbackground=BORDER, highlightthickness=1
        )
        self._couch_stats_frame.pack(fill="x", padx=20, pady=(3, 0))

        self._couch_stats_inner = tk.Frame(self._couch_stats_frame, bg=BG_CARD)
        self._couch_stats_inner.pack(fill="x", padx=4, pady=4)

        tk.Label(
            self._couch_stats_inner, text="CouchDB kontrol ediliyor...",
            font=("Segoe UI", 9), fg=FG_DIM, bg=BG_CARD, pady=6
        ).pack()

        # ── Güncelleme Özeti Paneli ───────────────────────────────────────────
        sbar = tk.Frame(self, bg=BG_DARK)
        sbar.pack(fill="x", padx=20, pady=(10, 0))

        tk.Label(
            sbar, text="Son Güncelleme Özeti",
            font=("Segoe UI", 9, "bold"), fg=FG_DIM, bg=BG_DARK
        ).pack(side="left")

        # Geçmiş özetler dropdown
        self._summary_history_var = tk.StringVar(value="En son")
        self._summary_ids = []
        self._summary_menu = ttk.Combobox(
            sbar, textvariable=self._summary_history_var,
            font=("Segoe UI", 8), state="readonly", width=28
        )
        self._summary_menu.pack(side="left", padx=(10, 0))
        self._summary_menu.bind("<<ComboboxSelected>>", self._on_summary_select)

        self._summary_panel = tk.Frame(
            self, bg=BG_CARD,
            highlightbackground=BORDER, highlightthickness=1
        )
        self._summary_panel.pack(fill="x", padx=20, pady=(3, 0))

        # İlk yükleme — "henüz özet yok" etiketi
        self._summary_content = tk.Frame(self._summary_panel, bg=BG_CARD)
        self._summary_content.pack(fill="x")
        tk.Label(
            self._summary_content,
            text="Henüz güncelleme yapılmadı",
            font=("Segoe UI", 9), fg=FG_DIM, bg=BG_CARD, pady=8
        ).pack()

        self.after(200, self._refresh_summary_ui)

        # ── Grafikler paneli ──────────────────────────────────────────────────
        gbar = tk.Frame(self, bg=BG_DARK)
        gbar.pack(fill="x", padx=20, pady=(10, 0))

        # Başlık + aç/kapa butonu
        self._graphs_open = tk.BooleanVar(value=True)
        gbar_left = tk.Frame(gbar, bg=BG_DARK)
        gbar_left.pack(side="left")
        tk.Label(
            gbar_left, text="Grafikler",
            font=("Segoe UI", 9, "bold"), fg=FG_DIM, bg=BG_DARK
        ).pack(side="left")
        self._graph_toggle_lbl = tk.Label(
            gbar_left, text="▲", font=("Segoe UI", 8), fg=FG_DIM, bg=BG_DARK,
            cursor="hand2"
        )
        self._graph_toggle_lbl.pack(side="left", padx=(4, 0))
        self._graph_toggle_lbl.bind("<Button-1>", self._toggle_graphs)

        # Canlı güncelleme ibaresi
        self._stats_lbl = tk.Label(
            gbar, text="", font=("Segoe UI", 8), fg=FG_DIM, bg=BG_DARK
        )
        self._stats_lbl.pack(side="right")

        # Grafik çerçevesi (gizlenebilir)
        self._graphs_frame = tk.Frame(self, bg=BG_CARD,
                                       highlightbackground=BORDER,
                                       highlightthickness=1)
        self._graphs_frame.pack(fill="x", padx=20, pady=(3, 0))

        inner_g = tk.Frame(self._graphs_frame, bg=BG_CARD)
        inner_g.pack(fill="x", padx=6, pady=6)

        CHART_H = 110
        CHART_W = 220

        # Sol: Build süresi (çizgi)
        left_g = tk.Frame(inner_g, bg=BG_CARD)
        left_g.pack(side="left", fill="both", expand=True)
        tk.Label(left_g, text="Build Süresi (sn)",
                 font=("Segoe UI", 7), fg=FG_DIM, bg=BG_CARD).pack()
        self._chart_build = ChartCanvas(left_g, CHART_W, CHART_H,
                                         "", bg=BG_CARD)
        self._chart_build.canvas.pack()

        # Orta: Kod değişikliği (çubuk)
        mid_g = tk.Frame(inner_g, bg=BG_CARD)
        mid_g.pack(side="left", fill="both", expand=True, padx=6)
        tk.Label(mid_g, text="Kod Değişikliği (satır)",
                 font=("Segoe UI", 7), fg=FG_DIM, bg=BG_CARD).pack()
        self._chart_code = ChartCanvas(mid_g, CHART_W, CHART_H,
                                        "", bg=BG_CARD)
        self._chart_code.canvas.pack()

        # Sağ: CPU gauge
        right_g = tk.Frame(inner_g, bg=BG_CARD)
        right_g.pack(side="left", fill="both", expand=True, padx=(0, 6))
        tk.Label(right_g, text="CPU",
                 font=("Segoe UI", 7), fg=FG_DIM, bg=BG_CARD).pack()
        self._chart_cpu = ChartCanvas(right_g, 140, CHART_H,
                                       "", bg=BG_CARD)
        self._chart_cpu.canvas.pack()

        # En sağ: RAM gauge
        far_g = tk.Frame(inner_g, bg=BG_CARD)
        far_g.pack(side="left", fill="both", expand=True)
        tk.Label(far_g, text="RAM",
                 font=("Segoe UI", 7), fg=FG_DIM, bg=BG_CARD).pack()
        self._chart_ram = ChartCanvas(far_g, 140, CHART_H,
                                       "", bg=BG_CARD)
        self._chart_ram.canvas.pack()

        # Alt satır: CouchDB gauge + Sağlık yanıt süresi çizgi grafiği
        inner_g2 = tk.Frame(self._graphs_frame, bg=BG_CARD)
        inner_g2.pack(fill="x", padx=6, pady=(0, 6))

        # CouchDB latency gauge
        couch_g = tk.Frame(inner_g2, bg=BG_CARD)
        couch_g.pack(side="left", fill="both", expand=True)
        tk.Label(couch_g, text="CouchDB",
                 font=("Segoe UI", 7), fg=FG_DIM, bg=BG_CARD).pack()
        self._chart_couch = ChartCanvas(couch_g, 140, CHART_H,
                                          "", bg=BG_CARD)
        self._chart_couch.canvas.pack()

        # App yanıt süresi çizgi grafiği
        health_g = tk.Frame(inner_g2, bg=BG_CARD)
        health_g.pack(side="left", fill="both", expand=True, padx=6)
        tk.Label(health_g, text="App Yanıt Süresi (ms)",
                 font=("Segoe UI", 7), fg=FG_DIM, bg=BG_CARD).pack()
        self._chart_health = ChartCanvas(health_g, CHART_W, CHART_H,
                                           "", bg=BG_CARD)
        self._chart_health.canvas.pack()

        # CouchDB yanıt süresi çizgi grafiği
        couch_line_g = tk.Frame(inner_g2, bg=BG_CARD)
        couch_line_g.pack(side="left", fill="both", expand=True)
        tk.Label(couch_line_g, text="CouchDB Yanıt Süresi (ms)",
                 font=("Segoe UI", 7), fg=FG_DIM, bg=BG_CARD).pack()
        self._chart_couch_line = ChartCanvas(couch_line_g, CHART_W, CHART_H,
                                               "", bg=BG_CARD)
        self._chart_couch_line.canvas.pack()

        # İlk çizim + canlı polling başlat
        self.after(500,  self._redraw_history_charts)
        self.after(800,  self._poll_docker_stats)
        self.after(1000, self._poll_health)
        self.after(1500, self._poll_couchdb)

        # ── Güncelleme Zaman Çizelgesi ────────────────────────────────────────
        tl_bar = tk.Frame(self, bg=BG_DARK)
        tl_bar.pack(fill="x", padx=20, pady=(6, 0))
        tk.Label(
            tl_bar, text="Güncelleme Geçmişi",
            font=("Segoe UI", 9, "bold"), fg=FG_DIM, bg=BG_DARK
        ).pack(side="left")

        tl_card = tk.Frame(self, bg=BG_CARD,
                           highlightbackground=BORDER, highlightthickness=1)
        tl_card.pack(fill="x", padx=20, pady=(3, 0))

        self._timeline_canvas = tk.Canvas(
            tl_card, height=52, bg=BG_CARD,
            highlightthickness=0, bd=0
        )
        self._timeline_canvas.pack(fill="x", padx=8, pady=6)
        self._timeline_canvas.bind("<Configure>", lambda e: self._draw_timeline())
        self.after(1200, self._draw_timeline)

        # ── Konsol başlık satırı ──────────────────────────────────────────────
        self._console_frame = tk.Frame(self, bg=BG_DARK)
        con_bar = self._console_frame
        con_bar.pack(fill="x", padx=20, pady=(8, 2))

        tk.Label(
            con_bar, text="Konsol Çıktısı",
            font=("Segoe UI", 9, "bold"), fg=FG_DIM, bg=BG_DARK
        ).pack(side="left")

        tk.Button(
            con_bar, text="✕ Temizle",
            command=self._clear_console,
            font=("Segoe UI", 8), fg=FG_DIM, bg=BG_DARK,
            relief="flat", cursor="hand2", bd=0, padx=6
        ).pack(side="right")

        tk.Button(
            con_bar, text="📋 Kopyala",
            command=self._copy_console,
            font=("Segoe UI", 8), fg=FG_DIM, bg=BG_DARK,
            relief="flat", cursor="hand2", bd=0, padx=6
        ).pack(side="right")

        # ── Konsol ───────────────────────────────────────────────────────────
        self.console = scrolledtext.ScrolledText(
            self, font=("Consolas", 10), wrap="word",
            bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT,
            relief="flat", bd=0, padx=12, pady=10, height=12,
            highlightbackground=BORDER, highlightthickness=1
        )
        self.console.pack(fill="both", expand=True, padx=20, pady=(0, 14))
        self.console.configure(state="disabled")

        self.console.tag_configure("info",    foreground=ACCENT)
        self.console.tag_configure("success", foreground=SUCCESS)
        self.console.tag_configure("warning", foreground=WARNING)
        self.console.tag_configure("error",   foreground=ERROR)
        self.console.tag_configure("dim",     foreground=FG_DIM)
        self.console.tag_configure("purple",  foreground=PURPLE)

        # İlk yükleme
        self.after(400, self._refresh_commits)

    # ─── Konsol yardımcıları ─────────────────────────────────────────────────
    def _log(self, msg: str, tag: str = "info"):
        self.console.configure(state="normal")
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        self.console.insert("end", f"[{ts}] ", "dim")
        self.console.insert("end", msg + "\n", tag)
        self.console.see("end")
        # Satır limiti — GUI'yi yavaşlatmamak için eski satırları sil
        lines = int(self.console.index("end-1c").split(".")[0])
        if lines > CONSOLE_MAX_LINES:
            self.console.delete("1.0", f"{lines - CONSOLE_MAX_LINES}.0")
        self.console.configure(state="disabled")

    def _clear_console(self):
        self.console.configure(state="normal")
        self.console.delete("1.0", "end")
        self.console.configure(state="disabled")

    def _copy_console(self):
        try:
            self.console.configure(state="normal")
            content = self.console.get("1.0", "end-1c")
            self.console.configure(state="disabled")
            self.clipboard_clear()
            self.clipboard_append(content)
            self._log("Konsol içeriği panoya kopyalandı.", "success")
        except Exception as e:
            self._log(f"Kopyalama hatası: {e}", "error")

    # ─── Son commitler ───────────────────────────────────────────────────────
    def _refresh_commits(self):
        def _inner():
            try:
                # Yerel commitler
                r = subprocess.run(
                    ["git", "log", "--format=%h|%ar|%s", "-10"],
                    cwd=REPO_DIR, capture_output=True, text=True
                )
                local_lines = r.stdout.strip().splitlines() if r.returncode == 0 else []
                # Uzak HEAD (fetch olmadan sadece cached)
                r2 = subprocess.run(
                    ["git", "log", f"{REMOTE}/{BRANCH}", "--format=%h", "-1"],
                    cwd=REPO_DIR, capture_output=True, text=True
                )
                remote_head = r2.stdout.strip() if r2.returncode == 0 else ""
                self.after(0, self._update_commits_box, local_lines, remote_head)
            except Exception:
                pass
        threading.Thread(target=_inner, daemon=True).start()

    def _update_commits_box(self, lines: list, remote_head: str):
        self.commits_box.configure(state="normal")
        self.commits_box.delete("1.0", "end")
        for i, line in enumerate(lines):
            parts = line.split("|", 2)
            if len(parts) == 3:
                h, d, m = parts
                # Uzak HEAD'den sonrakiler yeni (henüz pushlanmamış) olarak işaretle
                tag = "new" if i == 0 and h == remote_head else "hash"
                self.commits_box.insert("end", h + " ", tag)
                self.commits_box.insert("end", f"({d}) ", "date")
                self.commits_box.insert("end", m + "\n", "msg")
        self.commits_box.configure(state="disabled")

    # ─── Komut çalıştırma ────────────────────────────────────────────────────
    def _run_cmd(self, cmd: str, label: str = "") -> tuple[bool, str]:
        """Komutu çalıştır, çıktıyı konsola aktar. (ok, output) döndür."""
        if label:
            self._log(f"▶  {label}", "info")
        try:
            proc = subprocess.Popen(
                cmd, shell=True, cwd=REPO_DIR,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace"
            )
            output_lines: list[str] = []
            for line in proc.stdout:
                stripped = line.rstrip()
                output_lines.append(stripped)
                self.after(0, self._log, stripped, "dim")
            proc.wait()
            if proc.returncode == 0:
                self.after(0, self._log, f"✓ Başarılı (kod: {proc.returncode})", "success")
            else:
                self.after(0, self._log, f"✗ Hata (kod: {proc.returncode})", "error")
            return proc.returncode == 0, "\n".join(output_lines)
        except Exception as e:
            self.after(0, self._log, f"✗ İstisna: {e}", "error")
            return False, str(e)

    # ─── Görev yaşam döngüsü ────────────────────────────────────────────────
    def _start_task(self):
        self._running    = True
        self._task_start = time.monotonic()
        self.progress.start(12)
        self._update_elapsed()

    def _end_task(self, label: str = ""):
        self._running = False
        self.progress.stop()
        elapsed = time.monotonic() - self._task_start
        msg = f"{label + '  ' if label else ''}⏱ {elapsed:.1f}s"
        self.after(0, self._log, msg, "purple")
        self.after(0, lambda: self.elapsed_lbl.configure(text=f"{elapsed:.1f}s"))
        self._check_status()
        self._refresh_commits()

    def _update_elapsed(self):
        if self._running:
            e = time.monotonic() - self._task_start
            self.elapsed_lbl.configure(text=f"{e:.0f}s…")
            self.after(1000, self._update_elapsed)

    def _threaded(self, func):
        if self._running:
            messagebox.showwarning("Bekle", "Başka bir işlem devam ediyor!")
            return
        threading.Thread(target=func, daemon=True).start()

    # ─── Durum kontrolü ─────────────────────────────────────────────────────
    def _check_status(self):
        def _inner():
            try:
                # Yerel son commit
                r = subprocess.run(
                    ["git", "log", "--oneline", "-1"],
                    cwd=REPO_DIR, capture_output=True, text=True
                )
                commit = r.stdout.strip() if r.returncode == 0 else "bilinmiyor"
                self.after(0, lambda c=commit: self.commit_label.configure(text=c))

                # Kaç commit geride (cached — fetch gerekmez)
                r2 = subprocess.run(
                    ["git", "rev-list", "--count", f"HEAD..{REMOTE}/{BRANCH}"],
                    cwd=REPO_DIR, capture_output=True, text=True
                )
                behind = int(r2.stdout.strip()) if r2.returncode == 0 and r2.stdout.strip().isdigit() else 0
                self._behind_count = behind
                if behind > 0:
                    self.after(0, lambda n=behind: self.behind_lbl.configure(text=f"↓ {n} yeni commit"))
                    self.after(0, lambda n=behind: self.title(f"MERT.4  [{n} güncelleme var]"))
                else:
                    self.after(0, lambda: self.behind_lbl.configure(text=""))
                    self.after(0, lambda: self.title("MERT.4 — Güncelleme Merkezi"))

                # Docker durumu (mert-site)
                r3 = subprocess.run(
                    ["docker", "ps", "--filter", "name=mert-site", "--format", "{{.Status}}"],
                    cwd=REPO_DIR, capture_output=True, text=True
                )
                ds = r3.stdout.strip()

                # Docker durumu (mert-couchdb)
                r4 = subprocess.run(
                    ["docker", "ps", "--filter", f"name={COUCHDB_CONTAINER}", "--format", "{{.Status}}"],
                    cwd=REPO_DIR, capture_output=True, text=True
                )
                couch_ds = r4.stdout.strip()

                site_up = ds and "Up" in ds
                couch_up = couch_ds and "Up" in couch_ds

                if site_up and couch_up:
                    self.after(0, lambda: self.status_dot.configure(fg=SUCCESS))
                    self.after(0, lambda s=ds: self.status_label.configure(
                        text=f"✓ Çalışıyor — Site: {s}"))
                    if behind == 0:
                        self.after(0, lambda: self.title("MERT.4 ✓ Çalışıyor"))
                elif site_up:
                    self.after(0, lambda: self.status_dot.configure(fg=WARNING))
                    self.after(0, lambda s=ds: self.status_label.configure(
                        text=f"⚠ Site çalışıyor ({s}) — CouchDB kapalı"))
                elif couch_up:
                    self.after(0, lambda: self.status_dot.configure(fg=WARNING))
                    self.after(0, lambda: self.status_label.configure(
                        text="⚠ CouchDB çalışıyor — Site container kapalı"))
                else:
                    self.after(0, lambda: self.status_dot.configure(fg=WARNING))
                    self.after(0, lambda: self.status_label.configure(
                        text="⚠ Docker container'lar çalışmıyor"))
            except FileNotFoundError:
                self.after(0, lambda: self.status_dot.configure(fg=ERROR))
                self.after(0, lambda: self.status_label.configure(text="✗ Docker bulunamadı!"))
            except Exception as exc:
                self.after(0, lambda: self.status_dot.configure(fg=ERROR))
                self.after(0, lambda e=exc: self.status_label.configure(text=f"Hata: {e}"))

        threading.Thread(target=_inner, daemon=True).start()

    def _schedule_status_refresh(self):
        if not self._running:
            self._check_status()
        self.after(STATUS_REFRESH_MS, self._schedule_status_refresh)

    # ─── İşlemler ────────────────────────────────────────────────────────────
    def _check_uncommitted(self) -> bool:
        """Uncommitted değişiklik varsa kullanıcıya sor. True = devam et."""
        try:
            r = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=REPO_DIR, capture_output=True, text=True
            )
            if r.stdout.strip():
                return messagebox.askyesno(
                    "Uncommitted Değişiklikler",
                    "Çalışma dizininde kaydedilmemiş değişiklikler var.\n"
                    "git reset --hard bunları SİLECEK.\n\n"
                    "Devam etmek istiyor musun?"
                )
        except Exception:
            pass
        return True

    def _do_update(self):
        if not self._check_uncommitted():
            return

        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Git Güncelleme ━━━", "info")

            self._capture_pre_hash()
            self._auto_backup_before_update(
                include_docker=self.backup_docker_var.get()
            )

            ok1, _ = self._run_cmd(
                f"git fetch {REMOTE} {BRANCH}", "1/2 — Uzak depodan çekiliyor..."
            )
            if not ok1:
                self.after(0, self._log, "Fetch başarısız! İşlem durdu.", "error")
                self._end_task()
                self._save_summary("Güncelleme", False, time.monotonic() - self._task_start)
                return

            ok2, _ = self._run_cmd(
                f"git reset --hard {REMOTE}/{BRANCH}", "2/2 — Yerel kod güncelleniyor..."
            )
            if ok2:
                self.after(0, self._log, "━━━ Güncelleme Tamamlandı! ━━━", "success")
                if self.auto_var.get():
                    self.after(0, self._log, "Otomatik build başlatılıyor...", "info")
                    ok3 = self._build_inner()
                    if not ok3:
                        self.after(0, self._log, "Otomatik build başarısız!", "error")
            else:
                self.after(0, self._log, "Reset başarısız!", "error")

            elapsed = time.monotonic() - self._task_start
            self._save_summary("Güncelleme", ok2, elapsed)
            self._end_task("Güncelleme")

        self._threaded(_task)

    def _build_inner(self) -> bool:
        """Build + başlat. Başarı bool döndürür."""
        self._run_cmd(f"{self._compose_cmd} down", "Eski container durduruluyor...")
        ok, _ = self._run_cmd(
            f"{self._compose_cmd} up --build -d", "Build ediliyor ve başlatılıyor..."
        )
        return ok

    def _do_build(self):
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Docker Build ━━━", "info")
            self._capture_pre_hash()
            ok = self._build_inner()
            elapsed = time.monotonic() - self._task_start
            self._save_summary("Build & Başlat", ok, elapsed)
            if ok:
                self.after(0, self._log, "━━━ Build Tamamlandı! ━━━", "success")
                self.after(0, self._log, f"→ {APP_URL}", "success")
            else:
                self.after(0, self._log, "━━━ Build Başarısız! ━━━", "error")
            self._end_task("Build")

        self._threaded(_task)

    def _do_restart(self):
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Yeniden Başlatılıyor ━━━", "warning")
            self._run_cmd(f"{self._compose_cmd} down", "Container durduruluyor...")
            ok, _ = self._run_cmd(f"{self._compose_cmd} up -d", "Container başlatılıyor...")
            if ok:
                self.after(0, self._log, "━━━ Yeniden Başlatıldı! ━━━", "success")
                self.after(0, self._log, f"→ {APP_URL}", "success")
            else:
                self.after(0, self._log, "Yeniden başlatma başarısız!", "error")
            self._end_task("Restart")

        self._threaded(_task)

    def _do_stop(self):
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Durduruluyor ━━━", "warning")
            self._run_cmd(f"{self._compose_cmd} down", "Container durduruluyor...")
            self.after(0, self._log, "━━━ Durduruldu ━━━", "warning")
            self._end_task("Durdur")

        self._threaded(_task)

    def _do_logs(self):
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Son 100 Log Satırı ━━━", "info")
            self._run_cmd(f"{self._compose_cmd} logs --tail=100", "Loglar okunuyor...")
            self._end_task("Loglar")

        self._threaded(_task)

    def _do_clean(self):
        if not messagebox.askyesno(
            "Emin misin?",
            "Docker container, image ve build cache temizlenecek.\nDevam etmek istiyor musun?"
        ):
            return

        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Temizlik Başlatılıyor ━━━", "warning")
            self._run_cmd(
                f"{self._compose_cmd} down --rmi local --volumes",
                "Container ve image'lar temizleniyor..."
            )
            self._run_cmd("docker builder prune -f", "Build cache temizleniyor...")
            self.after(0, self._log, "━━━ Temizlik Tamamlandı ━━━", "success")
            self._end_task("Temizlik")

        self._threaded(_task)

    def _do_show_diff(self):
        """Yerel ile uzak arasındaki farkı konsola yaz (build gerektirmez)."""
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Git Diff (HEAD vs remote) ━━━", "info")

            # Önce fetch — fresh diff için
            self._run_cmd(f"git fetch {REMOTE} {BRANCH}", "Uzak bilgi alınıyor...")
            self._run_cmd(
                f"git log HEAD..{REMOTE}/{BRANCH} --oneline",
                f"Gelecek commitler ({REMOTE}/{BRANCH})..."
            )
            self._run_cmd(
                f"git diff --stat HEAD {REMOTE}/{BRANCH}",
                "Değişen dosyalar..."
            )
            self._end_task("Diff")

        self._threaded(_task)

    # ─── Yedekleme ───────────────────────────────────────────────────────────

    def _refresh_backups(self):
        """Yedekler listesini UI'da günceller."""
        for w in self._backup_inner.winfo_children():
            w.destroy()

        backups = self._backup_mgr.list()

        if not backups:
            tk.Label(
                self._backup_inner, text="Henüz yedek yok",
                font=("Segoe UI", 9), fg=FG_DIM, bg=BG_CARD, pady=10
            ).pack()
            return

        for i, b in enumerate(backups):
            row = tk.Frame(self._backup_inner, bg=BG_CARD)
            row.pack(fill="x", padx=6, pady=2)

            # Renk: ilk yedek (en yeni) biraz öne çıksın
            row_bg = BG_INPUT if i == 0 else BG_CARD

            inner = tk.Frame(row, bg=row_bg)
            inner.pack(fill="x", ipady=4, ipadx=6)

            # Tarih
            tk.Label(
                inner, text=b["timestamp"],
                font=("Consolas", 8), fg=TEAL, bg=row_bg, width=18, anchor="w"
            ).pack(side="left")

            # Etiket
            tk.Label(
                inner, text=b["label"],
                font=("Segoe UI", 8, "bold"), fg=FG_TEXT, bg=row_bg, anchor="w"
            ).pack(side="left", padx=(4, 0))

            # Hash + commit mesajı
            msg = f"  {b['git_hash_short']}  {b['git_msg'][:45]}"
            if len(b.get("git_msg", "")) > 45:
                msg += "…"
            tk.Label(
                inner, text=msg,
                font=("Consolas", 8), fg=FG_DIM, bg=row_bg, anchor="w"
            ).pack(side="left")

            # Docker badge
            if b.get("docker_file"):
                tk.Label(
                    inner, text="🐳",
                    font=("Segoe UI", 8), fg=ACCENT, bg=row_bg
                ).pack(side="left", padx=(4, 0))

            # Geri Yükle butonu
            restore_btn = tk.Button(
                inner, text="↩ Geri Yükle",
                command=lambda bid=b["id"], blbl=b["label"]: self._do_restore(bid, blbl),
                font=("Segoe UI", 8), fg=BG_DARK, bg=WARNING,
                relief="flat", cursor="hand2", bd=0, padx=6, pady=1
            )
            restore_btn.pack(side="right", padx=(4, 0))
            _bind_hover(restore_btn, WARNING, WARNING_H)

            # Sil butonu
            del_btn = tk.Button(
                inner, text="🗑",
                command=lambda bid=b["id"]: self._do_delete_backup(bid),
                font=("Segoe UI", 8), fg=ERROR, bg=row_bg,
                relief="flat", cursor="hand2", bd=0, padx=4, pady=1
            )
            del_btn.pack(side="right")
            _bind_hover(del_btn, row_bg, BG_INPUT)

    def _do_manual_backup(self):
        """Kullanıcının manuel olarak tetiklediği yedekleme."""
        if self._running:
            messagebox.showwarning("Bekle", "Başka bir işlem devam ediyor!")
            return
        include_docker = self.backup_docker_var.get()

        def _task():
            self._start_task()
            self.after(0, self._log, "━━━ Manuel Yedek Alınıyor ━━━", "info")
            self._backup_mgr.create(
                label="Manuel yedek",
                include_docker=include_docker,
                log_fn=lambda m, t="dim": self.after(0, self._log, m, t)
            )
            self.after(0, self._refresh_backups)
            self._end_task("Yedek")

        threading.Thread(target=_task, daemon=True).start()

    def _auto_backup_before_update(self, include_docker: bool = False):
        """Güncelleme öncesi otomatik yedek — senkron çalışır (thread içinden)."""
        self.after(0, self._log, "📦 Güncelleme öncesi yedek alınıyor...", "info")
        self._backup_mgr.create(
            label="Otomatik (güncelleme öncesi)",
            include_docker=include_docker,
            log_fn=lambda m, t="dim": self.after(0, self._log, m, t)
        )
        self.after(0, self._refresh_backups)

    # ─── Güncelleme Özeti ────────────────────────────────────────────────────

    def _capture_pre_hash(self):
        """Güncelleme öncesi HEAD'i kaydet."""
        try:
            r = subprocess.run(
                ["git", "log", "--format=%H", "-1"],
                cwd=REPO_DIR, capture_output=True, text=True, timeout=5
            )
            self._pre_update_hash = r.stdout.strip() if r.returncode == 0 else ""
        except Exception:
            self._pre_update_hash = ""

    def _save_summary(self, op_label: str, success: bool, elapsed: float):
        """Güncelleme bitti, özeti hesapla ve kaydet."""
        diff = _collect_update_diff(self._pre_update_hash)
        ts = datetime.datetime.now()
        entry = {
            "id":            ts.strftime("%Y%m%d_%H%M%S"),
            "timestamp":     ts.strftime("%d.%m.%Y %H:%M:%S"),
            "operation":     op_label,
            "success":       success,
            "elapsed_s":     round(elapsed, 1),
            "new_commits":   len(diff["commits"]),
            "commits":       diff["commits"],
            "files_changed": diff["files_changed"],
            "insertions":    diff["insertions"],
            "deletions":     diff["deletions"],
            "diff_stat":     diff["diff_stat"],
        }
        self._summary_mgr.record(entry)
        self.after(0, self._refresh_summary_ui)
        self.after(100, self._redraw_history_charts)

    def _refresh_summary_ui(self):
        """Özet panelini ve dropdown'ı güncelle."""
        history = self._summary_mgr.all()
        if not history:
            return

        # Dropdown güncelle
        labels = [
            f"{h['timestamp']}  —  {h['operation']}"
            for h in history
        ]
        self._summary_ids = [h["id"] for h in history]
        self._summary_menu["values"] = labels
        self._summary_menu.current(0)

        # İlk özeti göster
        self._render_summary(history[0])

    def _on_summary_select(self, event=None):
        idx = self._summary_menu.current()
        if idx < 0:
            return
        history = self._summary_mgr.all()
        if idx < len(history):
            self._render_summary(history[idx])

    def _render_summary(self, s: dict):
        """Seçili özeti panelde göster."""
        # Mevcut içeriği temizle
        for w in self._summary_content.winfo_children():
            w.destroy()

        ok      = s.get("success", False)
        color   = SUCCESS if ok else ERROR
        icon    = "✓" if ok else "✗"
        elapsed = s.get("elapsed_s", 0)
        n_com   = s.get("new_commits", 0)
        n_files = s.get("files_changed", 0)
        ins     = s.get("insertions", 0)
        dels    = s.get("deletions", 0)

        # ─ Üst şerit: durum + istatistikler ─────────────────────────────────
        top = tk.Frame(self._summary_content, bg=BG_CARD)
        top.pack(fill="x", padx=10, pady=(6, 4))

        # Durum badge
        tk.Label(
            top, text=f" {icon} {s.get('operation', '?')} ",
            font=("Segoe UI", 9, "bold"), fg=BG_DARK, bg=color,
            padx=6, pady=2
        ).pack(side="left")

        tk.Label(
            top, text=f"  {s.get('timestamp', '')}",
            font=("Segoe UI", 8), fg=FG_DIM, bg=BG_CARD
        ).pack(side="left")

        # Sağ: stat kutucukları
        stats_frame = tk.Frame(top, bg=BG_CARD)
        stats_frame.pack(side="right")

        def stat_box(parent, val, lbl, fg_col):
            f = tk.Frame(parent, bg=BG_INPUT, padx=8, pady=2)
            f.pack(side="left", padx=3)
            tk.Label(f, text=str(val), font=("Segoe UI", 11, "bold"),
                     fg=fg_col, bg=BG_INPUT).pack()
            tk.Label(f, text=lbl, font=("Segoe UI", 7),
                     fg=FG_DIM, bg=BG_INPUT).pack()

        stat_box(stats_frame, n_com,           "commit",   ACCENT)
        stat_box(stats_frame, n_files,         "dosya",    PURPLE)
        stat_box(stats_frame, f"+{ins}",       "ekleme",   SUCCESS)
        stat_box(stats_frame, f"-{dels}",      "silme",    ERROR)
        stat_box(stats_frame, f"{elapsed}s",   "süre",     WARNING)

        # ─ Commit listesi ──────────────────────────────────────────────────
        commits = s.get("commits", [])
        if commits:
            c_frame = tk.Frame(self._summary_content, bg=BG_CARD)
            c_frame.pack(fill="x", padx=10, pady=(0, 6))

            for c in commits[:6]:   # en fazla 6 commit göster
                row = tk.Frame(c_frame, bg=BG_CARD)
                row.pack(fill="x", pady=1)

                tk.Label(
                    row, text=c["hash"],
                    font=("Consolas", 8, "bold"), fg=ACCENT,
                    bg=BG_CARD, width=8, anchor="w"
                ).pack(side="left")

                tk.Label(
                    row, text=f"({c['ago']})",
                    font=("Consolas", 8), fg=FG_DIM,
                    bg=BG_CARD, width=12, anchor="w"
                ).pack(side="left")

                msg = c["msg"]
                if len(msg) > 70:
                    msg = msg[:70] + "…"
                tk.Label(
                    row, text=msg,
                    font=("Segoe UI", 8), fg=FG_TEXT,
                    bg=BG_CARD, anchor="w"
                ).pack(side="left")

            if len(commits) > 6:
                tk.Label(
                    c_frame,
                    text=f"  … ve {len(commits) - 6} commit daha",
                    font=("Segoe UI", 8), fg=FG_DIM, bg=BG_CARD
                ).pack(anchor="w", pady=(0, 2))

        elif n_com == 0 and ok:
            tk.Label(
                self._summary_content,
                text="  Kod değişikliği yok — sadece build/restart yapıldı",
                font=("Segoe UI", 8), fg=FG_DIM, bg=BG_CARD, pady=4
            ).pack(anchor="w", padx=10)

    # ─── Sağlık Monitörü ─────────────────────────────────────────────────────

    def _poll_health(self):
        """APP_URL'e HTTP ping atar; yanıt süresini ve durumu kaydeder."""
        def _worker():
            t0  = time.monotonic()
            ok  = False
            try:
                req = urllib.request.Request(
                    APP_URL, method="HEAD",
                    headers={"User-Agent": "MERT4-HealthCheck/1.0"}
                )
                with urllib.request.urlopen(req, timeout=4) as resp:
                    ok = resp.status < 500
            except Exception:
                pass
            ms = int((time.monotonic() - t0) * 1000)
            self.after(0, self._apply_health, ok, ms)

        threading.Thread(target=_worker, daemon=True).start()
        self.after(20_000, self._poll_health)   # 20 sn

    def _apply_health(self, ok: bool, ms: int):
        """Sağlık sonucunu UI'a yansıtır + toast tetikler."""
        was_ok = self._health_ok
        self._health_ok = ok
        self._health_ms = ms

        MAX_HIST = 40
        self._health_history.append(ms if ok else 0)
        if len(self._health_history) > MAX_HIST:
            self._health_history.pop(0)

        if ok:
            if not was_ok:                         # yeni çevrim içi
                self._health_up_since = time.time()
                self._toast("App tekrar çevrim içi!", SUCCESS)
            uptime = self._uptime_str(self._health_up_since)
            self.health_dot.config(fg=SUCCESS)
            self.health_lbl.config(
                text=f"Çevrim içi  {ms}ms  ·  uptime {uptime}", fg=SUCCESS
            )
        else:
            if was_ok:                             # yeni çevrim dışı
                self._health_up_since = None
                self._toast("App çevrim dışı!", ERROR, duration=6000)
            self._health_up_since = None
            self.health_dot.config(fg=ERROR)
            self.health_lbl.config(text="Çevrim dışı", fg=ERROR)

        # App yanıt süresi çizgi grafiği güncelle
        if hasattr(self, '_chart_health') and len(self._health_history) >= 2:
            valid = [v for v in self._health_history if v > 0]
            if valid:
                self._chart_health.draw_line(
                    valid, color=ACCENT, fill_color="#1a2a4a",
                    dot_color=ACCENT, y_fmt="{:.0f}"
                )

    @staticmethod
    def _uptime_str(since: float | None) -> str:
        if since is None:
            return "—"
        s = int(time.time() - since)
        h, m = divmod(s // 60, 60)
        return f"{h}s {m:02d}d" if h else f"{m}d {s % 60:02d}sn"

    # ─── CouchDB Sağlık Monitörü ────────────────────────────────────────────

    def _poll_couchdb(self):
        """CouchDB'ye HTTP ping atar; yanıt süresini, durumu ve DB istatistiklerini kaydeder."""
        def _worker():
            t0 = time.monotonic()
            ok = False
            doc_counts = {}
            try:
                # Ana bağlantı testi
                req = urllib.request.Request(
                    COUCHDB_URL,
                    headers={"User-Agent": "MERT4-CouchCheck/1.0"}
                )
                with urllib.request.urlopen(req, timeout=4) as resp:
                    ok = resp.status < 400

                # DB istatistikleri
                if ok:
                    for db_name in COUCHDB_DBS:
                        try:
                            db_req = urllib.request.Request(
                                f"{COUCHDB_URL}/{db_name}",
                                headers={"User-Agent": "MERT4-CouchCheck/1.0"}
                            )
                            with urllib.request.urlopen(db_req, timeout=3) as db_resp:
                                data = json.loads(db_resp.read().decode("utf-8"))
                                doc_counts[db_name] = data.get("doc_count", 0)
                        except Exception:
                            doc_counts[db_name] = -1  # erişilemez
            except Exception:
                pass
            ms = int((time.monotonic() - t0) * 1000)
            self.after(0, self._apply_couchdb, ok, ms, doc_counts)

        threading.Thread(target=_worker, daemon=True).start()
        self.after(25_000, self._poll_couchdb)   # 25 sn

    def _apply_couchdb(self, ok: bool, ms: int, doc_counts: dict):
        """CouchDB sonucunu UI'a yansıtır."""
        was_ok = self._couch_ok
        self._couch_ok = ok
        self._couch_ms = ms
        self._couch_doc_counts = doc_counts

        MAX_HIST = 40
        self._couch_history.append(ms if ok else 0)
        if len(self._couch_history) > MAX_HIST:
            self._couch_history.pop(0)

        total = sum(v for v in doc_counts.values() if v >= 0)
        self._couch_total_docs = total
        active_dbs = sum(1 for v in doc_counts.values() if v >= 0)

        if ok:
            if not was_ok:
                self._couch_up_since = time.time()
                self._toast("CouchDB bağlantısı kuruldu!", PEACH)
            uptime = self._uptime_str(self._couch_up_since)
            self.couch_dot.config(fg=PEACH)
            self.couch_lbl.config(
                text=f"CouchDB  {ms}ms  ·  {active_dbs} DB  ·  {total} doc  ·  {uptime}",
                fg=PEACH
            )
        else:
            if was_ok:
                self._couch_up_since = None
                self._toast("CouchDB bağlantısı kesildi!", ERROR, duration=6000)
            self._couch_up_since = None
            self.couch_dot.config(fg=ERROR)
            self.couch_lbl.config(text="CouchDB çevrim dışı", fg=ERROR)

        # CouchDB gauge güncelle
        if hasattr(self, '_chart_couch'):
            self._chart_couch.draw_gauge(
                ms if ok else 0, 500.0, "CouchDB Latency", "ms",
                low_color=PEACH, mid_color=WARNING, high_color=ERROR,
                history=self._couch_history
            )

        # CouchDB yanıt süresi çizgi grafiği güncelle
        if hasattr(self, '_chart_couch_line') and len(self._couch_history) >= 2:
            valid = [v for v in self._couch_history if v > 0]
            if valid:
                self._chart_couch_line.draw_line(
                    valid, color=PEACH, fill_color="#3a2a1a",
                    dot_color=PEACH, y_fmt="{:.0f}"
                )

        # CouchDB DB stats panelini güncelle
        if hasattr(self, '_couch_stats_frame'):
            self._refresh_couch_stats()

    def _refresh_couch_stats(self):
        """CouchDB veritabanı istatistiklerini panelde göster."""
        for w in self._couch_stats_inner.winfo_children():
            w.destroy()

        if not self._couch_ok:
            tk.Label(
                self._couch_stats_inner, text="CouchDB bağlantısı yok",
                font=("Segoe UI", 9), fg=FG_DIM, bg=BG_CARD, pady=6
            ).pack()
            return

        # 4 sütunlu grid
        cols = 4
        row_frame = None
        for i, (db_name, count) in enumerate(self._couch_doc_counts.items()):
            if i % cols == 0:
                row_frame = tk.Frame(self._couch_stats_inner, bg=BG_CARD)
                row_frame.pack(fill="x", padx=4, pady=1)

            short_name = db_name.replace("mert_", "")
            color = PEACH if count >= 0 else ERROR
            count_str = str(count) if count >= 0 else "?"

            cell = tk.Frame(row_frame, bg=BG_INPUT, padx=6, pady=3)
            cell.pack(side="left", fill="x", expand=True, padx=2)

            tk.Label(
                cell, text=short_name,
                font=("Consolas", 7), fg=FG_DIM, bg=BG_INPUT, anchor="w"
            ).pack(side="left")
            tk.Label(
                cell, text=count_str,
                font=("Segoe UI", 8, "bold"), fg=color, bg=BG_INPUT, anchor="e"
            ).pack(side="right")

        # Toplam satırı
        total_frame = tk.Frame(self._couch_stats_inner, bg=BG_CARD)
        total_frame.pack(fill="x", padx=4, pady=(3, 2))
        tk.Label(
            total_frame, text=f"Toplam: {self._couch_total_docs} belge  ·  {len(self._couch_doc_counts)} veritabanı",
            font=("Segoe UI", 8, "bold"), fg=PEACH, bg=BG_CARD
        ).pack(side="left")

    # ─── Toast Uyarı Sistemi ─────────────────────────────────────────────────

    def _toast(self, msg: str, color: str = WARNING, duration: int = 4000):
        """Sağ üst köşede kayan bildirim gösterir."""
        TOAST_W, TOAST_H, PAD = 280, 42, 8

        toast = tk.Frame(self, bg=color, padx=PAD, pady=PAD // 2)
        tk.Label(
            toast, text=msg,
            font=("Segoe UI", 9, "bold"),
            fg=BG_DARK, bg=color, wraplength=TOAST_W - 20
        ).pack()

        # Kapatma butonu
        tk.Button(
            toast, text="✕",
            command=lambda: self._dismiss_toast(toast),
            font=("Segoe UI", 7), fg=BG_DARK, bg=color,
            relief="flat", cursor="hand2", bd=0
        ).place(relx=1.0, rely=0.0, anchor="ne", x=-2, y=2)

        # Pozisyon: sağ üst, birikmeyi önlemek için offset
        offset_y = sum(t.winfo_reqheight() + 4
                       for t in self._toast_widgets if t.winfo_exists()) + 4
        self._toast_widgets.append(toast)

        def _place():
            w = self.winfo_width()
            toast.place(x=w - TOAST_W - 12, y=50 + offset_y)
            toast.lift()

        self.after(50, _place)
        self.after(duration, lambda: self._dismiss_toast(toast))

    def _dismiss_toast(self, toast: tk.Frame):
        if toast in self._toast_widgets:
            self._toast_widgets.remove(toast)
        try:
            toast.destroy()
        except Exception:
            pass

    # ─── Otomatik Güncelleme Zamanlayıcısı ───────────────────────────────────

    def _toggle_auto_timer(self):
        if self._auto_timer_active:
            self._stop_auto_timer()
        else:
            self._start_auto_timer()

    def _start_auto_timer(self):
        interval_key   = self._timer_interval_var.get()
        interval_secs  = self._auto_timer_intervals.get(interval_key, 1800)
        self._auto_timer_active    = True
        self._auto_timer_remaining = interval_secs
        self._timer_toggle_btn.config(
            text=f"⏱  Otomatik Güncelleme: Açık ({interval_key})",
            fg=TEAL, bg=BG_CARD
        )
        self._toast(f"Otomatik güncelleme başladı — her {interval_key}", TEAL)
        self._auto_timer_tick()

    def _stop_auto_timer(self):
        self._auto_timer_active = False
        if self._auto_timer_after_id:
            self.after_cancel(self._auto_timer_after_id)
            self._auto_timer_after_id = None
        self._timer_toggle_btn.config(
            text="⏱  Otomatik Güncelleme: Kapalı", fg=FG_DIM
        )
        self._timer_countdown_lbl.config(text="")

    def _auto_timer_tick(self):
        if not self._auto_timer_active:
            return
        if self._auto_timer_remaining <= 0:
            self._timer_countdown_lbl.config(text="▶ güncelleniyor…")
            self._threaded(self._auto_update_job)
            # Sonraki döngü için sıfırla
            interval_key  = self._timer_interval_var.get()
            interval_secs = self._auto_timer_intervals.get(interval_key, 1800)
            self._auto_timer_remaining = interval_secs
        else:
            m, s = divmod(self._auto_timer_remaining, 60)
            self._timer_countdown_lbl.config(text=f"sonraki güncelleme  {m:02d}:{s:02d}")
            self._auto_timer_remaining -= 1

        self._auto_timer_after_id = self.after(1000, self._auto_timer_tick)

    def _auto_update_job(self):
        """Zamanlayıcı tarafından çağrılan güncelleme görevi."""
        from types import SimpleNamespace
        # _do_full_update'ı doğrudan çağırabilmek için senkron sürümü kullan
        self.after(0, self._do_full_update)

    # ─── Güncelleme Zaman Çizelgesi ──────────────────────────────────────────

    def _draw_timeline(self):
        """Özet geçmişini görsel timeline olarak çizer."""
        c  = self._timeline_canvas
        c.delete("all")

        history  = self._summary_mgr.all()
        ordered  = list(reversed(history[-8:]))   # en eskiden en yeniye
        n        = len(ordered)
        if n == 0:
            c.create_text(
                10, 26, text="Henüz güncelleme kaydı yok.",
                font=("Segoe UI", 8), fill=FG_DIM, anchor="w"
            )
            return

        W = c.winfo_width() or 860
        H = 52
        DOT_R = 8
        LINE_Y = H // 2

        # Yatay çizgi
        c.create_line(20, LINE_Y, W - 20, LINE_Y, fill=BORDER, width=2)

        for i, entry in enumerate(ordered):
            x = 20 + (W - 40) * i / max(n - 1, 1)
            success = entry.get("success", True)
            color   = SUCCESS if success else ERROR
            ts      = entry.get("timestamp", "")[-5:]   # SS:DD
            label   = entry.get("op_label", "")
            elapsed = entry.get("elapsed_s", 0)

            # Bağlantı çizgisi noktasına kadar zaten ana çizgide

            # Dikey ince çizgi (nokta → alt etiket)
            c.create_line(x, LINE_Y + DOT_R, x, LINE_Y + DOT_R + 8,
                          fill=color, width=1)

            # Nokta
            c.create_oval(
                x - DOT_R, LINE_Y - DOT_R,
                x + DOT_R, LINE_Y + DOT_R,
                fill=color, outline=BG_CARD, width=2
            )
            # Onay / çarpı ikonu
            icon = "✓" if success else "✗"
            c.create_text(x, LINE_Y, text=icon,
                          font=("Segoe UI", 7, "bold"),
                          fill=BG_DARK, anchor="center")

            # Alt etiket: saat
            c.create_text(x, LINE_Y + DOT_R + 12, text=ts,
                          font=("Consolas", 7), fill=FG_DIM, anchor="center")

            # Üst etiket: işlem adı + süre (son girişte farklı renk)
            top_color = color if i == n - 1 else FG_DIM
            lbl_text  = f"{label[:10]}\n{elapsed:.0f}s" if label else f"{elapsed:.0f}s"
            c.create_text(x, LINE_Y - DOT_R - 4, text=lbl_text,
                          font=("Consolas", 7), fill=top_color, anchor="s")

    # ─── Grafik metodları ────────────────────────────────────────────────────

    def _toggle_graphs(self, event=None):
        """Grafik panelini aç/kapat."""
        if self._graphs_open.get():
            self._graphs_frame.pack_forget()
            self._graphs_open.set(False)
            self._graph_toggle_lbl.config(text="▼")
        else:
            self._graphs_frame.pack(fill="x", padx=20, pady=(3, 0),
                                    before=self._console_frame)
            self._graphs_open.set(True)
            self._graph_toggle_lbl.config(text="▲")

    def _redraw_history_charts(self):
        """Özet geçmişinden build süresi + kod değişikliği grafiklerini çizer."""
        history = self._summary_mgr.all()
        if not history:
            self._chart_build.clear()
            self._chart_code.clear()
            return

        # En eskiden en yeniye sırala (özet en yeni başta)
        ordered = list(reversed(history[-12:]))

        build_times = [h.get("elapsed_s", 0) for h in ordered]
        insertions  = [h.get("insertions", 0)  for h in ordered]
        deletions   = [h.get("deletions", 0)   for h in ordered]
        x_labels    = [h.get("timestamp", "")[-5:] for h in ordered]  # SS:DD

        # Build süresi çizgi grafiği
        self._chart_build.draw_line(
            build_times, color=TEAL, fill_color="#1a3a3a",
            dot_color=TEAL, x_labels=x_labels, y_fmt="{:.0f}s"
        )

        # Kod değişikliği çubuk grafiği
        self._chart_code.draw_bars(
            insertions, deletions,
            pos_color=SUCCESS, neg_color=ERROR,
            x_labels=x_labels
        )

        # Timeline da güncelle
        self._draw_timeline()

    def _poll_docker_stats(self):
        """Docker container CPU ve RAM'ini arka planda sorgular (site + couchdb)."""
        def _worker():
            def _parse_stats(container_name):
                try:
                    r = subprocess.run(
                        ["docker", "stats", "--no-stream", "--format",
                         "{{.CPUPerc}}|{{.MemUsage}}",
                         "--filter", f"name={container_name}"],
                        capture_output=True, text=True, timeout=8
                    )
                    if r.returncode == 0 and r.stdout.strip():
                        line = r.stdout.strip().splitlines()[0]
                        parts = line.split("|")
                        if len(parts) >= 2:
                            cpu_str = parts[0].strip().replace("%", "")
                            mem_str = parts[1].strip()
                            try:
                                cpu = float(cpu_str)
                            except ValueError:
                                cpu = 0.0
                            ram_used, ram_max = 0.0, 512.0
                            m = re.match(r"([\d.]+)(\w+)\s*/\s*([\d.]+)(\w+)", mem_str)
                            if m:
                                def to_mb(val, unit):
                                    unit = unit.upper()
                                    if "GIB" in unit or "GB" in unit:
                                        return float(val) * 1024
                                    if "MIB" in unit or "MB" in unit:
                                        return float(val)
                                    if "KIB" in unit or "KB" in unit:
                                        return float(val) / 1024
                                    return float(val)
                                ram_used = to_mb(m.group(1), m.group(2))
                                ram_max  = to_mb(m.group(3), m.group(4))
                            return cpu, ram_used, ram_max
                except Exception:
                    pass
                return None

            site_stats = _parse_stats("mert-site")
            couch_stats = _parse_stats(COUCHDB_CONTAINER)

            # Toplam CPU ve RAM hesapla
            total_cpu = 0.0
            total_ram = 0.0
            total_ram_max = 0.0

            if site_stats:
                total_cpu += site_stats[0]
                total_ram += site_stats[1]
                total_ram_max += site_stats[2]
            if couch_stats:
                total_cpu += couch_stats[0]
                total_ram += couch_stats[1]
                total_ram_max += couch_stats[2]

            if site_stats or couch_stats:
                self.after(0, self._apply_docker_stats, total_cpu, total_ram,
                           max(total_ram_max, 1),
                           site_stats, couch_stats)

        threading.Thread(target=_worker, daemon=True).start()
        # 4 saniyede bir tekrarla
        self._stats_after = self.after(4000, self._poll_docker_stats)

    def _apply_docker_stats(self, cpu: float, ram_used: float, ram_max: float,
                            site_stats=None, couch_stats=None):
        """Stats geldi → geçmiş güncelle → grafikleri çiz."""
        MAX_HISTORY = 30

        self._cpu_now = cpu
        self._ram_now = ram_used
        self._ram_max = ram_max

        self._cpu_history.append(cpu)
        self._ram_history.append(ram_used)
        if len(self._cpu_history) > MAX_HISTORY:
            self._cpu_history.pop(0)
        if len(self._ram_history) > MAX_HISTORY:
            self._ram_history.pop(0)

        # CPU gauge
        self._chart_cpu.draw_gauge(
            cpu, 100.0, "CPU Kullanım", "%",
            low_color=SUCCESS, mid_color=WARNING, high_color=ERROR,
            history=self._cpu_history
        )

        # RAM gauge
        self._chart_ram.draw_gauge(
            ram_used, max(ram_max, 1), "RAM Kullanım", "M",
            low_color=ACCENT, mid_color=PURPLE, high_color=ERROR,
            history=self._ram_history
        )

        # Üst ibare güncelle — detaylı bilgi
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        detail_parts = []
        if site_stats:
            detail_parts.append(f"Site: {site_stats[0]:.1f}%/{site_stats[1]:.0f}M")
        if couch_stats:
            detail_parts.append(f"CouchDB: {couch_stats[0]:.1f}%/{couch_stats[1]:.0f}M")
        detail = "  ".join(detail_parts) if detail_parts else f"CPU {cpu:.1f}%  RAM {ram_used:.0f}M"
        self._stats_lbl.config(text=f"{detail}  ·  {ts}")

        # Akıllı uyarı: eşik aşıldığında toast gönder (60 sn cooldown)
        now = time.time()
        if now - self._health_last_toast > 60:
            if cpu >= 85:
                self._health_last_toast = now
                self._toast(f"Yüksek CPU: {cpu:.1f}%", ERROR)
            elif ram_max > 0 and (ram_used / ram_max) >= 0.90:
                self._health_last_toast = now
                self._toast(f"Yüksek RAM: {ram_used:.0f}/{ram_max:.0f}MB", WARNING)

    # ─── CouchDB İşlemleri ─────────────────────────────────────────────────

    def _do_couchdb_setup(self):
        """CouchDB veritabanlarını oluşturur (couchdb-setup.sh çalıştırır)."""
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ CouchDB Kurulum ━━━", "info")

            if os.path.exists(COUCHDB_SETUP_SCRIPT):
                ok, _ = self._run_cmd(
                    f"bash \"{COUCHDB_SETUP_SCRIPT}\"",
                    "CouchDB veritabanları oluşturuluyor..."
                )
                if ok:
                    self.after(0, self._log, "━━━ CouchDB Kurulumu Tamamlandı! ━━━", "success")
                    self.after(500, self._poll_couchdb)
                else:
                    self.after(0, self._log, "CouchDB kurulumu başarısız!", "error")
            else:
                # Script yoksa manuel olarak curl ile oluştur
                self.after(0, self._log, "couchdb-setup.sh bulunamadı, manuel kurulum...", "warning")
                for db_name in COUCHDB_DBS:
                    ok, _ = self._run_cmd(
                        f'curl -s -X PUT {COUCHDB_URL}/{db_name} -u admin:mert2024',
                        f"DB oluşturuluyor: {db_name}"
                    )
                self.after(0, self._log, "━━━ CouchDB Kurulumu Tamamlandı! ━━━", "success")
                self.after(500, self._poll_couchdb)

            self._end_task("CouchDB Kurulum")

        self._threaded(_task)

    def _do_couchdb_compact(self):
        """CouchDB veritabanlarını compact eder (disk alanı kazandırır)."""
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ CouchDB Compact ━━━", "info")

            success_count = 0
            for db_name in COUCHDB_DBS:
                ok, _ = self._run_cmd(
                    f'curl -s -X POST {COUCHDB_URL}/{db_name}/_compact '
                    f'-H "Content-Type: application/json" -u admin:mert2024',
                    f"Compact: {db_name}"
                )
                if ok:
                    success_count += 1

            self.after(0, self._log,
                       f"━━━ Compact Tamamlandı ({success_count}/{len(COUCHDB_DBS)} DB) ━━━",
                       "success")
            self.after(500, self._poll_couchdb)
            self._end_task("CouchDB Compact")

        self._threaded(_task)

    def _do_restore(self, backup_id: str, label: str):
        if not messagebox.askyesno(
            "Geri Yükle",
            f"'{label}' yedeğine geri dönmek istiyor musunuz?\n\n"
            "Mevcut çalışan kod ve container değişecek."
        ):
            return

        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Yedekten Geri Yükleniyor ━━━", "warning")
            ok = self._backup_mgr.restore(
                backup_id,
                self._compose_cmd,
                log_fn=lambda m, t="dim": self.after(0, self._log, m, t)
            )
            if ok:
                self.after(0, self._log, f"→ {APP_URL}", "success")
            self._end_task("Geri Yükleme")

        self._threaded(_task)

    def _do_delete_backup(self, backup_id: str):
        if not messagebox.askyesno("Sil", "Bu yedek silinsin mi?"):
            return
        self._backup_mgr.delete(backup_id)
        self._refresh_backups()
        self._log(f"Yedek silindi: {backup_id}", "dim")

    def _do_full_update(self):
        if not self._check_uncommitted():
            return

        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "⚡━━━ Tam Güncelleme ━━━⚡", "info")

            self._capture_pre_hash()
            self._auto_backup_before_update(
                include_docker=self.backup_docker_var.get()
            )

            ok1, _ = self._run_cmd(
                f"git fetch {REMOTE} {BRANCH}", "1/3 — Uzak depodan çekiliyor..."
            )
            if not ok1:
                self.after(0, self._log, "Fetch başarısız! Duruyorum.", "error")
                self._save_summary("Tam Güncelleme", False, time.monotonic() - self._task_start)
                self._end_task("Tam Güncelleme")
                return

            ok2, _ = self._run_cmd(
                f"git reset --hard {REMOTE}/{BRANCH}", "2/3 — Yerel kod güncelleniyor..."
            )
            if not ok2:
                self.after(0, self._log, "Reset başarısız! Duruyorum.", "error")
                self._save_summary("Tam Güncelleme", False, time.monotonic() - self._task_start)
                self._end_task("Tam Güncelleme")
                return

            self.after(0, self._log, "3/3 — Docker build & başlat...", "info")
            ok3 = self._build_inner()
            elapsed = time.monotonic() - self._task_start
            self._save_summary("Tam Güncelleme", ok3, elapsed)

            if ok3:
                self.after(0, self._log, "⚡━━━ Her Şey Tamam! Site Hazır! ━━━⚡", "success")
                self.after(0, self._log, f"→ {APP_URL}", "success")
            else:
                self.after(0, self._log, "Build başarısız oldu!", "error")

            self._end_task("Tam Güncelleme")

        self._threaded(_task)


if __name__ == "__main__":
    app = MertUpdater()
    app.protocol("WM_DELETE_WINDOW", lambda: (app._stop_auto_timer(), app.destroy()))
    app.mainloop()
