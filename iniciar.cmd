@echo off
REM ---------------------------------------------------------------------------
REM  Doble clic aqui para levantar todo el entorno.
REM
REM  Existe porque Windows NO ejecuta un .ps1 al hacer doble clic: lo abre en el
REM  Bloc de notas. Un .cmd si se ejecuta, y desde aqui se llama al script de
REM  PowerShell que hace el trabajo de verdad.
REM
REM  -ExecutionPolicy Bypass solo afecta a ESTA ejecucion. No cambia la
REM  configuracion de la maquina, asi que sirve igual aunque algun dia la
REM  politica de scripts se vuelva mas estricta.
REM
REM  %~dp0 es la carpeta de este archivo. Con eso funciona aunque lo lances
REM  desde un acceso directo en el escritorio, donde el directorio actual es
REM  otro.
REM ---------------------------------------------------------------------------

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*

echo.
echo   Puedes cerrar esta ventana. La aplicacion sigue corriendo en las suyas.
echo.
pause
