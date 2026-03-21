@echo off
title MERT.4 Guncelleme Araci
cd /d "%~dp0"

:: Python kontrolü
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Python bulunamadi!
    echo Python yuklemek icin: https://python.org/downloads
    echo Python kurulumunda "Add Python to PATH" secenegini isaretleyin.
    pause
    exit /b 1
)

:: tkinter kontrolü (Python ile birlikte gelir, ama bazı minimal kurulumlarda olmayabilir)
python -c "import tkinter" >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Python'da tkinter modulu bulunamadi!
    echo Cozum: Python'u resmi siteden (python.org) yeniden yukleyin.
    echo "Customize installation" secip "tcl/tk and IDLE" secenegini isaretleyin.
    pause
    exit /b 1
)

:: Aracı başlat
python updater.py
if %errorlevel% neq 0 (
    echo.
    echo [HATA] Uygulama beklenmedik sekilde kapandi. (Kod: %errorlevel%)
    pause
)
