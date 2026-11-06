@echo off
rem Double-click on a new laptop: puts this setup in place (see README.md).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
pause
