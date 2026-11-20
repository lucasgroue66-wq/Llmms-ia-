@echo off
chcp 65001 >nul
title Pont llmms ia - Roblox Studio
cd /d "%~dp0"
echo.
echo  === Pont llmms ia ^<-^> Roblox Studio ===
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js n'est pas installe. Installation automatique...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 start "" https://nodejs.org
  echo.
  echo  Quand Node.js est installe, FERME cette fenetre et relance ce fichier.
  pause
  exit /b
)
curl -fsSL -o llmms-pont.mjs.new https://ia-llmms-1.vercel.app/pont-studio/llmms-pont.mjs && move /y llmms-pont.mjs.new llmms-pont.mjs >nul
if not exist llmms-pont.mjs (
  echo  Impossible de telecharger le pont. Verifie ta connexion internet.
  pause
  exit /b
)
if exist mcp.json (
  node llmms-pont.mjs mcp.json
) else (
  node llmms-pont.mjs
)
pause
