#!/usr/bin/env python3
"""
MERT.4 Proje Güncelleme Aracı  v3.1
Windows GUI uygulaması - Git & Docker işlemleri
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

# ─── Ayarlar ────────────────────────────────────────────────────────────────
REPO_DIR              = os.path.dirname(os.path.abspath(__file__))
REMOTE                = "origin"
BRANCH                = "claude/multi-db-sync-setup-3DmYn"
APP_URL               = "http://localhost:8080"
STATUS_REFRESH_MS     = 30_000   # 30 saniye
CONSOLE_MAX_LINES     = 1_200    # bu limitin üstünde eski satırlar silinir
BACKUP_DIR            = os.path.join(REPO_DIR, ".mert4_backups")
BACKUP_INDEX          = os.path.join(BACKUP_DIR, "index.json")
DOCKER_IMAGE_NAME     = "mert4-mert-site"   # docker image adı
MAX_BACKUPS           = 10                  # en fazla kaç yedek saklanır
SUMMARY_FILE          = os.path.join(REPO_DIR, ".mert4_backups", "summary.json")

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
        import re
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
        self.geometry("900x780")
        self.minsize(720, 580)
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
        self._backup_mgr   = BackupManager()
        self._summary_mgr  = SummaryManager()
        self._pre_update_hash = ""   # güncelleme öncesi HEAD hash'i

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
            header, text="⚙  MERT.4  Güncelleme Merkezi",
            font=("Segoe UI", 17, "bold"), fg=FG_TITLE, bg=BG_DARK
        )
        self.title_lbl.pack(side="left")

        tk.Label(
            header, text=f"dal: {BRANCH}  •  compose: {self._compose_cmd}",
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

        # ── Konsol başlık satırı ──────────────────────────────────────────────
        con_bar = tk.Frame(self, bg=BG_DARK)
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

                # Docker durumu
                r3 = subprocess.run(
                    ["docker", "ps", "--filter", "name=mert-site", "--format", "{{.Status}}"],
                    cwd=REPO_DIR, capture_output=True, text=True
                )
                ds = r3.stdout.strip()
                if ds and "Up" in ds:
                    self.after(0, lambda: self.status_dot.configure(fg=SUCCESS))
                    self.after(0, lambda s=ds: self.status_label.configure(text=f"✓ Çalışıyor — {s}"))
                    if behind == 0:
                        self.after(0, lambda: self.title("MERT.4 ✓ Çalışıyor"))
                else:
                    self.after(0, lambda: self.status_dot.configure(fg=WARNING))
                    self.after(0, lambda: self.status_label.configure(text="⚠ Docker container çalışmıyor"))
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
    app.mainloop()
