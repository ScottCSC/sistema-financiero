from datetime import date
from enum import Enum
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator


class PlanDeCuentas(RootModel[dict[str, dict[str, list[str]]]]):
    @model_validator(mode="after")
    def validar_plan(self):
        if set(self.root) != {"Ingresos", "Egresos", "Sin clasificar"}:
            raise ValueError("El plan debe contener los grupos Ingresos, Egresos y Sin clasificar.")

        def limpiar_nombre(nombre):
            nombre = " ".join(nombre.split())
            if not nombre or len(nombre) > 100:
                raise ValueError("Los nombres deben tener entre 1 y 100 caracteres.")
            return nombre

        def clave_nombre(nombre):
            texto = unicodedata.normalize("NFKD", nombre.casefold())
            return "".join(letra for letra in texto if not unicodedata.combining(letra))

        normalizado = {}
        categorias_vistas = set()
        for grupo, categorias in self.root.items():
            normalizado[grupo] = {}
            for categoria, subcategorias in categorias.items():
                categoria = limpiar_nombre(categoria)
                clave = clave_nombre(categoria)
                if clave in categorias_vistas:
                    raise ValueError("Una categoría no puede repetirse en el plan de cuentas.")
                categorias_vistas.add(clave)
                if not subcategorias:
                    raise ValueError("Cada categoría debe tener al menos una subcategoría.")

                nombres = [limpiar_nombre(nombre) for nombre in subcategorias]
                if len({clave_nombre(nombre) for nombre in nombres}) != len(nombres):
                    raise ValueError("Las subcategorías no pueden repetirse dentro de una categoría.")
                normalizado[grupo][categoria] = nombres

        if "Sin subcategoría" not in normalizado["Sin clasificar"].get("Sin clasificar", []):
            raise ValueError("Debe conservarse la categoría Sin clasificar con Sin subcategoría.")
        self.root = normalizado
        return self


class TipoMovimiento(str, Enum):
    CARGO = "CARGO"
    ABONO = "ABONO"


class CuentaCreate(BaseModel):
    titular: str = Field(min_length=1, max_length=200)
    numero_cuenta: str = Field(min_length=1, max_length=50)
    moneda: str = Field(min_length=1, max_length=10)
    saldo_inicial: float = 0.0


class CuentaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    titular: str
    numero_cuenta: str
    moneda: str
    saldo_inicial: float


class CuentaSaldoUpdate(BaseModel):
    nuevo_saldo: int


class MovimientoCreate(BaseModel):
    cuenta_id: int
    fecha: date
    sucursal: str = Field(min_length=1, max_length=100)
    descripcion: str = Field(min_length=1, max_length=500)
    centro_costo: str = Field(default="", max_length=120)
    tipo: TipoMovimiento
    monto: float = Field(gt=0)
    categoria: str = Field(min_length=1, max_length=100)
    subcategoria: str = Field(min_length=1, max_length=100)


class MovimientoUpdate(BaseModel):
    fecha: date
    sucursal: str = Field(min_length=1, max_length=100)
    descripcion: str = Field(min_length=1, max_length=500)
    centro_costo: str = Field(default="", max_length=120)
    tipo: TipoMovimiento
    monto: float = Field(gt=0)
    categoria: str = Field(min_length=1, max_length=100)
    subcategoria: str = Field(min_length=1, max_length=100)


class MovimientoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cuenta_id: int
    fecha: date
    sucursal: str
    descripcion: str
    centro_costo: str
    tipo: TipoMovimiento
    monto: float
    categoria: str
    subcategoria: str


class CartolaLinea(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cuenta_id: int
    fecha: date
    sucursal: str
    descripcion: str
    centro_costo: str
    tipo: TipoMovimiento
    monto: float
    categoria: str
    subcategoria: str
    saldo_resultante: float


class CartolaRead(BaseModel):
    cuenta: CuentaRead
    saldo_inicial: float
    saldo_final: float
    lineas: list[CartolaLinea]
