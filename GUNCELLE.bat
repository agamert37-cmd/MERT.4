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
    echo.
    echo  Cozum 1: https://python.org/downloads adresine git
    echo           Kurulumda "Add Python to PATH" tikini MUTLAKA secin!
    echo.
    echo  Cozum 2: Microsoft Store'dan yuklediysen KALDIRIP python.org'dan kurun.
    echo           Store versiyonu tkinter iceremeyebilir.
    echo.
    pause
    exit /b 1
)

python -c "import sys; print('Python ' + sys.version.split()[0])" > "%TEMP%\pyver.txt" 2>nul
set /p PY_VER=<"%TEMP%\pyver.txt"
del "%TEMP%\pyver.txt" >nul 2>nul
echo  [OK]  %PY_VER% bulundu.

:: ── tkinter kontrolü ────────────────────────────────────────────────────────
python -c "import tkinter" >nul 2>nul
if %errorlevel% neq 0 (
    echo  [HATA]  tkinter modulu bulunamadi!
    echo.
    echo  Cozum   : Python'u python.org'dan yeniden yukleyin.
    echo  Kurulum : Kurulumda "Customize installation" tiklayin
    echo            Sonraki ekranda "tcl/tk and IDLE" tikli olsun.
    echo.
    pause
    exit /b 1
)
echo  [OK]  tkinter hazir.

:: ── Docker kontrolü ─────────────────────────────────────────────────────────
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo  [UYARI] Docker bulunamadi!
    echo          Cozum: https://www.docker.com/products/docker-desktop
    echo          Docker Desktop'u kurun ve baslatin.
    echo.
) else (
    :: Docker calisiyor mu kontrol et
    docker info >nul 2>nul
    if %errorlevel% neq 0 (
        echo  [UYARI] Docker kurulu ama CALISMIYOR!
        echo          Docker Desktop uygulamasini acin ve bekleme ikonu gecinceye kadar bekleyin.
        echo.
    ) else (
        for /f "tokens=*" %%d in ('docker --version 2^>^&1') do set DOCKER_VER=%%d
        echo  [OK]  %DOCKER_VER% - Calisıyor.
    )
)

:: ── Git kontrolü ────────────────────────────────────────────────────────────
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo  [UYARI] Git bulunamadi!
    echo          Cozum: https://git-scm.com/download/win adresinden kurun.
    echo.
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
    echo.
    if exist "%~dp0updater_hata.log" (
        echo  Hata detaylari: %~dp0updater_hata.log
        echo.
        echo  ─── Hata Ozeti ───────────────────────────────
        type "%~dp0updater_hata.log"
        echo  ──────────────────────────────────────────────
    ) else (
        echo  Hata ayiklamak icin terminalde calistirin: python updater.py
    )
    echo.
    pause
)
