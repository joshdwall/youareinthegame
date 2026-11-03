@echo off
cd /d "%~dp0"
echo Put transparent stock images in inbox\costume-name\ first.
node workshop.mjs ingest
echo Edit the created costumes JSON files if placement or background settings need adjustment.
pause
