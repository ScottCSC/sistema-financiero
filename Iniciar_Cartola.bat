@echo off
title Sistema Financiero - Libro Banco
echo Iniciando el sistema, por favor espere...

cd backend

:: Activar entorno virtual automáticamente si existe (nombres estándar)
if exist "venv\Scripts\activate.bat" call venv\Scripts\activate.bat
if exist ".venv\Scripts\activate.bat" call .venv\Scripts\activate.bat
if exist "env\Scripts\activate.bat" call env\Scripts\activate.bat
@echo off
cd C:\Users\Home\Desktop\Visual\control-cartola\backend

:: Configuramos credenciales temporales para el entorno local
set ADMIN_USER=admin
set ADMIN_PASSWORD=admin

:: Activamos el entorno virtual (si lo tienes en el bat)
call venv\Scripts\activate

:: Iniciamos el servidor
uvicorn app.main:app --reload
:: Iniciar el servidor usando el módulo de Python
start "Servidor Cartola" cmd /k "python -m uvicorn app.main:app --port 8000"

:: Esperar a que el backend levante la base de datos
timeout /t 2 /nobreak > NUL

:: Abrir la aplicación unificada en el navegador
start http://localhost:8000