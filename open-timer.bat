@echo off
cd /d "%~dp0"
echo 최신 버전으로 빌드 중...
call npm run build:file
if errorlevel 1 exit /b 1
echo.
echo 구글 시트 연동을 위해 로컬 서버를 시작합니다.
echo 브라우저 주소: http://127.0.0.1:4173/
echo (file:// 로 HTML을 직접 열면 구글 시트 통신이 차단됩니다)
echo.
echo 종료하려면 이 창을 닫으세요.
echo.
start "" "http://127.0.0.1:4173/?build=%RANDOM%"
call npm run serve:file
