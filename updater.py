#!/usr/bin/env python3
"""
MERT.4 Proje Güncelleme Aracı
Windows GUI uygulaması - Git & Docker işlemleri
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import subprocess
import threading
import os
import sys
import datetime

# ─── Ayarlar ────────────────────────────────────────────────
REPO_DIR = os.path.dirname(os.path.abspath(__file__))
REMOTE = "origin"
BRANCH = "claude/multi-db-sync-setup-3DmYn"
COMPOSE_FILE = "docker-compose.yml"

# ─── Renkler ────────────────────────────────────────────────
BG_DARK = "#1e1e2e"
BG_CARD = "#2a2a3d"
BG_INPUT = "#363650"
FG_TEXT = "#cdd6f4"
FG_DIM = "#7f849c"
FG_TITLE = "#f5c2e7"
ACCENT = "#89b4fa"
ACCENT_HOVER = "#74c7ec"
SUCCESS = "#a6e3a1"
WARNING = "#f9e2af"
ERROR = "#f38ba8"
BORDER = "#45475a"


class MertUpdater(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("MERT.4 — Güncelleme Merkezi")
        self.geometry("820x680")
        self.minsize(700, 550)
        self.configure(bg=BG_DARK)
        self.resizable(True, True)

        # Pencere ikonu (varsa)
        try:
            self.iconbitmap(default="")
        except Exception:
            pass

        self._running = False
        self._build_ui()
        self._check_status()

    # ─── UI ────────────────────────────────────────────────
    def _build_ui(self):
        # Başlık
        header = tk.Frame(self, bg=BG_DARK)
        header.pack(fill="x", padx=20, pady=(18, 5))

        tk.Label(
            header, text="⚙  MERT.4  Güncelleme Merkezi",
            font=("Segoe UI", 18, "bold"), fg=FG_TITLE, bg=BG_DARK
        ).pack(side="left")

        tk.Label(
            header, text=f"dal: {BRANCH}",
            font=("Segoe UI", 9), fg=FG_DIM, bg=BG_DARK
        ).pack(side="right", pady=(8, 0))

        # Durum kartı
        status_frame = tk.Frame(self, bg=BG_CARD, highlightbackground=BORDER, highlightthickness=1)
        status_frame.pack(fill="x", padx=20, pady=10)

        inner = tk.Frame(status_frame, bg=BG_CARD)
        inner.pack(fill="x", padx=15, pady=12)

        self.status_dot = tk.Label(inner, text="●", font=("Segoe UI", 14), fg=FG_DIM, bg=BG_CARD)
        self.status_dot.pack(side="left")

        self.status_label = tk.Label(
            inner, text="Durum kontrol ediliyor...",
            font=("Segoe UI", 11), fg=FG_TEXT, bg=BG_CARD
        )
        self.status_label.pack(side="left", padx=(8, 0))

        self.commit_label = tk.Label(
            inner, text="",
            font=("Consolas", 9), fg=FG_DIM, bg=BG_CARD
        )
        self.commit_label.pack(side="right")

        # Buton alanı
        btn_frame = tk.Frame(self, bg=BG_DARK)
        btn_frame.pack(fill="x", padx=20, pady=(5, 5))

        buttons = [
            ("🔄  Güncelle", self._do_update, ACCENT),
            ("🔨  Build & Başlat", self._do_build, SUCCESS),
            ("⏹  Durdur", self._do_stop, WARNING),
            ("📋  Loglar", self._do_logs, FG_DIM),
            ("🗑  Temizle", self._do_clean, ERROR),
        ]

        for i, (text, cmd, color) in enumerate(buttons):
            btn = tk.Button(
                btn_frame, text=text, command=cmd,
                font=("Segoe UI", 10, "bold"),
                fg=BG_DARK, bg=color, activebackground=color,
                relief="flat", cursor="hand2",
                padx=14, pady=8, bd=0
            )
            btn.pack(side="left", padx=(0 if i == 0 else 6, 0), fill="x", expand=True)
            btn.bind("<Enter>", lambda e, b=btn: b.configure(bg=ACCENT_HOVER))
            btn.bind("<Leave>", lambda e, b=btn, c=color: b.configure(bg=c))

        # Hızlı işlemler satırı
        quick_frame = tk.Frame(self, bg=BG_DARK)
        quick_frame.pack(fill="x", padx=20, pady=(0, 5))

        self.auto_var = tk.BooleanVar(value=True)
        tk.Checkbutton(
            quick_frame, text="Güncellemeden sonra otomatik build",
            variable=self.auto_var, font=("Segoe UI", 9),
            fg=FG_DIM, bg=BG_DARK, selectcolor=BG_CARD,
            activebackground=BG_DARK, activeforeground=FG_TEXT
        ).pack(side="left")

        self.full_update_btn = tk.Button(
            quick_frame, text="⚡ Tek Tuşla Güncelle + Build + Başlat",
            command=self._do_full_update,
            font=("Segoe UI", 10, "bold"),
            fg=BG_DARK, bg=FG_TITLE, activebackground=FG_TITLE,
            relief="flat", cursor="hand2", padx=12, pady=4, bd=0
        )
        self.full_update_btn.pack(side="right")

        # İlerleme çubuğu
        self.progress = ttk.Progressbar(self, mode="indeterminate", length=300)
        self.progress.pack(fill="x", padx=20, pady=(5, 0))

        # Konsol
        console_label = tk.Label(
            self, text="Konsol Çıktısı", font=("Segoe UI", 9, "bold"),
            fg=FG_DIM, bg=BG_DARK, anchor="w"
        )
        console_label.pack(fill="x", padx=22, pady=(8, 2))

        self.console = scrolledtext.ScrolledText(
            self, font=("Consolas", 10), wrap="word",
            bg=BG_INPUT, fg=FG_TEXT, insertbackground=FG_TEXT,
            relief="flat", bd=0, padx=12, pady=10, height=14
        )
        self.console.pack(fill="both", expand=True, padx=20, pady=(0, 15))
        self.console.configure(state="disabled")

        # Tag renkleri
        self.console.tag_configure("info", foreground=ACCENT)
        self.console.tag_configure("success", foreground=SUCCESS)
        self.console.tag_configure("warning", foreground=WARNING)
        self.console.tag_configure("error", foreground=ERROR)
        self.console.tag_configure("dim", foreground=FG_DIM)

    # ─── Konsol yardımcıları ──────────────────────────────
    def _log(self, msg, tag="info"):
        self.console.configure(state="normal")
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        self.console.insert("end", f"[{ts}] ", "dim")
        self.console.insert("end", msg + "\n", tag)
        self.console.see("end")
        self.console.configure(state="disabled")

    def _clear_console(self):
        self.console.configure(state="normal")
        self.console.delete("1.0", "end")
        self.console.configure(state="disabled")

    # ─── Komut çalıştırma ─────────────────────────────────
    def _run_cmd(self, cmd, label=""):
        """Komutu çalıştır ve çıktıyı konsola yaz."""
        if label:
            self._log(f"▶ {label}", "info")
        try:
            proc = subprocess.Popen(
                cmd, shell=True, cwd=REPO_DIR,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace"
            )
            output_lines = []
            for line in proc.stdout:
                line = line.rstrip()
                output_lines.append(line)
                self.after(0, self._log, line, "dim")
            proc.wait()
            if proc.returncode == 0:
                self.after(0, self._log, f"✓ Başarılı (kod: {proc.returncode})", "success")
            else:
                self.after(0, self._log, f"✗ Hata (kod: {proc.returncode})", "error")
            return proc.returncode == 0, "\n".join(output_lines)
        except Exception as e:
            self.after(0, self._log, f"✗ Hata: {e}", "error")
            return False, str(e)

    def _start_task(self):
        self._running = True
        self.progress.start(12)

    def _end_task(self):
        self._running = False
        self.progress.stop()
        self._check_status()

    def _threaded(self, func):
        if self._running:
            messagebox.showwarning("Bekle", "Başka bir işlem devam ediyor!")
            return
        threading.Thread(target=func, daemon=True).start()

    # ─── Durum kontrolü ──────────────────────────────────
    def _check_status(self):
        def _inner():
            try:
                # Mevcut commit
                result = subprocess.run(
                    ["git", "log", "--oneline", "-1"],
                    cwd=REPO_DIR, capture_output=True, text=True
                )
                commit = result.stdout.strip() if result.returncode == 0 else "bilinmiyor"
                self.after(0, self.commit_label.configure, {"text": commit})

                # Docker durumu
                result = subprocess.run(
                    ["docker", "ps", "--filter", "name=mert-site", "--format", "{{.Status}}"],
                    cwd=REPO_DIR, capture_output=True, text=True
                )
                docker_status = result.stdout.strip()

                if docker_status and "Up" in docker_status:
                    self.after(0, self.status_dot.configure, {"fg": SUCCESS})
                    self.after(0, self.status_label.configure, {"text": f"Çalışıyor — {docker_status}"})
                else:
                    self.after(0, self.status_dot.configure, {"fg": WARNING})
                    self.after(0, self.status_label.configure, {"text": "Docker container çalışmıyor"})
            except FileNotFoundError:
                self.after(0, self.status_dot.configure, {"fg": ERROR})
                self.after(0, self.status_label.configure, {"text": "Docker bulunamadı!"})
            except Exception as e:
                self.after(0, self.status_dot.configure, {"fg": ERROR})
                self.after(0, self.status_label.configure, {"text": f"Hata: {e}"})

        threading.Thread(target=_inner, daemon=True).start()

    # ─── İşlemler ─────────────────────────────────────────
    def _do_update(self):
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Git Güncelleme Başlatılıyor ━━━", "info")

            ok1, _ = self._run_cmd(
                f"git fetch {REMOTE} {BRANCH}",
                "Uzak depodan çekiliyor..."
            )
            if not ok1:
                self.after(0, self._log, "Fetch başarısız!", "error")
                self._end_task()
                return

            ok2, _ = self._run_cmd(
                f"git reset --hard {REMOTE}/{BRANCH}",
                "Yerel kod güncelleniyor..."
            )
            if ok2:
                self.after(0, self._log, "━━━ Güncelleme Tamamlandı! ━━━", "success")
                if self.auto_var.get():
                    self.after(0, self._log, "Otomatik build başlatılıyor...", "info")
                    self._build_inner()
            else:
                self.after(0, self._log, "Reset başarısız!", "error")

            self._end_task()

        self._threaded(_task)

    def _build_inner(self):
        """Build + başlat (thread içinden çağrılır)."""
        self._run_cmd(
            "docker-compose down",
            "Eski container durduruluyor..."
        )
        self._run_cmd(
            "docker-compose up --build -d",
            "Build ediliyor ve başlatılıyor..."
        )

    def _do_build(self):
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Docker Build Başlatılıyor ━━━", "info")
            self._build_inner()
            self.after(0, self._log, "━━━ Build Tamamlandı! ━━━", "success")
            self._end_task()

        self._threaded(_task)

    def _do_stop(self):
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Docker Durduruluyor ━━━", "warning")
            self._run_cmd("docker-compose down", "Container durduruluyor...")
            self.after(0, self._log, "━━━ Durduruldu ━━━", "warning")
            self._end_task()

        self._threaded(_task)

    def _do_logs(self):
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "━━━ Son 50 Log Satırı ━━━", "info")
            self._run_cmd(
                "docker-compose logs --tail=50",
                "Loglar okunuyor..."
            )
            self._end_task()

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
            self._run_cmd("docker-compose down --rmi local --volumes", "Her şey temizleniyor...")
            self._run_cmd("docker builder prune -f", "Build cache temizleniyor...")
            self.after(0, self._log, "━━━ Temizlik Tamamlandı ━━━", "success")
            self._end_task()

        self._threaded(_task)

    def _do_full_update(self):
        """Tek tuşla: güncelle + build + başlat"""
        def _task():
            self._start_task()
            self.after(0, self._clear_console)
            self.after(0, self._log, "⚡━━━ Tam Güncelleme Başlatılıyor ━━━⚡", "info")

            # 1. Fetch
            ok1, _ = self._run_cmd(f"git fetch {REMOTE} {BRANCH}", "1/3 — Uzak depodan çekiliyor...")
            if not ok1:
                self.after(0, self._log, "Fetch başarısız! İşlem durdu.", "error")
                self._end_task()
                return

            # 2. Reset
            ok2, _ = self._run_cmd(f"git reset --hard {REMOTE}/{BRANCH}", "2/3 — Yerel kod güncelleniyor...")
            if not ok2:
                self.after(0, self._log, "Reset başarısız! İşlem durdu.", "error")
                self._end_task()
                return

            # 3. Build & Start
            self.after(0, self._log, "3/3 — Docker build & başlat...", "info")
            self._run_cmd("docker-compose down", "Eski container durduruluyor...")
            ok3, _ = self._run_cmd("docker-compose up --build -d", "Build ediliyor ve başlatılıyor...")

            if ok3:
                self.after(0, self._log, "⚡━━━ Her Şey Tamam! Site Hazır! ━━━⚡", "success")
                self.after(0, self._log, "→ http://localhost:8080", "success")
            else:
                self.after(0, self._log, "Build başarısız oldu!", "error")

            self._end_task()

        self._threaded(_task)


if __name__ == "__main__":
    app = MertUpdater()
    app.mainloop()
