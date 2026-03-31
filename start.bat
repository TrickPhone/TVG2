@echo off
title TVG2 - 番組表ビューア
cd /d "%~dp0"

echo.
echo   ===========================
echo     TVG2 番組表ビューア
echo   ===========================
echo.

REM Check Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js がインストールされていません。
    echo https://nodejs.org からインストールしてください。
    pause
    exit /b 1
)

REM Install deps if needed
if not exist "node_modules" (
    echo [SETUP] 依存パッケージをインストール中...
    npm install
    echo.
)

echo [START] サーバーを起動中...
echo.
echo   URL: http://localhost:3002
echo   停止: Ctrl+C
echo.

start "" http://localhost:3002
npm run dev
