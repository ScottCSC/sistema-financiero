import io
import os
import re
import secrets
import unicodedata
from pathlib import Path

import pandas as pd
from fastapi import Body, Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from sqlalchemy import inspect as sqlalchemy_inspect, text
from sqlalchemy.orm import Session

from . import crud, schemas
from .database import Base, engine, get_db, SessionLocal
from .models import Configuracion, Cuenta, Movimiento  # noqa: F401 — registra modelos en metadata

ADMIN_USER = os.getenv("ADMIN_USER", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
if not ADMIN_USER.strip() or not ADMIN_PASSWORD.strip():
    raise RuntimeError("Configure ADMIN_USER y ADMIN_PASSWORD antes de iniciar Control Cartola.")
if ":" in ADMIN_USER:
    raise RuntimeError("ADMIN_USER no puede contener dos puntos (:).")
if not ADMIN_USER.isascii() or not ADMIN_PASSWORD.isascii():
    raise RuntimeError("HTTPBasic requiere ADMIN_USER y ADMIN_PASSWORD con caracteres ASCII (sin tildes ni ñ).")

CORS_ORIGINS = [
    origen.strip().rstrip("/")
    for origen in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origen.strip()
]
if "*" in CORS_ORIGINS:
    raise RuntimeError("CORS_ORIGINS debe contener orígenes específicos, nunca '*'.")

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]").split(",")
    if host.strip()
]
render_hostname = os.getenv("RENDER_EXTERNAL_HOSTNAME", "").strip()
if render_hostname and render_hostname not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(render_hostname)
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    raise RuntimeError("ALLOWED_HOSTS debe contener nombres de host específicos, nunca '*'.")

security = HTTPBasic(realm="Control Cartola")
AUTH_HEADERS = {"WWW-Authenticate": 'Basic realm="Control Cartola"'}


def autenticar(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    usuario_valido = secrets.compare_digest(
        credentials.username.encode("utf-8"), ADMIN_USER.encode("utf-8")
    )
    clave_valida = secrets.compare_digest(
        credentials.password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")
    )
    if not (usuario_valido and clave_valida):
        raise HTTPException(
            status_code=401,
            detail="Usuario o contraseña incorrectos.",
            headers=AUTH_HEADERS,
        )
    return credentials.username


app = FastAPI(title="Control Cartola API", dependencies=[Depends(autenticar)])


@app.middleware("http")
async def proteger_aplicacion(request: Request, call_next):
    # Las dependencias globales no cubren StaticFiles ni la documentación.
    # Este control adicional protege también React, /assets y cualquier ruta nueva.
    try:
        autenticar(await security(request))
    except HTTPException:
        return JSONResponse(
            status_code=401,
            content={"detail": "Ingrese un usuario y contraseña válidos."},
            headers={**AUTH_HEADERS, "Cache-Control": "private, no-store"},
        )

    # El navegador reutiliza HTTP Basic automáticamente: impedir escrituras
    # desde páginas ajenas evita que esa autenticación se use mediante CSRF.
    origen = request.headers.get("origin")
    host = request.headers.get("host", "")
    origenes_propios = {f"https://{host}", f"http://{host}"}
    if (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and origen is not None
        and origen not in origenes_propios
        and origen not in CORS_ORIGINS
    ):
        return JSONResponse(
            status_code=403,
            content={"detail": "El origen de la solicitud no está autorizado."},
            headers={"Cache-Control": "private, no-store"},
        )

    response = await call_next(request)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def _normalizar_encabezado(valor: object) -> str:
    texto = unicodedata.normalize("NFKD", str(valor).strip().lower())
    texto = "".join(caracter for caracter in texto if not unicodedata.combining(caracter))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", texto)).strip()


def _buscar_columna(encabezados: list[object], palabras: tuple[str, ...]):
    for posicion, columna in enumerate(encabezados):
        encabezado = _normalizar_encabezado(columna)
        if any(palabra in encabezado for palabra in palabras):
            return posicion
    return None


def _esta_vacio(valor: object) -> bool:
    if pd.isna(valor):
        return True
    return isinstance(valor, str) and not valor.strip()


def _texto_celda(valor: object) -> str:
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor).strip()


def _parsear_monto(valor: object) -> float | None:
    if _esta_vacio(valor):
        return None
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return float(valor)

    texto = re.sub(r"[^0-9,.-]", "", str(valor)).strip()
    if not texto or texto in {"-", ".", ","}:
        return None
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    else:
        texto = texto.replace(".", "")
    try:
        return float(texto)
    except ValueError:
        return None


def _es_fila_encabezado(valores: tuple[object, ...] | list[object]) -> bool:
    encabezados = [_normalizar_encabezado(valor) for valor in valores]
    posiciones_fecha = [
        posicion
        for posicion, encabezado in enumerate(encabezados)
        if re.search(r"\bfecha\b", encabezado)
    ]
    otras_palabras = (
        "sucursal",
        "descripcion",
        "detalle",
        "centro costo",
        "categoria",
        "subcategoria",
        "cargo",
        "abono",
        "deposito",
    )
    return any(
        any(
            posicion != posicion_fecha and any(palabra in encabezado for palabra in otras_palabras)
            for posicion, encabezado in enumerate(encabezados)
        )
        for posicion_fecha in posiciones_fecha
    )


def _leer_archivo_movimientos(file: UploadFile) -> tuple[pd.DataFrame, list[object]]:
    extension = Path(file.filename or "").suffix.lower()
    file.file.seek(0)
    try:
        if extension == ".csv":
            try:
                dataframe = pd.read_csv(
                    file.file, sep=None, engine="python", header=None, dtype=object
                )
            except UnicodeDecodeError:
                file.file.seek(0)
                dataframe = pd.read_csv(
                    file.file,
                    sep=None,
                    engine="python",
                    header=None,
                    dtype=object,
                    encoding="cp1252",
                )
        elif extension in {".xlsx", ".xls"}:
            dataframe = pd.read_excel(file.file, header=None, dtype=object)
        else:
            raise HTTPException(
                status_code=400,
                detail="Formato no admitido. Use un archivo .xlsx, .xls o .csv.",
            )
    except ImportError as error:
        raise HTTPException(
            status_code=400,
            detail="Falta instalar el lector de Excel requerido para este formato.",
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail="No se pudo leer el archivo. Compruebe que sea un Excel o CSV válido.",
        ) from error

    indice_encabezado = next(
        (
            indice
            for indice, fila in enumerate(dataframe.itertuples(index=False, name=None))
            if _es_fila_encabezado(fila)
        ),
        None,
    )
    if indice_encabezado is None:
        raise HTTPException(
            status_code=422,
            detail="No se encontró la fila de encabezados que contiene FECHA y otras columnas de la cartola.",
        )

    encabezados = dataframe.iloc[indice_encabezado].tolist()
    filas = dataframe.iloc[indice_encabezado + 1 :].reset_index(drop=True)
    return filas, encabezados

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=ALLOWED_HOSTS,
    www_redirect=False,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

Base.metadata.create_all(bind=engine)

with engine.begin() as connection:
    columnas_movimiento = {
        columna["name"]
        for columna in sqlalchemy_inspect(connection).get_columns("movimientos")
    }
    if "centro_costo" not in columnas_movimiento:
        connection.execute(
            text("ALTER TABLE movimientos ADD COLUMN centro_costo VARCHAR NOT NULL DEFAULT ''")
        )
    if "categoria" not in columnas_movimiento:
        connection.execute(
            text(
                "ALTER TABLE movimientos ADD COLUMN categoria "
                "VARCHAR NOT NULL DEFAULT 'Sin clasificar'"
            )
        )
    if "subcategoria" not in columnas_movimiento:
        connection.execute(
            text(
                "ALTER TABLE movimientos ADD COLUMN subcategoria "
                "VARCHAR NOT NULL DEFAULT 'Sin subcategoría'"
            )
        )
    connection.execute(
        text(
            "UPDATE movimientos SET categoria = 'Sin clasificar' "
            "WHERE categoria IS NULL OR TRIM(categoria) = ''"
        )
    )
    connection.execute(
        text(
            "UPDATE movimientos SET subcategoria = 'Sin subcategoría' "
            "WHERE subcategoria IS NULL OR TRIM(subcategoria) = ''"
        )
    )
    connection.execute(
        text("UPDATE movimientos SET centro_costo = '' WHERE centro_costo IS NULL")
    )
    if "numero_documento" in columnas_movimiento:
        connection.execute(
            text("ALTER TABLE movimientos DROP COLUMN numero_documento")
        )

with SessionLocal() as db:
    crud.ensure_cuenta_principal(db)
    crud.ensure_plan_de_cuentas(db)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/configuracion/{clave}")
def leer_configuracion(clave: str, db: Session = Depends(get_db)):
    configuracion = crud.get_configuracion(db, clave)
    if configuracion is None:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    return configuracion.valor


@app.put("/configuracion/{clave}")
def guardar_configuracion(
    clave: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    if not clave.strip() or len(clave) > 100:
        raise HTTPException(status_code=422, detail="La clave debe tener entre 1 y 100 caracteres.")
    if clave == "PLAN_DE_CUENTAS":
        try:
            payload = schemas.PlanDeCuentas.model_validate(payload).root
        except ValidationError as error_validacion:
            detalle = error_validacion.errors(include_url=False, include_context=False)[0]["msg"].removeprefix("Value error, ")
            raise HTTPException(status_code=422, detail=detalle) from error_validacion
    return crud.actualizar_configuracion(db, clave, payload).valor


@app.post("/cuentas", response_model=schemas.CuentaRead, status_code=201)
def crear_cuenta(cuenta: schemas.CuentaCreate, db: Session = Depends(get_db)):
    db_cuenta = crud.create_cuenta(db, cuenta)
    if db_cuenta is None:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una cuenta con ese número de cuenta",
        )
    return db_cuenta


@app.put("/cuentas/{cuenta_id}/saldo_inicial", response_model=schemas.CuentaRead)
def actualizar_saldo_inicial(
    cuenta_id: int,
    payload: schemas.CuentaSaldoUpdate,
    db: Session = Depends(get_db),
):
    cuenta = crud.actualizar_saldo_inicial(db, cuenta_id, payload.nuevo_saldo)
    if cuenta is None:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return cuenta


@app.post("/movimientos", response_model=schemas.MovimientoRead, status_code=201)
def registrar_movimiento(
    movimiento: schemas.MovimientoCreate, db: Session = Depends(get_db)
):
    db_mov = crud.create_movimiento(db, movimiento)
    if db_mov is None:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return db_mov


@app.get("/movimientos", response_model=list[schemas.MovimientoRead])
def listar_movimientos(cuenta_id: int = 1, db: Session = Depends(get_db)):
    if crud.get_cuenta(db, cuenta_id) is None:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return crud.list_movimientos_ordenados(db, cuenta_id)


@app.post("/movimientos/importar")
def importar_movimientos(
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Seleccione un archivo para importar.")

    extension = Path(file.filename).suffix.lower()
    if extension not in {".xlsx", ".xls", ".csv"}:
        raise HTTPException(
            status_code=400,
            detail="Formato no admitido. Use un archivo .xlsx, .xls o .csv.",
        )

    dataframe, encabezados = _leer_archivo_movimientos(file)
    campos = {
        "fecha": _buscar_columna(encabezados, ("fecha",)),
        "sucursal": _buscar_columna(encabezados, ("sucursal",)),
        "descripcion": _buscar_columna(encabezados, ("descripcion", "detalle")),
        "centro_costo": _buscar_columna(
            encabezados, ("centro de costo", "centro costo", "centro de coste", "centro coste")
        ),
        "categoria": next(
            (
                posicion
                for posicion, columna in enumerate(encabezados)
                if _normalizar_encabezado(columna) == "categoria"
            ),
            None,
        ),
        "subcategoria": next(
            (
                posicion
                for posicion, columna in enumerate(encabezados)
                if _normalizar_encabezado(columna) == "subcategoria"
            ),
            None,
        ),
        "cargo": _buscar_columna(encabezados, ("cheques y otros cargos", "cargos", "cargo")),
        "abono": _buscar_columna(encabezados, ("depositos y abonos", "abonos", "abono", "deposito")),
    }
    faltantes = [
        nombre
        for campo, nombre in (
            ("fecha", "Fecha"),
            ("sucursal", "Sucursal"),
            ("descripcion", "Descripción"),
        )
        if campos[campo] is None
    ]
    if faltantes:
        raise HTTPException(
            status_code=422,
            detail=f"Faltan columnas requeridas: {', '.join(faltantes)}.",
        )
    if campos["cargo"] is None and campos["abono"] is None:
        raise HTTPException(
            status_code=422,
            detail="Se requiere al menos una columna Cargo o Abono.",
        )

    columnas_usadas = sorted({posicion for posicion in campos.values() if posicion is not None})
    dataframe = dataframe.iloc[:, columnas_usadas].copy()
    filas_vacias = dataframe.apply(
        lambda fila: all(_esta_vacio(valor) for valor in fila.tolist()), axis=1
    ).tolist()
    posiciones = {
        campo: columnas_usadas.index(posicion) if posicion is not None else None
        for campo, posicion in campos.items()
    }

    for campo in ("sucursal", "descripcion", "centro_costo", "categoria", "subcategoria"):
        posicion = posiciones[campo]
        if posicion is not None:
            dataframe.iloc[:, posicion] = dataframe.iloc[:, posicion].fillna("")
    for campo in ("cargo", "abono"):
        posicion = posiciones[campo]
        if posicion is not None:
            dataframe.iloc[:, posicion] = dataframe.iloc[:, posicion].fillna(0)

    movimientos = []
    omitidos_antes_de_insertar = 0
    filas_procesadas = len(dataframe)
    for indice, (_, fila) in enumerate(dataframe.iterrows()):
        if filas_vacias[indice]:
            omitidos_antes_de_insertar += 1
            continue

        valor_cargo = (
            _parsear_monto(fila.iloc[posiciones["cargo"]])
            if posiciones["cargo"] is not None
            else None
        )
        valor_abono = (
            _parsear_monto(fila.iloc[posiciones["abono"]])
            if posiciones["abono"] is not None
            else None
        )
        cargo_valido = valor_cargo is not None and valor_cargo > 0
        abono_valido = valor_abono is not None and valor_abono > 0
        hay_dos_montos = (
            valor_cargo not in (None, 0) and valor_abono not in (None, 0)
        )
        if hay_dos_montos or (not cargo_valido and not abono_valido):
            omitidos_antes_de_insertar += 1
            continue

        fecha_original = fila.iloc[posiciones["fecha"]]
        if isinstance(fecha_original, (int, float)) and not isinstance(fecha_original, bool):
            fecha_parseada = pd.to_datetime(
                fecha_original, unit="D", origin="1899-12-30", errors="coerce"
            )
        else:
            fecha_parseada = pd.to_datetime(
                fecha_original, errors="coerce", dayfirst=True
            )
        if pd.isna(fecha_parseada):
            omitidos_antes_de_insertar += 1
            continue

        sucursal = _texto_celda(fila.iloc[posiciones["sucursal"]])
        descripcion = _texto_celda(fila.iloc[posiciones["descripcion"]])
        centro_costo = (
            _texto_celda(fila.iloc[posiciones["centro_costo"]])
            if posiciones["centro_costo"] is not None
            else ""
        )
        categoria = (
            _texto_celda(fila.iloc[posiciones["categoria"]])
            if posiciones["categoria"] is not None
            else "Sin clasificar"
        ) or "Sin clasificar"
        subcategoria = (
            _texto_celda(fila.iloc[posiciones["subcategoria"]])
            if posiciones["subcategoria"] is not None
            else "Sin subcategoría"
        ) or "Sin subcategoría"
        if (
            not sucursal
            or not descripcion
            or len(sucursal) > 100
            or len(descripcion) > 500
            or len(centro_costo) > 120
            or len(categoria) > 100
            or len(subcategoria) > 100
        ):
            omitidos_antes_de_insertar += 1
            continue

        movimientos.append(
            {
                "fecha": fecha_parseada.date(),
                "sucursal": sucursal,
                "descripcion": descripcion,
                "centro_costo": centro_costo,
                "categoria": categoria,
                "subcategoria": subcategoria,
                "tipo": "CARGO" if cargo_valido else "ABONO",
                "monto": valor_cargo if cargo_valido else valor_abono,
            }
        )

    resultado_lote = crud.create_movimientos_en_lote(db, 1, movimientos)
    if resultado_lote is None:
        raise HTTPException(status_code=404, detail="Cuenta 1 no encontrada")
    insertadas, duplicadas = resultado_lote
    filas_omitidas = omitidos_antes_de_insertar + duplicadas
    return {
        "mensaje": "Importación finalizada",
        "filas_procesadas": filas_procesadas,
        "filas_insertadas": insertadas,
        "filas_omitidas": filas_omitidas,
        "filas_duplicadas": duplicadas,
    }


@app.delete("/movimientos/{movimiento_id}", status_code=200)
def eliminar_movimiento(movimiento_id: int, db: Session = Depends(get_db)):
    eliminado = crud.delete_movimiento(db, movimiento_id)
    if not eliminado:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return {"detail": "Movimiento eliminado correctamente"}


@app.put("/movimientos/{movimiento_id}", response_model=schemas.MovimientoRead)
def actualizar_movimiento(
    movimiento_id: int,
    movimiento_actualizado: schemas.MovimientoUpdate,
    db: Session = Depends(get_db),
):
    movimiento = crud.actualizar_movimiento(
        db, movimiento_id, movimiento_actualizado
    )
    if movimiento is None:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return movimiento


@app.get("/cuentas/{cuenta_id}/cartola", response_model=schemas.CartolaRead)
def ver_cartola(cuenta_id: int, db: Session = Depends(get_db)):
    cartola = crud.build_cartola(db, cuenta_id)
    if cartola is None:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return cartola


@app.get("/movimientos/exportar")
def exportar_movimientos(db: Session = Depends(get_db)):
    cartola = crud.build_cartola(db, 1)
    if cartola is None:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    columnas = [
        "Fecha",
        "Sucursal",
        "Descripción",
        "Centro de Costo",
        "Categoría",
        "Subcategoría",
        "Cargos",
        "Abonos",
        "Saldo Diario",
    ]
    filas = [
        {
            "Fecha": linea.fecha,
            "Sucursal": linea.sucursal,
            "Descripción": linea.descripcion,
            "Centro de Costo": linea.centro_costo,
            "Categoría": linea.categoria,
            "Subcategoría": linea.subcategoria,
            "Cargos": linea.monto if linea.tipo == schemas.TipoMovimiento.CARGO else None,
            "Abonos": linea.monto if linea.tipo == schemas.TipoMovimiento.ABONO else None,
            "Saldo Diario": linea.saldo_resultante,
        }
        for linea in cartola.lineas
    ]
    dataframe = pd.DataFrame(filas, columns=columnas)
    buffer = io.BytesIO()
    dataframe.to_excel(buffer, index=False)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="cartola_bci.xlsx"'},
    )


# Servir la SPA compilada cuando existe el build de Vite.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = (PROJECT_ROOT / "frontend" / "dist").resolve()
FRONTEND_ASSETS = FRONTEND_DIST / "assets"

if FRONTEND_DIST.is_dir():
    if FRONTEND_ASSETS.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=str(FRONTEND_ASSETS)),
            name="frontend-assets",
        )

    @app.get("/{catchall:path}", include_in_schema=False)
    def serve_spa(catchall: str):
        index_path = FRONTEND_DIST / "index.html"
        if not index_path.is_file():
            return {"error": "Frontend no encontrado. Ejecute npm run build."}

        # También sirve archivos publicados en la raíz de dist, como favicon.svg.
        if catchall:
            archivo = (FRONTEND_DIST / catchall).resolve()
            try:
                archivo.relative_to(FRONTEND_DIST)
            except ValueError:
                archivo = None
            if archivo is not None and archivo.is_file():
                return FileResponse(archivo)

        return FileResponse(index_path)
