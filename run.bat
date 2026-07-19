@echo off
REM ─────────────────────────────────────────────────────────────────────────
REM  ET // Cyber Command — Launch Script
REM  Starts FastAPI backend + Streamlit dashboard together.
REM  Run from the CyberRes project root.
REM ─────────────────────────────────────────────────────────────────────────

echo.
echo  [ET // Cyber Command] Starting pipeline...
echo  ─────────────────────────────────────────
echo.

REM 1. Start FastAPI backend in background
echo  [1/2] Starting FastAPI backend on http://localhost:8000 ...
start "FastAPI Backend" cmd /k "cd /d %~dp0 && python -m uvicorn src.fastapi_app:app --host 0.0.0.0 --port 8000 --reload"

REM Wait for backend to initialize (pipeline trains in ~60s, but server starts fast)
echo  Waiting 5s for server to bind...
timeout /t 5 /nobreak > nul

REM 2. Start Streamlit dashboard
echo  [2/2] Starting Streamlit dashboard on http://localhost:8501 ...
echo.
echo  ─────────────────────────────────────────
echo  FastAPI:   http://localhost:8000
echo  Streamlit: http://localhost:8501
echo  React Dev: run separately with: cd frontend-app ^& npm run dev
echo  ─────────────────────────────────────────
echo.
start "Streamlit Dashboard" cmd /k "cd /d %~dp0 && streamlit run streamlit_app.py --server.port 8501 --browser.gatherUsageStats false"

echo  Both services started. Check the opened terminal windows for logs.
echo  Pipeline initialization takes ~60s on first run.
pause
