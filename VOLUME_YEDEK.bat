@echo off
title MERT.4 — CouchDB Volume Yedekleme
chcp 65001 >nul
cd /d "%~dp0"

:: ═══════════════════════════════════════════════════════════════════
::  VOLUME_YEDEK.bat — CouchDB Docker volume yedeği alır
::  Kullanım: VOLUME_YEDEK.bat            → Yedek al
::            VOLUME_YEDEK.bat --restore  → Yedek listesi + geri yükle
::            VOLUME_YEDEK.bat --list     → Yedekleri listele
:: ═══════════════════════════════════════════════════════════════════

set BACKUP_DIR=%~dp0couchdb_yedekler
set CONTAINER=mert-couchdb
set VOLUME=mert4_couchdb_data
set MODE=backup
set MAX_BACKUPS=7

if "%1"=="--restore" set MODE=restore
if "%1"=="--list"    set MODE=list

:: Yedek klasörü oluştur
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: Docker kontrol
docker info >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Docker çalışmıyor. Docker Desktop'u başlatın.
    pause
    exit /b 1
)

if "%MODE%"=="list" goto :do_list
if "%MODE%"=="restore" goto :do_restore

:do_backup
echo.
echo  ═══════════════════════════════════════════════
echo  MERT.4 — CouchDB Volume Yedekleme
echo  ═══════════════════════════════════════════════
echo.

:: Tarih/saat formatlı dosya adı
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set dt=%%a
set TIMESTAMP=%dt:~0,8%_%dt:~8,6%
set BACKUP_FILE=%BACKUP_DIR%\couchdb_yedek_%TIMESTAMP%.tar.gz

echo [INFO] Yedek alınıyor: couchdb_yedek_%TIMESTAMP%.tar.gz
echo [INFO] Bu işlem birkaç dakika sürebilir...
echo.

:: Alpine container ile volume'u tar'la
docker run --rm ^
  -v "%VOLUME%:/data:ro" ^
  -v "%BACKUP_DIR%:/backup" ^
  alpine:latest ^
  tar czf "/backup/couchdb_yedek_%TIMESTAMP%.tar.gz" -C /data .

if %errorlevel% neq 0 (
    echo [HATA] Yedek alınamadı! Docker veya volume hatası.
    pause
    exit /b 1
)

:: Meta dosyası
echo timestamp=%TIMESTAMP% > "%BACKUP_DIR%\couchdb_yedek_%TIMESTAMP%.meta"
echo date=%date% %time% >> "%BACKUP_DIR%\couchdb_yedek_%TIMESTAMP%.meta"
echo file=couchdb_yedek_%TIMESTAMP%.tar.gz >> "%BACKUP_DIR%\couchdb_yedek_%TIMESTAMP%.meta"
echo container=%CONTAINER% >> "%BACKUP_DIR%\couchdb_yedek_%TIMESTAMP%.meta"
echo volume=%VOLUME% >> "%BACKUP_DIR%\couchdb_yedek_%TIMESTAMP%.meta"

echo.
echo  [OK] Yedek başarıyla alındı!
echo  Dosya: %BACKUP_DIR%\couchdb_yedek_%TIMESTAMP%.tar.gz
echo.

:: Eski yedekleri temizle (MAX_BACKUPS kadar tut)
call :cleanup_old_backups

echo  ═══════════════════════════════════════════════
echo  Yedek Bilgisi:
echo    Konum: %BACKUP_DIR%
echo    Geri yüklemek için: VOLUME_YEDEK.bat --restore
echo  ═══════════════════════════════════════════════
echo.
pause
exit /b 0

:do_list
echo.
echo  ═══════════════════════════════════════════════
echo  Mevcut CouchDB Yedekleri:
echo  ═══════════════════════════════════════════════
echo.
set COUNT=0
for /f "delims=" %%f in ('dir /b /od "%BACKUP_DIR%\*.tar.gz" 2^>nul') do (
    set /a COUNT+=1
    echo  [!COUNT!] %%f
    if exist "%BACKUP_DIR%\%%~nf.meta" (
        for /f "tokens=1,2 delims==" %%a in (%BACKUP_DIR%\%%~nf.meta) do (
            if "%%a"=="date" echo       Tarih: %%b
        )
    )
    echo.
)
if %COUNT%==0 echo  Henüz yedek alınmamış. VOLUME_YEDEK.bat çalıştırın.
echo.
pause
exit /b 0

:do_restore
call :do_list

echo  Hangi yedeği geri yüklemek istiyorsunuz?
echo  UYARI: Mevcut CouchDB verileri SİLİNECEK!
echo.
set /p BACKUP_CHOICE=Yedek dosya adını tam girin (örn: couchdb_yedek_20240101_120000.tar.gz):

if not exist "%BACKUP_DIR%\%BACKUP_CHOICE%" (
    echo [HATA] Dosya bulunamadı: %BACKUP_CHOICE%
    pause
    exit /b 1
)

echo.
echo  UYARI: %BACKUP_CHOICE% geri yüklenecek. Devam etmek için "EVET" yazın:
set /p CONFIRM=
if /i not "%CONFIRM%"=="EVET" (
    echo İptal edildi.
    pause
    exit /b 0
)

echo [INFO] Container durduruluyor...
docker compose stop couchdb 2>nul
timeout /t 2 /nobreak >nul

echo [INFO] Volume temizleniyor...
docker run --rm -v "%VOLUME%:/data" alpine:latest sh -c "rm -rf /data/*"

echo [INFO] Yedek geri yükleniyor...
docker run --rm ^
  -v "%VOLUME%:/data" ^
  -v "%BACKUP_DIR%:/backup:ro" ^
  alpine:latest ^
  tar xzf "/backup/%BACKUP_CHOICE%" -C /data

echo [INFO] CouchDB yeniden başlatılıyor...
docker compose start couchdb 2>nul
timeout /t 3 /nobreak >nul

echo.
echo  [OK] Geri yükleme tamamlandı: %BACKUP_CHOICE%
echo.
pause
exit /b 0

:cleanup_old_backups
set BACKUP_COUNT=0
for %%f in ("%BACKUP_DIR%\*.tar.gz") do set /a BACKUP_COUNT+=1
if %BACKUP_COUNT% gtr %MAX_BACKUPS% (
    set /a DELETE_COUNT=BACKUP_COUNT - MAX_BACKUPS
    echo [INFO] Eski yedekler temizleniyor (!DELETE_COUNT! adet)...
    for /f "skip=%MAX_BACKUPS% delims=" %%f in ('dir /b /od "%BACKUP_DIR%\*.tar.gz" 2^>nul') do (
        del /q "%BACKUP_DIR%\%%f" 2>nul
        del /q "%BACKUP_DIR%\%%~nf.meta" 2>nul
    )
)
exit /b 0
