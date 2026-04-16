@echo off
title MERT.4 — Sistem Tanılaması
chcp 65001 >nul
cd /d "%~dp0"

set LOG=%~dp0tanila_raporu.txt

echo MERT.4 Sistem Tanilama Raporu > %LOG%
echo Tarih: %date% %time% >> %LOG%
echo. >> %LOG%

echo.
echo  ═══════════════════════════════════════════════
echo  MERT.4 — Sistem Tanılaması
echo  Rapor dosyasi: %LOG%
echo  ═══════════════════════════════════════════════
echo.

:: ── Python ──────────────────────────────────────────────────────────────────
echo [1] Python kontrolu...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo  [HATA] Python YOK - python.org/downloads adresinden kurun
    echo [HATA] Python YOK >> %LOG%
) else (
    python --version >> %LOG% 2>&1
    python -c "import sys; print('Python yolu:', sys.executable)" >> %LOG%
    echo  [OK] Python bulundu
)

:: ── tkinter ─────────────────────────────────────────────────────────────────
echo [2] tkinter kontrolu...
python -c "import tkinter; print('tkinter OK, version:', tkinter.TkVersion)" >> %LOG% 2>&1
if %errorlevel% neq 0 (
    echo  [HATA] tkinter YÜKLENEMIYOR - python.org'dan Python'u "Customize" ile kurun
    echo [HATA] tkinter yuklenemiyor >> %LOG%
) else (
    echo  [OK] tkinter hazir
)

:: ── Docker ──────────────────────────────────────────────────────────────────
echo [3] Docker kontrolu...
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo  [HATA] Docker YOK - docker.com/products/docker-desktop
    echo [HATA] Docker YOK >> %LOG%
) else (
    docker --version >> %LOG% 2>&1
    docker info >nul 2>nul
    if %errorlevel% neq 0 (
        echo  [HATA] Docker kurulu ama CALISMIYOR - Docker Desktop'u acin
        echo [HATA] Docker calismiyor >> %LOG%
    ) else (
        echo  [OK] Docker calisiyor
        echo [OK] Docker calisiyor >> %LOG%
        docker compose version >> %LOG% 2>&1
    )
)

:: ── Git ─────────────────────────────────────────────────────────────────────
echo [4] Git kontrolu...
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo  [HATA] Git YOK - git-scm.com/download/win
    echo [HATA] Git YOK >> %LOG%
) else (
    git --version >> %LOG% 2>&1
    echo  [OK] Git bulundu
    echo. >> %LOG%
    echo Git remote: >> %LOG%
    git remote -v >> %LOG% 2>&1
    echo. >> %LOG%
    echo Son 3 commit: >> %LOG%
    git log --oneline -3 >> %LOG% 2>&1
)

:: ── node_modules ────────────────────────────────────────────────────────────
echo [5] node_modules kontrolu...
if exist "node_modules" (
    echo  [OK] node_modules klasoru mevcut
    echo [OK] node_modules mevcut >> %LOG%
) else (
    echo  [UYARI] node_modules yok - 'npm install' ile kurun
    echo [UYARI] node_modules yok >> %LOG%
)

:: ── .env ────────────────────────────────────────────────────────────────────
echo [6] .env dosyasi kontrolu...
if exist ".env" (
    echo  [OK] .env mevcut
    echo [OK] .env mevcut >> %LOG%
) else (
    echo  [UYARI] .env dosyasi yok ^(opsiyonel, varsayilan degerler kullanilacak^)
    echo [UYARI] .env yok >> %LOG%
)

:: ── Hata logu ───────────────────────────────────────────────────────────────
echo [7] Onceki hata logu...
if exist "updater_hata.log" (
    echo  Son hata logu bulundu - icerigi asagida:
    echo. >> %LOG%
    echo === updater_hata.log icerigi === >> %LOG%
    type updater_hata.log >> %LOG%
    echo. >> %LOG%
    echo  --- Son hata ---
    type updater_hata.log
    echo  ----------------
) else (
    echo  Onceki hata logu yok
)

echo.
echo  ═══════════════════════════════════════════════
echo  Rapor kaydedildi: %LOG%
echo  Bu dosyayi destek icin paylasabilirsiniz.
echo  ═══════════════════════════════════════════════
echo.
pause
