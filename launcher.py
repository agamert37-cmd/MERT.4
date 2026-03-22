#!/usr/bin/env python3
"""
MERT.4 — Güncelleme Merkezi v2.0
Docker Compose tabanlı deployment kontrol paneli
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import subprocess
import threading
import time
import os
import sys
import json
import re
from datetime import datetime

# ─── Yapılandırma ─────────────────────────────────────────────────────────────

REPO_DIR   = os.path.dirname(os.path.abspath(__file__))
COMPOSE_CMD = "docker compose"
APP_NAME   = "MERT.4"
PORT       = 8080
BRANCH_CMD = ["git", "rev-parse", "--abbrev-ref", "HEAD"]

# ─── Renkler (koyu tema) ───────────────────────────────────────────────────────

BG         = "#0a0a0a"
BG2        = "#111111"
BG3        = "#1a1a1a"
BORDER     = "#222222"
TEXT       = "#e8e8e8"
TEXT_DIM   = "#555555"
TEXT_MID   = "#888888"
ACCENT     = "#3b82f6"   # mavi
GREEN      = "#22c55e"
RED        = "#ef4444"
ORANGE     = "#f97316"
YELLOW     = "#eab308"
PURPLE     = "#a855f7"
CYAN       = "#06b6d4"
FONT_MONO  = ("Consolas", 10)
FONT_BODY  = ("Segoe UI", 10)
FONT_BOLD  = ("Segoe UI", 10, "bold")
FONT_BIG   = ("Segoe UI", 13, "bold")
FONT_TITLE = ("Segoe UI", 17, "bold")
FONT_SM    = ("Segoe UI", 9)

# ─── Yardımcılar ──────────────────────────────────────────────────────────────

def run(cmd: list[str] | str, **kw):
    return subprocess.run(
        cmd, cwd=REPO_DIR, capture_output=True, text=True,
        shell=isinstance(cmd, str), **kw
    )

def get_branch() -> str:
    r = run(BRANCH_CMD)
    return r.stdout.strip() if r.returncode == 0 else "—"

def get_commits(n=6) -> list[dict]:
    r = run(["git", "log", f"-{n}", "--pretty=format:%h|%ar|%s"])
    if r.returncode != 0:
        return []
    out = []
    for line in r.stdout.strip().splitlines():
        parts = line.split("|", 2)
        if len(parts) == 3:
            out.append({"hash": parts[0], "ago": parts[1], "msg": parts[2]})
    return out

def get_container_status() -> tuple[bool, str]:
    """(is_running, uptime_string)"""
    r = run(f"{COMPOSE_CMD} ps --format json", shell=True)
    if r.returncode != 0:
        return False, ""
    try:
        data = json.loads(r.stdout)
        if isinstance(data, list) and data:
            svc = data[0]
            state = svc.get("State", "").lower()
            running = state == "running"
            status = svc.get("Status", "")
            return running, status
    except Exception:
        pass
    # fallback: plain text ps
    r2 = run(f"{COMPOSE_CMD} ps", shell=True)
    if "Up" in r2.stdout:
        m = re.search(r"Up (.+?)(\s{2,}|$)", r2.stdout)
        uptime = m.group(1).strip() if m else ""
        return True, f"Up {uptime}"
    return False, ""

def get_last_commit_short() -> str:
    r = run(["git", "log", "-1", "--pretty=format:%h %s"])
    return r.stdout.strip() if r.returncode == 0 else ""

# ─── Ana Pencere ───────────────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(f"{APP_NAME}  Güncelleme Merkezi")
        self.configure(bg=BG)
        self.geometry("960x700")
        self.minsize(860, 600)
        self.resizable(True, True)

        # Durum değişkenleri
        self._running    = False
        self._proc       = None   # aktif subprocess (build vb.)
        self._build_start = 0.0
        self._timer_id   = None
        self._auto_build = tk.BooleanVar(value=True)
        self._status_ok  = False
        self._uptime_str = ""
        self._poll_after = None

        # İkon (opsiyonel)
        try:
            self.iconbitmap(os.path.join(REPO_DIR, "icon.ico"))
        except Exception:
            pass

        self._build_ui()
        self._bind_keys()
        self._poll_status()      # ilk durum sorgusu
        self._schedule_poll()    # periyodik sorgulama

    # ── UI İnşası ──────────────────────────────────────────────────────────────

    def _build_ui(self):
        # ── Başlık Çubuğu ────────────────────────────────────────────────────
        hdr = tk.Frame(self, bg=BG, pady=14, padx=20)
        hdr.pack(fill="x")

        # Sol: logo + başlık
        left = tk.Frame(hdr, bg=BG)
        left.pack(side="left")
        tk.Label(left, text="⚙", font=("Segoe UI", 20), bg=BG, fg=ACCENT).pack(side="left", padx=(0,10))
        tk.Label(left, text=APP_NAME, font=FONT_TITLE, bg=BG, fg=TEXT).pack(side="left")
        tk.Label(left, text=" Güncelleme Merkezi", font=("Segoe UI", 14), bg=BG, fg=TEXT_MID).pack(side="left")

        # Sağ: branch & compose bilgisi
        right = tk.Frame(hdr, bg=BG)
        right.pack(side="right")
        branch = get_branch()
        tk.Label(right, text=f"dal: {branch}  •  compose: {COMPOSE_CMD}",
                 font=FONT_SM, bg=BG, fg=TEXT_DIM).pack(anchor="e")

        # Ayırıcı
        sep = tk.Frame(self, bg=BORDER, height=1)
        sep.pack(fill="x")

        # ── Durum Şeridi ─────────────────────────────────────────────────────
        status_frame = tk.Frame(self, bg=BG2, padx=20, pady=12)
        status_frame.pack(fill="x")

        # Sol: dot + durum metni + commit
        sf_left = tk.Frame(status_frame, bg=BG2)
        sf_left.pack(side="left")

        self._dot = tk.Label(sf_left, text="●", font=("Segoe UI", 14), bg=BG2, fg=TEXT_DIM)
        self._dot.pack(side="left", padx=(0, 8))
        self._status_lbl = tk.Label(sf_left, text="Kontrol ediliyor…",
                                     font=FONT_BOLD, bg=BG2, fg=TEXT_MID)
        self._status_lbl.pack(side="left")

        # Sağ: Aç butonu + son commit
        sf_right = tk.Frame(status_frame, bg=BG2)
        sf_right.pack(side="right")

        self._commit_lbl = tk.Label(sf_right, text="", font=FONT_MONO,
                                     bg=BG2, fg=TEXT_DIM)
        self._commit_lbl.pack(side="left", padx=(0, 12))

        self._open_btn = self._btn(sf_right, "  Aç", self._open_browser,
                                   bg="#1e3a5f", fg="#60a5fa", padx=14, pady=4)
        self._open_btn.pack(side="left")

        self._update_status_display()

        # ── Araç Çubuğu ───────────────────────────────────────────────────────
        toolbar = tk.Frame(self, bg=BG, padx=12, pady=10)
        toolbar.pack(fill="x")

        btn_defs = [
            ("⟳  Güncelle",          self._do_pull,      "#1e293b", "#38bdf8",  "Ctrl+R"),
            ("▲  Build & Başlat",    self._do_build,     "#14281e", "#4ade80",  "Ctrl+B"),
            ("↺  Yeniden Başlat",    self._do_restart,   "#1e1e2e", "#818cf8",  None),
            ("■  Durdur",            self._do_stop,      "#1e1a16", "#fb923c",  None),
            ("☰  Loglar",            self._do_logs,      "#1a1a1a", "#94a3b8",  None),
            ("✕  Temizle",           self._clear_console,"#1e1212", "#f87171",  None),
        ]

        for label, cmd_fn, bg_col, fg_col, accel in btn_defs:
            text = f"{label}  [{accel}]" if accel else label
            b = self._btn(toolbar, text, cmd_fn, bg=bg_col, fg=fg_col, padx=12, pady=6)
            b.pack(side="left", padx=(0, 6))

        # Orta boşluk
        tk.Frame(toolbar, bg=BG).pack(side="left", expand=True, fill="x")

        # Diff butonu
        diff_frm = tk.Frame(toolbar, bg=BG)
        diff_frm.pack(side="left", padx=(0, 12))
        tk.Checkbutton(
            diff_frm, text="Güncellemeden sonra otomatik build",
            variable=self._auto_build,
            bg=BG, fg=TEXT_MID, selectcolor=BG3,
            activebackground=BG, activeforeground=TEXT,
            font=FONT_SM, bd=0, highlightthickness=0
        ).pack(side="left")
        self._btn(diff_frm, "◑ Diff", self._do_diff, bg="#1a1a2e", fg="#818cf8", padx=10, pady=5).pack(side="left", padx=(8,0))

        # ── Progress Çubuğu ───────────────────────────────────────────────────
        prog_frame = tk.Frame(self, bg=BG, padx=20, pady=4)
        prog_frame.pack(fill="x")

        self._progress = ttk.Progressbar(prog_frame, mode="determinate",
                                          style="Green.Horizontal.TProgressbar")
        self._progress.pack(side="left", fill="x", expand=True)

        self._elapsed_lbl = tk.Label(prog_frame, text="", font=FONT_MONO,
                                      bg=BG, fg=TEXT_MID, width=8, anchor="e")
        self._elapsed_lbl.pack(side="right")

        self._style_progress()

        # ── Tek Tuşla Büyük Buton ─────────────────────────────────────────────
        big_frame = tk.Frame(self, bg=BG, padx=20, pady=8)
        big_frame.pack(fill="x")

        self._big_btn = tk.Button(
            big_frame,
            text="⚡  Tek Tuşla: Güncelle + Build + Başlat  [F5]",
            command=self._do_full_deploy,
            bg="#1a2e1a", fg="#4ade80",
            font=("Segoe UI", 11, "bold"),
            activebackground="#1f3a1f", activeforeground="#86efac",
            relief="flat", bd=0, cursor="hand2",
            padx=0, pady=10
        )
        self._big_btn.pack(fill="x")
        self._add_hover(self._big_btn, "#1a2e1a", "#1f3a1f")

        # ── İçerik Alanı (Sol: Commitler | Sağ: Konsol) ────────────────────
        content = tk.Frame(self, bg=BG)
        content.pack(fill="both", expand=True, padx=20, pady=(0, 16))

        # Sol: Son Commitler
        left_pane = tk.Frame(content, bg=BG2, bd=0, relief="flat",
                              highlightbackground=BORDER, highlightthickness=1)
        left_pane.pack(side="left", fill="both", expand=False, padx=(0, 10))
        left_pane.config(width=310)
        left_pane.pack_propagate(False)

        commit_hdr = tk.Frame(left_pane, bg=BG2, padx=14, pady=10)
        commit_hdr.pack(fill="x")
        tk.Label(commit_hdr, text="Son Commitler", font=FONT_BOLD, bg=BG2, fg=TEXT).pack(side="left")
        self._refresh_commits_btn = tk.Label(commit_hdr, text="⟳", font=("Segoe UI", 12),
                                              bg=BG2, fg=TEXT_DIM, cursor="hand2")
        self._refresh_commits_btn.pack(side="right")
        self._refresh_commits_btn.bind("<Button-1>", lambda e: self._load_commits())

        sep2 = tk.Frame(left_pane, bg=BORDER, height=1)
        sep2.pack(fill="x")

        self._commits_frame = tk.Frame(left_pane, bg=BG2)
        self._commits_frame.pack(fill="both", expand=True, padx=2)
        self._load_commits()

        # Sağ: Konsol
        right_pane = tk.Frame(content, bg=BG2, bd=0, relief="flat",
                               highlightbackground=BORDER, highlightthickness=1)
        right_pane.pack(side="left", fill="both", expand=True)

        con_hdr = tk.Frame(right_pane, bg=BG2, padx=14, pady=10)
        con_hdr.pack(fill="x")
        tk.Label(con_hdr, text="Konsol Çıktısı", font=FONT_BOLD, bg=BG2, fg=TEXT).pack(side="left")
        tk.Frame(con_hdr, bg=BG2).pack(side="left", expand=True, fill="x")
        self._btn(con_hdr, "Kopyala", self._copy_console, bg=BG3, fg=TEXT_MID, padx=8, pady=2).pack(side="left", padx=(0,6))
        self._btn(con_hdr, "✕ Temizle", self._clear_console, bg="#1e1212", fg="#f87171", padx=8, pady=2).pack(side="left")

        sep3 = tk.Frame(right_pane, bg=BORDER, height=1)
        sep3.pack(fill="x")

        self._console = scrolledtext.ScrolledText(
            right_pane, bg="#050505", fg="#d4d4d4",
            font=FONT_MONO, insertbackground=TEXT,
            relief="flat", bd=0, padx=12, pady=10,
            state="disabled", wrap="word"
        )
        self._console.pack(fill="both", expand=True)

        # Konsol renk etiketleri
        self._console.tag_config("ok",      foreground=GREEN)
        self._console.tag_config("err",     foreground=RED)
        self._console.tag_config("warn",    foreground=YELLOW)
        self._console.tag_config("info",    foreground=CYAN)
        self._console.tag_config("dim",     foreground=TEXT_DIM)
        self._console.tag_config("accent",  foreground=ACCENT)
        self._console.tag_config("purple",  foreground=PURPLE)
        self._console.tag_config("bold",    foreground=TEXT, font=("Consolas", 10, "bold"))

        self._log(f"MERT.4 Güncelleme Merkezi başlatıldı — {datetime.now().strftime('%H:%M:%S')}", "info")
        self._log(f"Klasör: {REPO_DIR}", "dim")
        self._log(f"Branch: {get_branch()}", "dim")

    # ── Stil yardımcıları ──────────────────────────────────────────────────────

    def _btn(self, parent, text, cmd, bg=BG3, fg=TEXT, padx=10, pady=5):
        b = tk.Button(
            parent, text=text, command=cmd,
            bg=bg, fg=fg, font=FONT_BOLD,
            activebackground=self._lighten(bg), activeforeground=fg,
            relief="flat", bd=0, cursor="hand2",
            padx=padx, pady=pady
        )
        self._add_hover(b, bg, self._lighten(bg))
        return b

    @staticmethod
    def _lighten(hex_color: str) -> str:
        try:
            r, g, b = int(hex_color[1:3],16), int(hex_color[3:5],16), int(hex_color[5:7],16)
            r = min(255, r+25); g = min(255, g+25); b = min(255, b+25)
            return f"#{r:02x}{g:02x}{b:02x}"
        except Exception:
            return hex_color

    @staticmethod
    def _add_hover(widget, normal, hover):
        widget.bind("<Enter>", lambda e: widget.config(bg=hover))
        widget.bind("<Leave>", lambda e: widget.config(bg=normal))

    def _style_progress(self):
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Green.Horizontal.TProgressbar",
                         troughcolor=BG3, background=GREEN,
                         thickness=6, borderwidth=0)

    # ── Klavye kısayolları ─────────────────────────────────────────────────────

    def _bind_keys(self):
        self.bind("<Control-r>", lambda e: self._do_pull())
        self.bind("<Control-R>", lambda e: self._do_pull())
        self.bind("<Control-b>", lambda e: self._do_build())
        self.bind("<Control-B>", lambda e: self._do_build())
        self.bind("<F5>",        lambda e: self._do_full_deploy())
        self.bind("<Escape>",    lambda e: self._abort())

    # ── Durum Sorgulama ────────────────────────────────────────────────────────

    def _poll_status(self):
        def worker():
            ok, uptime = get_container_status()
            commit = get_last_commit_short()
            self.after(0, lambda: self._apply_status(ok, uptime, commit))
        threading.Thread(target=worker, daemon=True).start()

    def _apply_status(self, ok: bool, uptime: str, commit: str):
        self._status_ok  = ok
        self._uptime_str = uptime
        self._update_status_display()
        short = commit[:72] + "…" if len(commit) > 72 else commit
        self._commit_lbl.config(text=short)

    def _update_status_display(self):
        if self._status_ok:
            self._dot.config(fg=GREEN)
            label = f"✓  Çalışıyor"
            if self._uptime_str:
                label += f" — {self._uptime_str}"
            self._status_lbl.config(text=label, fg=GREEN)
        else:
            self._dot.config(fg=RED)
            self._status_lbl.config(text="✗  Durdu", fg=RED)

    def _schedule_poll(self):
        self._poll_after = self.after(8000, self._on_poll_tick)

    def _on_poll_tick(self):
        self._poll_status()
        self._schedule_poll()

    # ── Commit Listesi ─────────────────────────────────────────────────────────

    def _load_commits(self):
        for w in self._commits_frame.winfo_children():
            w.destroy()
        commits = get_commits(8)
        for i, c in enumerate(commits):
            row = tk.Frame(self._commits_frame, bg=BG2, cursor="hand2")
            row.pack(fill="x", padx=8, pady=3)

            # Hash (renkli)
            hash_lbl = tk.Label(row, text=c["hash"], font=("Consolas", 9, "bold"),
                                  bg=BG2, fg=ACCENT, width=8, anchor="w")
            hash_lbl.pack(side="left")

            # Mesaj
            msg = c["msg"][:38] + "…" if len(c["msg"]) > 38 else c["msg"]
            msg_lbl = tk.Label(row, text=msg, font=FONT_SM,
                                bg=BG2, fg=TEXT if i == 0 else TEXT_MID, anchor="w")
            msg_lbl.pack(side="left", padx=(4,0))

            # Zaman
            ago_lbl = tk.Label(row, text=c["ago"], font=("Segoe UI", 8),
                                 bg=BG2, fg=TEXT_DIM, anchor="e")
            ago_lbl.pack(side="right")

            # Hover efekti
            for w in (row, hash_lbl, msg_lbl, ago_lbl):
                w.bind("<Enter>", lambda e, r=row: r.config(bg=BG3))
                w.bind("<Leave>", lambda e, r=row: r.config(bg=BG2))

        if not commits:
            tk.Label(self._commits_frame, text="Git log alınamadı",
                     font=FONT_SM, bg=BG2, fg=TEXT_DIM).pack(pady=20)

    # ── Konsol ────────────────────────────────────────────────────────────────

    def _log(self, text: str, tag: str = ""):
        self._console.config(state="normal")
        ts = datetime.now().strftime("%H:%M:%S")
        self._console.insert("end", f"[{ts}] ", "dim")
        self._console.insert("end", text + "\n", tag or "")
        self._console.see("end")
        self._console.config(state="disabled")

    def _clear_console(self):
        self._console.config(state="normal")
        self._console.delete("1.0", "end")
        self._console.config(state="disabled")

    def _copy_console(self):
        text = self._console.get("1.0", "end")
        self.clipboard_clear()
        self.clipboard_append(text)
        self._log("Konsol kopyalandı", "info")

    # ── Progress ──────────────────────────────────────────────────────────────

    def _start_timer(self):
        self._build_start = time.time()
        self._progress["value"] = 0
        self._tick_timer()

    def _tick_timer(self):
        if self._running:
            elapsed = time.time() - self._build_start
            self._elapsed_lbl.config(text=f"{elapsed:.1f}s")
            # Progress bar: ilk 120s için
            pct = min(100, elapsed / 120 * 100)
            self._progress["value"] = pct
            self._timer_id = self.after(200, self._tick_timer)

    def _stop_timer(self):
        if self._timer_id:
            self.after_cancel(self._timer_id)
            self._timer_id = None
        elapsed = time.time() - self._build_start
        self._elapsed_lbl.config(text=f"{elapsed:.1f}s")
        self._progress["value"] = 100

    # ── Komut Çalıştırıcı ────────────────────────────────────────────────────

    def _run_cmd(self, cmd: str, label: str, on_done=None):
        if self._running:
            self._log("Başka bir işlem sürüyor, lütfen bekleyin", "warn")
            return
        self._running = True
        self._log(f"▶  {label}", "bold")
        self._log(f"$ {cmd}", "accent")
        self._start_timer()
        self._set_buttons_state("disabled")

        def worker():
            try:
                proc = subprocess.Popen(
                    cmd, shell=True, cwd=REPO_DIR,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, bufsize=1
                )
                self._proc = proc
                for line in proc.stdout:
                    line = line.rstrip()
                    if not line:
                        continue
                    tag = self._classify_line(line)
                    self.after(0, lambda l=line, t=tag: self._log(l, t))
                proc.wait()
                ok = proc.returncode == 0
            except Exception as ex:
                self.after(0, lambda: self._log(f"Hata: {ex}", "err"))
                ok = False
            finally:
                self._proc = None
                self.after(0, lambda: self._on_cmd_done(ok, on_done))
        threading.Thread(target=worker, daemon=True).start()

    def _on_cmd_done(self, ok: bool, on_done=None):
        self._stop_timer()
        self._running = False
        self._set_buttons_state("normal")
        if ok:
            self._log("✓ Tamamlandı", "ok")
        else:
            self._log("✗ Hata ile sonuçlandı", "err")
        self._poll_status()
        self._load_commits()
        if on_done:
            on_done(ok)

    @staticmethod
    def _classify_line(line: str) -> str:
        ll = line.lower()
        if any(k in ll for k in ("error", "failed", "hata", "✗")):
            return "err"
        if any(k in ll for k in ("warning", "warn", "uyarı")):
            return "warn"
        if any(k in ll for k in ("done", "success", "✓", "başarılı", "built", "started", "created")):
            return "ok"
        if any(k in ll for k in ("pulling", "building", "downloading", "unpacking", "step")):
            return "info"
        return ""

    def _set_buttons_state(self, state: str):
        for w in self.winfo_children():
            self._set_frame_state(w, state)

    def _set_frame_state(self, widget, state):
        if isinstance(widget, (tk.Button,)):
            try:
                widget.config(state=state)
            except Exception:
                pass
        for child in widget.winfo_children():
            self._set_frame_state(child, state)

    def _abort(self):
        if self._proc:
            try:
                self._proc.terminate()
                self._log("İşlem durduruldu (ESC)", "warn")
            except Exception:
                pass

    # ── Eylemler ──────────────────────────────────────────────────────────────

    def _do_pull(self):
        def after_pull(ok):
            if ok and self._auto_build.get():
                self.after(500, self._do_build)
        self._run_cmd("git pull", "Git Pull", on_done=after_pull)

    def _do_build(self):
        cmd = f"{COMPOSE_CMD} up --build -d"
        self._run_cmd(cmd, "Build & Başlat")

    def _do_restart(self):
        cmd = f"{COMPOSE_CMD} restart"
        self._run_cmd(cmd, "Yeniden Başlat")

    def _do_stop(self):
        if not messagebox.askyesno("Durdur", "Container'ı durdurmak istediğinizden emin misiniz?"):
            return
        cmd = f"{COMPOSE_CMD} down"
        self._run_cmd(cmd, "Durdur")

    def _do_logs(self):
        cmd = f"{COMPOSE_CMD} logs --tail=100 --no-color"
        self._run_cmd(cmd, "Loglar")

    def _do_full_deploy(self):
        self._log("⚡ Tam Güncelleme başlatılıyor…", "purple")
        def after_pull(ok):
            if ok:
                def after_build(ok2):
                    if ok2:
                        elapsed = time.time() - self._build_start
                        self._log(f"→  http://localhost:{PORT}", "ok")
                        self._log(f"Tam Güncelleme  ⏱  {elapsed:.1f}s", "purple")
                self._run_cmd(f"{COMPOSE_CMD} up --build -d", "Build & Başlat", on_done=after_build)
        self._run_cmd("git pull", "Git Pull", on_done=after_pull)

    def _do_diff(self):
        self._run_cmd("git diff --stat HEAD~1 HEAD", "Son Commit Diff")

    def _open_browser(self):
        import webbrowser
        webbrowser.open(f"http://localhost:{PORT}")

    # ── Kapanış ───────────────────────────────────────────────────────────────

    def on_close(self):
        if self._running:
            if not messagebox.askyesno("Çıkış", "Bir işlem sürüyor. Çıkmak istiyor musunuz?"):
                return
        if self._poll_after:
            self.after_cancel(self._poll_after)
        self.destroy()


# ─── Giriş noktası ────────────────────────────────────────────────────────────

def main():
    app = App()
    app.protocol("WM_DELETE_WINDOW", app.on_close)
    app.mainloop()

if __name__ == "__main__":
    main()
