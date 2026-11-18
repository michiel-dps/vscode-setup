@echo off
rem Double-click on a new computer: puts this setup in place (see README.md).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
pause
