@echo off
chcp 65001 >nul
title MERT.4 — Replikasyon Durum Raporu

echo.
cd /d "%~dp0"
python setup_replication.py --status
echo.
pause
