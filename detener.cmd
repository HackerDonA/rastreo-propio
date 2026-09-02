@echo off
REM ---------------------------------------------------------------------------
REM  Doble clic aqui para apagar la aplicacion.
REM
REM  Traccar y PostgreSQL se quedan corriendo a proposito: tardan casi un minuto
REM  en volver a estar sanos y no hace falta apagarlos para reiniciar el codigo.
REM  Para apagarlos tambien, en PowerShell:  .\detener.ps1 -Todo
REM ---------------------------------------------------------------------------

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0detener.ps1" %*

echo.
pause
