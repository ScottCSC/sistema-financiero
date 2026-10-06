# Control Cartola

Sistema financiero para PYMEs: Libro Banco, Flujo de Caja, plan de cuentas
configurable y ayuda integrada.

- Backend: Python, FastAPI, SQLAlchemy, SQLite local o PostgreSQL.
- Frontend: React, Vite y Recharts; FastAPI sirve la versión compilada en `frontend/dist`.
- Acceso: autenticación HTTP Basic con credenciales definidas en el entorno.

## Dashboard (Fase 1 del ERP)

El Dashboard es la pantalla principal (`/`). Libro Banco ahora está en
`/libro-banco`, seguido de Flujo de Caja, Ajustes y Ayuda en la navegación.

Los indicadores de ingresos, egresos y flujo neto corresponden al mes actual
en `America/Santiago`. El anillo distribuye sus egresos por categoría; el
gráfico de barras compara los últimos seis meses calendario, incluido el
actual y los meses sin actividad. La leyenda y el detalle tabular permiten
consultar montos y porcentajes sin depender del color o del mouse.

La dependencia de gráficos se instala desde la raíz con:

```sh
npm install recharts --prefix frontend
```

## Reporte PDF (Fase 2 del ERP)

En Flujo de Caja, seleccione la agrupación semanal, mensual o anual y pulse
`Generar Reporte PDF`. El reporte descarga la matriz actual en A4 apaisado,
incluyendo las subcategorías que tenga desplegadas. El encabezado usa el
titular de la cuenta como nombre de empresa, el título `Reporte Financiero`
y la fecha de emisión. Los controles y mensajes emergentes se excluyen.

Las tablas extensas se distribuyen en varias páginas, repitiendo la columna
de categorías y las cabeceras de períodos. El documento conserva los bloques,
subtotales, flujo neto, saldo acumulado y distinción visual de la proyección.
La descarga se genera localmente en el navegador.

Dependencias de esta fase, desde la raíz:

```sh
npm install jspdf jspdf-autotable --prefix frontend
```

Las librerías de PDF se cargan al solicitar el reporte. Después de instalar,
recompile el frontend siguiendo las instrucciones al final de este documento.

## Importación y memoria de clasificación

La importación reconoce `Nº Documento`, `N de documento`, `Documento` y
`Nro. Doc.` como `centro_costo`; también admite `Centro de Costo` de las
exportaciones anteriores. La exportación usa la cabecera `Nº Documento`.

Antes de importar se carga la memoria de clasificaciones de la cuenta. El
servidor compara descripciones en minúsculas, sin tildes ni espacios sobrantes.
Primero busca una coincidencia exacta; si no existe, busca una descripción que
contenga a la otra. Si hay varias coincidencias parciales, prioriza la clave
histórica más específica (la más larga), y en empate el movimiento más reciente
por fecha e ID. Las descripciones sin
coincidencia quedan como `Sin clasificar` / `Sin subcategoría`. Si la planilla
trae una categoría explícita, conserva esa clasificación. Los duplicados se
siguen omitiendo y no se modifican movimientos que ya estén guardados.

El diccionario también está disponible en el endpoint protegido
`GET /api/diccionario-clasificacion?cuenta_id=1`.

## Eliminar varios movimientos

En el Libro Banco, marque las filas que desea eliminar. El checkbox de cabecera
selecciona o deselecciona todos los movimientos visibles, respetando el período
y los filtros. El botón `Eliminar Seleccionados (X)` muestra cuántos se borrarán
y exige confirmación. La selección se limpia al cambiar de período o filtros,
para evitar borrar filas ocultas. Después de eliminar se recarga la cartola para
recalcular los saldos.

El endpoint protegido `DELETE /api/movimientos/masivo` recibe una lista JSON de
IDs enteros positivos y devuelve `{ "eliminados": cantidad }`.

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
