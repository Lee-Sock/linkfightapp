@echo off
cd /d "%~dp0"
echo Stopping any existing processes on port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo Starting uvicorn...
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
