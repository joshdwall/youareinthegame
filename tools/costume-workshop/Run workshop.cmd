@echo off
cd /d "%~dp0"
echo Mushroom Platypus costume workshop - local only
node workshop.mjs doctor
node workshop.mjs prompts
if errorlevel 1 goto end
node workshop.mjs run
if errorlevel 1 goto end
node workshop.mjs export
:end
pause
