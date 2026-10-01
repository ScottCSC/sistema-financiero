# Control Cartola en Render + Neon

## Servicio de Render

Cree un **Web Service** con runtime **Python 3** desde el repositorio que contiene
el proyecto. Deje **Root Directory** vacío: los comandos se ejecutan desde la raíz,
donde están `backend/` y `frontend/`.

**Build Command**

```sh
bash build.sh
```

**Start Command**

```sh
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT
```

Render define `PORT`. El `Procfile` contiene el mismo arranque con puerto 10000 como
alternativa si esa variable no existe. FastAPI sirve la carpeta `frontend/dist`,
compilada y publicada en el repositorio. No se publica `node_modules`.

Si modifica React, regenere `frontend/dist` antes de subir los cambios:

```sh
npm ci --prefix frontend
npm run build --prefix frontend -- --configLoader native
```

Deje vacío **Health Check Path**, para usar la comprobación TCP predeterminada.
`/health` también exige autenticación; una comprobación HTTP sin credenciales
recibiría 401.

## Variables de entorno

Configure en la sección **Environment** de Render:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | Cadena de conexión copiada desde Neon, conservando `sslmode=require` y los demás parámetros que incluya. |
| `ADMIN_USER` | Usuario elegido para entrar al sistema, sin dos puntos (`:`), tildes ni ñ. |
| `ADMIN_PASSWORD` | Contraseña fuerte con letras, números y símbolos ASCII, sin tildes ni ñ. |
| `CUENTA_TITULAR` | Nombre del titular para crear una cuenta nueva. |
| `CUENTA_NUMERO` | Número de la cuenta para crear una cuenta nueva. |
| `CUENTA_SALDO_INICIAL` | Saldo base histórico, como entero sin puntos ni símbolo de moneda. Obligatorio al crear la cuenta. |

No guarde las credenciales en el repositorio ni en variables de Vite. Si falta el
usuario o la contraseña, el servidor detiene el arranque en lugar de abrir acceso
público.

HTTPBasic de FastAPI decodifica estas credenciales como ASCII. Si contienen otros
caracteres, la aplicación informa el error al arrancar. El host de Render se
autoriza automáticamente mediante `RENDER_EXTERNAL_HOSTNAME`. Para un dominio
propio, agregue la variable opcional `ALLOWED_HOSTS` con los nombres de host
permitidos separados por comas, sin protocolo ni ruta.

Para acceder, abra la URL **HTTPS** del servicio. El navegador mostrará su ventana
nativa de usuario y contraseña. La protección cubre la API, las páginas React,
JavaScript/CSS de `/assets`, `/docs`, `/redoc`, `/openapi.json` y `/health`.

`psycopg2-binary>=2.9.10` ya está agregado a `backend/requirements.txt`. Se instala
mediante el `requirements.txt` raíz y el Build Command. No es necesario colocar
credenciales de Neon en React.

## Base de datos y datos existentes

Con `DATABASE_URL`, la aplicación utiliza PostgreSQL y crea las tablas, la cuenta
base y el plan de cuentas si no existen. Sin esa variable, utiliza SQLite en la
ruta absoluta `backend/app/cartola.db`. La URL `postgres://` se normaliza al
driver PostgreSQL instalado, y `check_same_thread` solo se aplica a SQLite.

Los datos reales de la semilla están en `.cuenta-local.json`, excluido de Git.
Consulte ese archivo local para configurar `CUENTA_TITULAR`, `CUENTA_NUMERO` y
`CUENTA_SALDO_INICIAL` en Render. Esas variables solo se usan cuando no existe la
cuenta 1; no sobrescriben una cuenta ni su saldo ya guardados. Si falta el saldo
en una base vacía, el servidor avisa en lugar de iniciar con una base matemática
incorrecta.

**Cambiar la conexión no copia los movimientos de SQLite a Neon.** La transferencia
de los datos existentes es un paso separado; conserve el archivo local para
realizarla. Esta preparación no modifica ese archivo ni envía datos a Neon.

## Arranque local con autenticación

En PowerShell, configure sus credenciales en la sesión y arranque desde la raíz:

```powershell
$env:ADMIN_USER = "SU_USUARIO"
$env:ADMIN_PASSWORD = "SU_CONTRASENA_SEGURA"
backend/venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Abra `http://127.0.0.1:8000` para ingresar las credenciales y utilizar el frontend
compilado. Si usa Vite durante el desarrollo, autentíquese primero en esa misma
dirección del backend. Axios admite las credenciales reutilizadas por el navegador.

La variable opcional `CORS_ORIGINS` admite una lista de orígenes separados por
comas. Por defecto se permiten `http://localhost:5173` y `http://127.0.0.1:5173`
para Vite. El frontend servido por FastAPI funciona en el mismo origen. Las
preconsultas CORS `OPTIONS` no entregan datos y las atiende el middleware CORS;
las rutas de la aplicación siempre exigen credenciales.

## Referencias

- [Desplegar FastAPI en Render](https://render.com/docs/deploy-fastapi)
- [Herramientas incluidas en los runtimes de Render](https://render.com/docs/native-runtimes)
- [Comprobaciones de salud en Render](https://render.com/docs/health-checks)
- [Versiones de Node en Render](https://render.com/docs/node-version)
- [Variables de entorno predeterminadas en Render](https://render.com/docs/environment-variables)
- [Conectar SQLAlchemy a Neon](https://neon.com/docs/guides/sqlalchemy)
- [HTTP Basic en FastAPI](https://fastapi.tiangolo.com/advanced/security/http-basic-auth/)
