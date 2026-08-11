@echo off
rem ============================================================
rem Idea Factory - start the collector on this machine.
rem Data goes to OneDrive so submissions are backed up.
rem Team URL:  http://10.68.157.87:8080/   (board at /board)
rem ============================================================
set "DATA_DIR=C:\Users\Taylor\OneDrive - Dragoneer Investment Group\Idea Factory"
set /p SESSION_SECRET=<"%DATA_DIR%\.session-secret"
set PORT=8080
cd /d "%~dp0"
echo Idea Factory starting...
echo   form   http://10.68.157.87:8080/
echo   board  http://10.68.157.87:8080/board
echo   data   %DATA_DIR%\submissions
node server.js
