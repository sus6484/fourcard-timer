@echo off
setlocal
cd /d "%~dp0"

echo [1/3] 최신 버전 빌드 중...
call npm run build:file
if errorlevel 1 (
  echo.
  echo 빌드 실패. npm install 후 다시 시도하세요.
  pause
  exit /b 1
)

echo.
echo [2/3] 기존 서버 종료 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4173 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)

echo [3/3] 로컬 서버 시작 중...
start "FOURCARD Timer Server" /MIN cmd /c "cd /d "%~dp0" && npm run serve:file"

set /a tries=0
:wait_server
set /a tries+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -ge 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 goto server_ready
if %tries% geq 20 (
  echo.
  echo 서버 시작에 실패했습니다.
  echo npm install 후 다시 시도하거나 아래 링크를 사용하세요:
  echo https://sus6484.github.io/fourcard-timer/
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_server

:server_ready
start "" "http://127.0.0.1:4173/?t=%RANDOM%"
echo.
echo 실행 완료: http://127.0.0.1:4173/
echo 구글 시트 연동이 활성화됩니다.
echo.
echo 종료: 작업 표시줄의 "FOURCARD Timer Server" 창 닫기
echo.
pause
