@echo off
title MERT.4 Guncelleme Araci
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Python bulunamadi! Lutfen Python yukleyin: https://python.org
    pause
    exit /b 1
)

python updater.py
