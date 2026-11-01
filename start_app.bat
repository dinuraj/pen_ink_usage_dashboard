@echo off
title Nib ^& Ink — Fountain Pen Usage Analytics
echo Starting Nib ^& Ink Usage Tracker at http://127.0.0.1:8000 ...
"%~dp0backend\.venv\Scripts\python.exe" "%~dp0run.py"
pause
