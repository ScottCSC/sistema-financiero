import json
import os
from pathlib import Path

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import case, func, text

from . import models, schemas
from .models import TipoMovimiento


PLAN_DE_CUENTAS_POR_DEFECTO = {
    "Ingresos": {
        "Ingresos Operacionales": ["Ventas", "Servicios", "Arriendos", "Otros Ingresos"],
    },
    "Egresos": {
        "Egresos Operacionales": ["Sueldos", "Luz y Agua", "Arriendos", "Proveedores", "Marketing"],
        "No Operacional": ["Pago Impuestos", "Cuotas Crédito", "Gastos Bancarios"],
    },
    "Sin clasificar": {"Sin clasificar": ["Sin subcategoría"]},
}


def get_configuracion(db: Session, clave: str) -> models.Configuracion | None:
    return db.get(models.Configuracion, clave)


def actualizar_configuracion(db: Session, clave: str, valor: dict) -> models.Configuracion:
    configuracion = get_configuracion(db, clave)
    if configuracion is None:
        configuracion = models.Configuracion(clave=clave, valor=valor)
        db.add(configuracion)
    else:
        configuracion.valor = valor
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(configuracion)
    return configuracion


def ensure_plan_de_cuentas(db: Session) -> models.Configuracion:
    configuracion = get_configuracion(db, "PLAN_DE_CUENTAS")
    if configuracion is not None:
        return configuracion

    valor = schemas.PlanDeCuentas.model_validate(PLAN_DE_CUENTAS_POR_DEFECTO).root
    configuracion = models.Configuracion(clave="PLAN_DE_CUENTAS", valor=valor)
    db.add(configuracion)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        configuracion = get_configuracion(db, "PLAN_DE_CUENTAS")
        if configuracion is None:
            raise
    db.refresh(configuracion)
    return configuracion


def create_cuenta(
    db: Session, cuenta: schemas.CuentaCreate
) -> models.Cuenta | None:
    db_cuenta = models.Cuenta(
        titular=cuenta.titular,
        numero_cuenta=cuenta.numero_cuenta,
        moneda=cuenta.moneda,
        saldo_inicial=cuenta.saldo_inicial,
    )
    db.add(db_cuenta)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    db.refresh(db_cuenta)
    return db_cuenta


def get_cuenta(db: Session, cuenta_id: int) -> models.Cuenta | None:
    return db.query(models.Cuenta).filter(models.Cuenta.id == cuenta_id).first()


def actualizar_saldo_inicial(
    db: Session, cuenta_id: int, nuevo_saldo: int
) -> models.Cuenta | None:
    cuenta = get_cuenta(db, cuenta_id)
    if cuenta is None:
        return None

    cuenta.saldo_inicial = nuevo_saldo
    db.commit()
    db.refresh(cuenta)
    return cuenta


def ensure_cuenta_principal(db: Session) -> models.Cuenta:
    cuenta = get_cuenta(db, 1)
    if cuenta is not None:
        return cuenta

    # Los datos del cliente se conservan fuera del código publicado.
    archivo_local = Path(__file__).resolve().parents[2] / ".cuenta-local.json"
    datos_locales = (
        json.loads(archivo_local.read_text(encoding="utf-8-sig"))
        if archivo_local.is_file()
        else {}
    )
    saldo_base = os.getenv("CUENTA_SALDO_INICIAL", datos_locales.get("saldo_inicial"))
    if saldo_base is None:
        raise RuntimeError(
            "Configure CUENTA_SALDO_INICIAL antes de crear la cuenta base. "
            "No se asumirá un saldo cero automáticamente."
        )
    datos_cuenta = schemas.CuentaCreate(
        titular=os.getenv("CUENTA_TITULAR", datos_locales.get("titular", "Cuenta principal")),
        numero_cuenta=os.getenv("CUENTA_NUMERO", datos_locales.get("numero_cuenta", "SIN-CONFIGURAR")),
        moneda="CLP",
        saldo_inicial=int(saldo_base),
    )
    cuenta = models.Cuenta(id=1, **datos_cuenta.model_dump())
    db.add(cuenta)
    try:
        db.flush()
        if db.get_bind().dialect.name == "postgresql":
            # El ID fijo de la cuenta base no avanza SERIAL automáticamente.
            # No retroceder una secuencia que ya tiene valores consumidos.
            db.execute(text(
                "SELECT setval(pg_get_serial_sequence('cuentas', 'id'), "
                "GREATEST((SELECT MAX(id) FROM cuentas), "
                "nextval(pg_get_serial_sequence('cuentas', 'id'))), true)"
            ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(cuenta)
    return cuenta


def create_movimiento(
    db: Session, movimiento: schemas.MovimientoCreate
) -> models.Movimiento | None:
    if get_cuenta(db, movimiento.cuenta_id) is None:
        return None
    db_mov = models.Movimiento(
        cuenta_id=movimiento.cuenta_id,
        fecha=movimiento.fecha,
        sucursal=movimiento.sucursal,
        descripcion=movimiento.descripcion,
        centro_costo=movimiento.centro_costo,
        tipo=TipoMovimiento(movimiento.tipo.value),
        monto=movimiento.monto,
        categoria=movimiento.categoria,
        subcategoria=movimiento.subcategoria,
    )
    db.add(db_mov)
    db.commit()
    db.refresh(db_mov)
    return db_mov


def actualizar_movimiento(
    db: Session,
    movimiento_id: int,
    movimiento_actualizado: schemas.MovimientoUpdate,
) -> models.Movimiento | None:
    db_mov = (
        db.query(models.Movimiento)
        .filter(models.Movimiento.id == movimiento_id)
        .first()
    )
    if db_mov is None:
        return None

    db_mov.fecha = movimiento_actualizado.fecha
    db_mov.sucursal = movimiento_actualizado.sucursal
    db_mov.descripcion = movimiento_actualizado.descripcion
    db_mov.centro_costo = movimiento_actualizado.centro_costo
    db_mov.monto = movimiento_actualizado.monto
    db_mov.tipo = TipoMovimiento(movimiento_actualizado.tipo.value)
    db_mov.categoria = movimiento_actualizado.categoria
    db_mov.subcategoria = movimiento_actualizado.subcategoria
    db.commit()
    db.refresh(db_mov)
    return db_mov


def delete_movimiento(db: Session, movimiento_id: int) -> bool:
    db_mov = (
        db.query(models.Movimiento)
        .filter(models.Movimiento.id == movimiento_id)
        .first()
    )
    if db_mov is None:
        return False

    db.delete(db_mov)
    db.commit()
    return True


def create_movimientos_en_lote(
    db: Session, cuenta_id: int, movimientos: list[dict]
) -> tuple[int, int] | None:
    if get_cuenta(db, cuenta_id) is None:
        return None
    if not movimientos:
        return (0, 0)

    insertados = 0
    duplicados = 0
    claves_vistas: set[tuple] = set()
    cargo_existente = func.coalesce(
        case(
            (models.Movimiento.tipo == TipoMovimiento.CARGO, models.Movimiento.monto),
            else_=0,
        ),
        0,
    )
    abono_existente = func.coalesce(
        case(
            (models.Movimiento.tipo == TipoMovimiento.ABONO, models.Movimiento.monto),
            else_=0,
        ),
        0,
    )

    try:
        for movimiento in movimientos:
            tipo = TipoMovimiento(movimiento["tipo"])
            monto = movimiento["monto"]
            cargos = monto if tipo == TipoMovimiento.CARGO else 0
            abonos = monto if tipo == TipoMovimiento.ABONO else 0
            clave = (
                movimiento["fecha"],
                movimiento["descripcion"],
                cargos,
                abonos,
            )

            # Este conjunto también detecta duplicados repetidos dentro del mismo archivo.
            if clave in claves_vistas:
                duplicados += 1
                continue

            existe = (
                db.query(models.Movimiento.id)
                .filter(
                    models.Movimiento.cuenta_id == cuenta_id,
                    models.Movimiento.fecha == movimiento["fecha"],
                    models.Movimiento.descripcion == movimiento["descripcion"],
                    cargo_existente == cargos,
                    abono_existente == abonos,
                )
                .first()
            )
            if existe is not None:
                duplicados += 1
                claves_vistas.add(clave)
                continue

            db.add(
                models.Movimiento(
                    cuenta_id=cuenta_id,
                    fecha=movimiento["fecha"],
                    sucursal=movimiento["sucursal"],
                    descripcion=movimiento["descripcion"],
                    centro_costo=movimiento.get("centro_costo", ""),
                    tipo=tipo,
                    monto=monto,
                    categoria=movimiento.get("categoria") or "Sin clasificar",
                    subcategoria=movimiento.get("subcategoria") or "Sin subcategoría",
                )
            )
            db.flush()
            insertados += 1
            claves_vistas.add(clave)

        db.commit()
    except Exception:
        db.rollback()
        raise
    return insertados, duplicados


def list_movimientos_ordenados(
    db: Session, cuenta_id: int
) -> list[models.Movimiento]:
    return (
        db.query(models.Movimiento)
        .filter(models.Movimiento.cuenta_id == cuenta_id)
        .order_by(models.Movimiento.fecha.asc(), models.Movimiento.id.asc())
        .all()
    )


def normalizar_descripcion(valor: str | None) -> str:
    """Unificar mayúsculas y espacios sin modificar la descripción guardada."""
    return " ".join((valor or "").lower().split())


def get_diccionario_clasificacion(
    db: Session, cuenta_id: int = 1
) -> dict[str, dict[str, str]]:
    """Recordar la clasificación del movimiento más reciente de cada descripción."""
    historial = (
        db.query(
            models.Movimiento.descripcion,
            models.Movimiento.categoria,
            models.Movimiento.subcategoria,
        )
        .filter(
            models.Movimiento.cuenta_id == cuenta_id,
            models.Movimiento.categoria.isnot(None),
            func.lower(func.trim(models.Movimiento.categoria)) != "sin clasificar",
        )
        .order_by(models.Movimiento.fecha.desc(), models.Movimiento.id.desc())
        .all()
    )
    diccionario: dict[str, dict[str, str]] = {}
    for descripcion, categoria, subcategoria in historial:
        clave = normalizar_descripcion(descripcion)
        categoria = (categoria or "").strip()
        if (
            not clave
            or clave in diccionario
            or not categoria
            or normalizar_descripcion(categoria) == "sin clasificar"
        ):
            continue
        diccionario[clave] = {
            "categoria": categoria,
            "subcategoria": (subcategoria or "").strip() or "Sin subcategoría",
        }
    return diccionario


def build_cartola(db: Session, cuenta_id: int) -> schemas.CartolaRead | None:
    cuenta = get_cuenta(db, cuenta_id)
    if cuenta is None:
        return None

    saldo = float(cuenta.saldo_inicial)
    lineas: list[schemas.CartolaLinea] = []

    for mov in list_movimientos_ordenados(db, cuenta_id):
        if mov.tipo == TipoMovimiento.CARGO:
            saldo -= mov.monto
        else:
            saldo += mov.monto

        lineas.append(
            schemas.CartolaLinea(
                id=mov.id,
                cuenta_id=mov.cuenta_id,
                fecha=mov.fecha,
                sucursal=mov.sucursal,
                descripcion=mov.descripcion,
                centro_costo=mov.centro_costo,
                tipo=schemas.TipoMovimiento(mov.tipo.value),
                monto=mov.monto,
                categoria=mov.categoria,
                subcategoria=mov.subcategoria,
                saldo_resultante=saldo,
            )
        )

    return schemas.CartolaRead(
        cuenta=schemas.CuentaRead.model_validate(cuenta),
        saldo_inicial=cuenta.saldo_inicial,
        saldo_final=saldo,
        lineas=lineas,
    )
