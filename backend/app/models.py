import enum

from sqlalchemy import Column, Date, Enum, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from .database import Base


class TipoMovimiento(str, enum.Enum):
    CARGO = "CARGO"
    ABONO = "ABONO"


class Configuracion(Base):
    __tablename__ = "configuraciones"

    clave = Column(String(100), primary_key=True)
    valor = Column(JSON, nullable=False)


class Cuenta(Base):
    __tablename__ = "cuentas"

    id = Column(Integer, primary_key=True, index=True)
    titular = Column(String, nullable=False, index=True)
    numero_cuenta = Column(String, unique=True, nullable=False, index=True)
    moneda = Column(String, nullable=False)
    saldo_inicial = Column(Float, nullable=False, default=0.0)

    movimientos = relationship(
        "Movimiento", back_populates="cuenta", order_by="Movimiento.fecha"
    )


class Movimiento(Base):
    __tablename__ = "movimientos"

    id = Column(Integer, primary_key=True, index=True)
    cuenta_id = Column(Integer, ForeignKey("cuentas.id"), nullable=False, index=True)
    fecha = Column(Date, nullable=False, index=True)
    sucursal = Column(String, nullable=False)
    descripcion = Column(String, nullable=False)
    centro_costo = Column(String, nullable=False, default="")
    tipo = Column(Enum(TipoMovimiento), nullable=False)
    monto = Column(Float, nullable=False)
    categoria = Column(String, nullable=False, default="Sin clasificar")
    subcategoria = Column(String, nullable=False, default="Sin subcategoría")

    cuenta = relationship("Cuenta", back_populates="movimientos")
