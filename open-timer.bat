@echo off
cd /d "%~dp0"
echo 최신 버전으로 빌드 중...
call npm run build:file
if errorlevel 1 exit /b 1
echo 빌드 완료. 기존 타이머 창을 닫고 새 창을 사용해주세요.
start "" "%~dp0release\index.html?build=%RANDOM%"
