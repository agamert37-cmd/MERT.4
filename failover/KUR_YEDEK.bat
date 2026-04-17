@echo off
chcp 65001 >nul
title MERT.4 Yedek Sunucu Kurulumu

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║       MERT.4 Yedek Sunucu Kurulum Sihirbazı         ║
echo  ║   Bu script İKİNCİL bilgisayarda çalıştırılmalıdır  ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: ── Python kontrolü ──────────────────────────────────────────────────────────
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [HATA] Python bulunamadı!
    echo  Python 3.11+ kurulumu için: https://www.python.org/downloads/
    pause & exit /b 1
)
echo  [OK] Python bulundu.

:: ── pip bağımlılıkları ────────────────────────────────────────────────────────
echo.
echo  Gerekli Python paketleri kuruluyor...
pip install -r "%~dp0requirements.txt" --quiet
if %errorlevel% neq 0 (
    echo  [HATA] Paket kurulumu başarısız!
    pause & exit /b 1
)
echo  [OK] Paketler kuruldu.

:: ── CouchDB kontrolü (bu bilgisayarda) ───────────────────────────────────────
echo.
echo  Bu bilgisayardaki CouchDB kontrol ediliyor...
curl -s -o nul http://localhost:5984/ 2>nul
if %errorlevel% neq 0 (
    echo.
    echo  [UYARI] Bu bilgisayarda CouchDB çalışmıyor!
    echo.
    echo  CouchDB kurulumu için iki seçenek:
    echo    1. https://couchdb.apache.org/  adresinden kurulum paketini indirin
    echo    2. Docker ile: docker run -d --name mert-couchdb-replica
    echo       -e COUCHDB_USER=adm1n -e COUCHDB_PASSWORD=135790
    echo       -p 5984:5984 couchdb:3
    echo.
    echo  CouchDB kurulumu tamamlandıktan sonra bu scripti tekrar çalıştırın.
    pause & exit /b 1
)
echo  [OK] CouchDB çalışıyor.

:: ── Config kontrol ────────────────────────────────────────────────────────────
echo.
echo  watchdog_config.json kontrol ediliyor...
if not exist "%~dp0watchdog_config.json" (
    echo  [HATA] watchdog_config.json bulunamadı!
    echo  MERT.4\failover\ klasörü eksiksiz kopyalanmış olmalı.
    pause & exit /b 1
)

echo.
echo  ┌─────────────────────────────────────────────────────┐
echo  │  ÖNEMLİ: watchdog_config.json dosyasını düzenleyin  │
echo  │                                                       │
echo  │  primary.host = Birincil bilgisayarın IP adresi      │
echo  │  docker.compose_file = Bu bilgisayardaki yol         │
echo  └─────────────────────────────────────────────────────┘
echo.
echo  Dosyayı Not Defteri ile açmak ister misiniz? [E/h]
set /p OPEN_CONFIG=  Seçim:
if /i "%OPEN_CONFIG%" neq "h" (
    notepad "%~dp0watchdog_config.json"
    echo.
    echo  Dosyayı kaydedip kapattıktan sonra Enter'a basın...
    pause >nul
)

:: ── Replikasyon kurulumu ──────────────────────────────────────────────────────
echo.
echo  CouchDB replikasyonu kuruluyor (Birincil → Bu bilgisayar)...
echo  Bu işlem birkaç dakika sürebilir...
echo.
python "%~dp0setup_replication.py"
if %errorlevel% neq 0 (
    echo.
    echo  [HATA] Replikasyon kurulumu başarısız!
    echo  watchdog_config.json'daki birincil sunucu IP ve şifresini kontrol edin.
    pause & exit /b 1
)

:: ── Windows Startup'a ekle (opsiyonel) ───────────────────────────────────────
echo.
echo  Watchdog'u Windows başlangıcında otomatik başlatmak ister misiniz?
echo  (Bilgisayar açıldığında arka planda otomatik çalışır)
echo.
echo  [E] Evet — Başlangıca ekle
echo  [h] Hayır — Manuel başlatacağım (WATCHDOG.bat ile)
echo.
set /p AUTO_START=  Seçim:
if /i "%AUTO_START%" equ "E" (
    set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
    echo @echo off > "%STARTUP_DIR%\MERT4_Watchdog.bat"
    echo cd /d "%~dp0" >> "%STARTUP_DIR%\MERT4_Watchdog.bat"
    echo start /min python watchdog.py >> "%STARTUP_DIR%\MERT4_Watchdog.bat"
    echo  [OK] Başlangıca eklendi: %STARTUP_DIR%\MERT4_Watchdog.bat
)

:: ── Tamamlandı ────────────────────────────────────────────────────────────────
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║         KURULUM TAMAMLANDI!                          ║
echo  ║                                                       ║
echo  ║  Veriler birincil sunucudan kopyalanıyor.             ║
echo  ║  Durum izlemek için: setup_replication.py --status   ║
echo  ║                                                       ║
echo  ║  Watchdog'u başlatmak için: WATCHDOG.bat             ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
pause
