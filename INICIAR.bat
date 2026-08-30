@echo off
chcp 65001 >nul
title AdotaPet
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado.
  echo Instale o Node.js 22 ou mais recente e tente novamente.
  pause
  exit /b 1
)
echo Iniciando AdotaPet...
echo Abra http://127.0.0.1:3000 no navegador.
echo.
node server.js
pause
