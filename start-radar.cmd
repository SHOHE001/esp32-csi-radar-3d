@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-radar.ps1" -Port COM3
if errorlevel 1 pause
