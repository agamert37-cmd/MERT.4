@echo off
title MERT.4 — Güncelleme Merkezi
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       MERT.4  Güncelleme Merkezi         ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ── Python kontrolü ─────────────────────────────────────────────────────────
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo  [HATA]  Python bulunamadi!
    echo  Cozum   : https://python.org/downloads
    echo  Not     : Kurulumda "Add Python to PATH" secenegini isaretleyin.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo  [OK]  %PY_VER% bulundu.

:: ── tkinter kontrolü ────────────────────────────────────────────────────────
python -c "import tkinter" >nul 2>nul
if %errorlevel% neq 0 (
    echo  [HATA]  tkinter modulu bulunamadi!
    echo  Cozum   : Python'u python.org'dan yeniden yukleyin.
    echo  Kurulum : "Customize installation" → "tcl/tk and IDLE" secin.
    echo.
    pause
    exit /b 1
)
echo  [OK]  tkinter hazir.

:: ── Docker kontrolü ─────────────────────────────────────────────────────────
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo  [UYARI] Docker bulunamadi — GUI acilacak ama Docker islemleri calismazs.
) else (
    for /f "tokens=*" %%d in ('docker --version 2^>^&1') do set DOCKER_VER=%%d
    echo  [OK]  %DOCKER_VER% bulundu.
)

:: ── Git kontrolü ────────────────────────────────────────────────────────────
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo  [UYARI] Git bulunamadi — Güncelleme islemleri calismazs.
) else (
    for /f "tokens=*" %%g in ('git --version 2^>^&1') do set GIT_VER=%%g
    echo  [OK]  %GIT_VER% bulundu.
)

echo.
echo  Uygulama baslatiliyor...
echo  ─────────────────────────────────────────────
echo.

:: ── Uygulamayı başlat ───────────────────────────────────────────────────────
python updater.py
set EXIT_CODE=%errorlevel%

echo.
echo  ─────────────────────────────────────────────
if %EXIT_CODE% equ 0 (
    echo  [OK]  Uygulama normal kapatildi.
) else (
    echo  [HATA]  Uygulama beklenmedik sekilde kapandi. ^(Kod: %EXIT_CODE%^)
    echo  Hata ayiklamak icin: python updater.py
    pause
)
