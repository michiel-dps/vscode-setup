@echo off
rem Double-click: copies this laptop's setup into this folder (see README.md).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\save.ps1"
pause
