@echo off
chcp 65001 >nul
title MERT.4 Watchdog — Yedek Sunucu İzleme

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║    MERT.4 Watchdog — Yedek Sunucu İzleme Servisi    ║
echo  ║    Durdurmak için bu pencereyi kapatın               ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: Python kontrolü
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [HATA] Python bulunamadı. KUR_YEDEK.bat ile kurulum yapın.
    pause & exit /b 1
)

:: Config kontrolü
if not exist "%~dp0watchdog_config.json" (
    echo  [HATA] watchdog_config.json bulunamadı!
    echo  KUR_YEDEK.bat ile önce kurulum yapın.
    pause & exit /b 1
)

echo  Watchdog başlatılıyor...
echo  Log dosyası: %~dp0watchdog.log
echo.

cd /d "%~dp0"
python watchdog.py
if %errorlevel% neq 0 (
    echo.
    echo  [HATA] Watchdog beklenmedik şekilde durdu. Log dosyasını inceleyin.
    pause
)
