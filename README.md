# Control Cartola

Sistema financiero para PYMEs: Libro Banco, Flujo de Caja, plan de cuentas
configurable y ayuda integrada.

- Backend: Python, FastAPI, SQLAlchemy, SQLite local o PostgreSQL.
- Frontend: React y Vite; FastAPI sirve la versión compilada en `frontend/dist`.
- Acceso: autenticación HTTP Basic con credenciales definidas en el entorno.

## Despliegue en Render

Consulte [la guía de Render y Neon](DEPLOY_RENDER.md) para configurar las variables
de entorno y la cuenta inicial.

**Build Command**

```sh
bash build.sh
```

**Start Command**

```sh
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT
```

Deje **Root Directory** y **Health Check Path** vacíos. Los archivos de SQLite,
las planillas bancarias, las credenciales, la configuración privada de la cuenta
y las dependencias locales están excluidos de Git.

## Actualizar el frontend

```sh
npm ci --prefix frontend
npm run build --prefix frontend -- --configLoader native
```

Incluya los cambios de `frontend/src` y `frontend/dist` en el mismo commit.
