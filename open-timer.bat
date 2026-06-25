@echo off
setlocal
cd /d "%~dp0"

echo 최신 버전으로 빌드 중...
call npm run build:file
if errorlevel 1 (
  echo 빌드 실패. npm install 후 다시 시도하세요.
  pause
  exit /b 1
)

echo.
echo 기존 로컬 서버 종료 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4173 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)

echo 로컬 서버 시작 중...
start "FOURCARD Timer Server" /MIN cmd /c "cd /d "%~dp0" && npm run serve:file"

echo 서버 준비 대기...
set /a tries=0
:wait_server
set /a tries+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -ge 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 goto server_ready
if %tries% geq 15 (
  echo 서버 시작에 실패했습니다. npm install 후 다시 시도하세요.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_server

:server_ready
start "" "http://127.0.0.1:4173/?t=%RANDOM%"
echo.
echo 브라우저 주소: http://127.0.0.1:4173/
echo 구글 시트 연동은 이 주소에서만 동작합니다.
echo.
echo 종료하려면 작업 표시줄의 "FOURCARD Timer Server" 창을 닫으세요.
echo.
pause
