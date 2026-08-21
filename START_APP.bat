@echo off
title Sales Register Pro
echo ===================================================
echo           STARTING SALES REGISTER PRO
echo ===================================================
echo.
cd /d "%~dp0"
echo Opening browser at http://localhost:3000 ...
start http://localhost:3000
echo.
echo Starting Node server...
node server.js
pause
