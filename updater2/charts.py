"""
MERT.4 Updater v2 — charts.py
Hafif tkinter Canvas grafik bileşenleri.
"""
from __future__ import annotations
import tkinter as tk
from typing import Sequence

# Catppuccin Mocha renkleri
BG      = "#1e1e2e"
SURFACE = "#313244"
TEXT    = "#cdd6f4"
BLUE    = "#89b4fa"
GREEN   = "#a6e3a1"
RED     = "#f38ba8"
YELLOW  = "#f9e2af"
MAUVE   = "#cba6f7"
OVERLAY = "#45475a"


class LineChart(tk.Canvas):
    """Basit çizgi grafiği — son N değeri gösterir."""

    def __init__(self, master, width=300, height=100, color=BLUE,
                 bg=BG, max_points=30, **kw):
        super().__init__(master, width=width, height=height,
                         bg=bg, highlightthickness=0, **kw)
        self._color  = color
        self._max    = max_points
        self._values: list[float] = []
        self._w = width
        self._h = height
        self.bind("<Configure>", self._on_resize)

    def _on_resize(self, e):
        self._w = e.width
        self._h = e.height
        self._redraw()

    def push(self, value: float):
        self._values.append(value)
        if len(self._values) > self._max:
            self._values.pop(0)
        self._redraw()

    def set_values(self, values: Sequence[float]):
        self._values = list(values)[-self._max:]
        self._redraw()

    def _redraw(self):
        self.delete("all")
        vals = self._values
        if len(vals) < 2:
            return

        pad = 4
        w, h = self._w - pad * 2, self._h - pad * 2
        lo, hi = min(vals), max(vals)
        span = hi - lo or 1

        def px(i, v):
            x = pad + i / (len(vals) - 1) * w
            y = pad + h - (v - lo) / span * h
            return x, y

        # Grid çizgileri (3 yatay)
        for step in (0.25, 0.5, 0.75):
            y = pad + h - step * h
            self.create_line(pad, y, pad + w, y,
                             fill=OVERLAY, dash=(2, 4))

        # Alan doldurma
        pts = [px(i, v) for i, v in enumerate(vals)]
        poly = list(pts[0])
        for p in pts[1:]:
            poly += list(p)
        poly += [pts[-1][0], pad + h, pad, pad + h]
        self.create_polygon(poly, fill=self._color, stipple="gray25",
                            outline="")

        # Çizgi
        flat = []
        for p in pts:
            flat += list(p)
        self.create_line(flat, fill=self._color, width=2, smooth=True)

        # Son değer etiketi
        lx, ly = pts[-1]
        label = f"{vals[-1]:.1f}"
        self.create_text(lx + 2, ly - 6, text=label,
                         fill=self._color, font=("monospace", 8), anchor="w")


class BarChart(tk.Canvas):
    """Dikey bar grafiği — kategori başına bir çubuk."""

    def __init__(self, master, width=300, height=100, color=MAUVE,
                 bg=BG, **kw):
        super().__init__(master, width=width, height=height,
                         bg=bg, highlightthickness=0, **kw)
        self._color  = color
        self._labels: list[str]  = []
        self._values: list[float] = []
        self._w = width
        self._h = height
        self.bind("<Configure>", self._on_resize)

    def _on_resize(self, e):
        self._w = e.width
        self._h = e.height
        self._redraw()

    def set_data(self, labels: Sequence[str], values: Sequence[float]):
        self._labels = list(labels)
        self._values = list(values)
        self._redraw()

    def _redraw(self):
        self.delete("all")
        if not self._values:
            return

        pad_x, pad_y = 6, 6
        lbl_h = 12
        w = self._w - pad_x * 2
        h = self._h - pad_y * 2 - lbl_h

        n   = len(self._values)
        hi  = max(self._values) or 1
        bw  = w / n * 0.6
        gap = w / n

        for i, (lbl, val) in enumerate(zip(self._labels, self._values)):
            x  = pad_x + i * gap + (gap - bw) / 2
            bh = val / hi * h
            y0 = pad_y + h - bh
            y1 = pad_y + h
            self.create_rectangle(x, y0, x + bw, y1,
                                  fill=self._color, outline="")
            # Değer
            self.create_text(x + bw / 2, y0 - 2,
                             text=f"{val:.0f}", fill=TEXT,
                             font=("monospace", 7), anchor="s")
            # Etiket
            self.create_text(x + bw / 2, self._h - pad_y,
                             text=lbl, fill=OVERLAY,
                             font=("monospace", 7), anchor="s")


class Gauge(tk.Canvas):
    """Yarım daire gösterge — 0-100 değer."""

    def __init__(self, master, size=120, label="", bg=BG, **kw):
        super().__init__(master, width=size, height=size // 2 + 20,
                         bg=bg, highlightthickness=0, **kw)
        self._size  = size
        self._label = label
        self._value = 0.0
        self._draw()

    def set(self, value: float):
        self._value = max(0.0, min(100.0, value))
        self._draw()

    def _draw(self):
        self.delete("all")
        s = self._size
        cx, cy = s // 2, s // 2
        r = s // 2 - 8

        # Arka yay
        self.create_arc(cx - r, cy - r, cx + r, cy + r,
                        start=0, extent=180,
                        style="arc", outline=SURFACE, width=10)

        # Değer yayı — renk yeşil→sarı→kırmızı
        pct = self._value / 100
        color = GREEN if pct < 0.6 else (YELLOW if pct < 0.85 else RED)
        extent = pct * 180
        if extent > 0:
            self.create_arc(cx - r, cy - r, cx + r, cy + r,
                            start=0, extent=extent,
                            style="arc", outline=color, width=10)

        # Değer metni
        self.create_text(cx, cy - 4,
                         text=f"{self._value:.0f}%",
                         fill=TEXT, font=("monospace", 12, "bold"))

        # Etiket
        if self._label:
            self.create_text(cx, cy + 12,
                             text=self._label,
                             fill=OVERLAY, font=("monospace", 8))


class PipelineTracker(tk.Canvas):
    """Güncelleme adımlarını gösteren animasyonlu adım göstergesi."""

    STEPS = ["Yedek", "Fetch", "Reset", "Build", "Bitti"]

    def __init__(self, master, bg=BG, **kw):
        super().__init__(master, height=48, bg=bg,
                         highlightthickness=0, **kw)
        self._active = -1   # -1 = idle
        self._pulse  = False
        self._after_id = None
        self.bind("<Configure>", lambda e: self._draw())

    def start(self, step: int = 0):
        self._active = step
        self._pulse  = True
        self._animate()

    def advance(self, step: int):
        self._active = step
        self._draw()

    def finish(self):
        self._active = len(self.STEPS) - 1
        self._pulse  = False
        if self._after_id:
            self.after_cancel(self._after_id)
        self._draw()

    def reset(self):
        self._active = -1
        self._pulse  = False
        if self._after_id:
            self.after_cancel(self._after_id)
        self._draw()

    def _animate(self):
        self._pulse = not self._pulse
        self._draw()
        self._after_id = self.after(400, self._animate)

    def _draw(self):
        self.delete("all")
        n = len(self.STEPS)
        w = self.winfo_width() or 400
        seg = w / n
        cy  = 24

        for i, label in enumerate(self.STEPS):
            cx = seg * i + seg / 2

            # Bağlantı çizgisi (önceki adımdan bu adıma)
            if i > 0:
                prev_cx = seg * (i - 1) + seg / 2
                line_color = BLUE if i <= self._active else OVERLAY
                self.create_line(prev_cx + 10, cy, cx - 10, cy,
                                 fill=line_color, width=2)

            # Daire
            r = 9
            done  = self._active >= 0 and i < self._active
            active = i == self._active
            idle  = i > self._active or self._active < 0

            if done:
                fill, outline, text_c = GREEN, GREEN, BG
            elif active:
                fill = BLUE if self._pulse else "#6e9fe0"
                outline, text_c = BLUE, BG
            else:
                fill, outline, text_c = BG, OVERLAY, OVERLAY

            self.create_oval(cx - r, cy - r, cx + r, cy + r,
                             fill=fill, outline=outline, width=2)
            self.create_text(cx, cy, text=str(i + 1) if not done else "✓",
                             fill=text_c, font=("monospace", 7, "bold"))

            # Etiket
            lbl_color = TEXT if (done or active) else OVERLAY
            self.create_text(cx, cy + r + 7, text=label,
                             fill=lbl_color, font=("monospace", 8))
