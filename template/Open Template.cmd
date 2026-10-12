@echo off
setlocal
cd /d "%~dp0.."
start "OpenSlot Template Server" /min node scripts\serve-template.mjs
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4180/template/"
