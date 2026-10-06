const FORMATO_REFERENCIA = new Intl.DateTimeFormat("es-CL", {
  year: "numeric",
  month: "2-digit",
  timeZone: "America/Santiago",
});

const FORMATO_MES_COMPLETO = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const FORMATO_MES_CORTO = new Intl.DateTimeFormat("es-CL", {
  month: "short",
  timeZone: "UTC",
});

function obtenerPeriodoActual(fechaReferencia) {
  const referencia = fechaReferencia instanceof Date &&
    Number.isFinite(fechaReferencia.getTime())
    ? fechaReferencia
    : new Date();
  const partes = FORMATO_REFERENCIA.formatToParts(referencia);
  return {
    anio: Number(partes.find((parte) => parte.type === "year").value),
    mes: Number(partes.find((parte) => parte.type === "month").value) - 1,
  };
}

function crearPeriodo(anio, mes) {
  // UTC preserva el mes calendario sin desplazarlo por la zona horaria del navegador.
  const fecha = new Date(0);
  fecha.setUTCFullYear(anio, mes, 1);
  const partes = FORMATO_MES_COMPLETO.formatToParts(fecha);
  const nombreMes = partes.find((parte) => parte.type === "month").value;
  const etiqueta = `${nombreMes.charAt(0).toUpperCase()}${nombreMes.slice(1)} ${fecha.getUTCFullYear()}`;
  return {
    clave: `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`,
    mes: FORMATO_MES_CORTO.format(fecha).replace(/\.$/, ""),
    etiqueta,
    ingresos: 0,
    egresos: 0,
  };
}

function obtenerClaveFecha(valor) {
  if (typeof valor !== "string") return null;
  const fechaISO = valor.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) return null;
  const fecha = new Date(`${fechaISO}T00:00:00.000Z`);
  if (
    !Number.isFinite(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== fechaISO
  ) return null;
  return fechaISO.slice(0, 7);
}

function obtenerMonto(valor) {
  if (typeof valor !== "number" && typeof valor !== "string") return 0;
  const monto = Number(valor);
  return Number.isFinite(monto) && monto > 0 ? monto : 0;
}

export function crearResumenDashboard(lineas, fechaReferencia = new Date()) {
  const { anio, mes } = obtenerPeriodoActual(fechaReferencia);
  const historico = Array.from({ length: 6 }, (_, indice) =>
    crearPeriodo(anio, mes - 5 + indice)
  );
  const periodoActual = historico.at(-1);
  const periodosPorClave = new Map(historico.map((periodo) => [periodo.clave, periodo]));
  const categorias = new Map();
  let hayMovimientos = false;
  let hayHistorico = false;

  for (const movimiento of Array.isArray(lineas) ? lineas : []) {
    if (!movimiento || typeof movimiento !== "object") continue;
    const clave = obtenerClaveFecha(movimiento.fecha);
    if (!clave) continue;
    const tipo = typeof movimiento.tipo === "string"
      ? movimiento.tipo.trim().toUpperCase()
      : "";
    const ingresos = obtenerMonto(
      movimiento.abonos ?? (tipo === "ABONO" ? movimiento.monto : 0)
    );
    const egresos = obtenerMonto(
      movimiento.cargos ?? (tipo === "CARGO" ? movimiento.monto : 0)
    );
    if (ingresos === 0 && egresos === 0) continue;
    hayMovimientos = true;

    const periodo = periodosPorClave.get(clave);
    if (!periodo) continue;
    hayHistorico = true;
    periodo.ingresos += ingresos;
    periodo.egresos += egresos;

    if (clave === periodoActual.clave && egresos > 0) {
      const categoria = typeof movimiento.categoria === "string"
        ? movimiento.categoria.trim() || "Sin clasificar"
        : "Sin clasificar";
      categorias.set(categoria, (categorias.get(categoria) ?? 0) + egresos);
    }
  }

  const egresosPorCategoria = [...categorias.entries()]
    .map(([categoria, monto]) => ({
      categoria,
      monto,
      porcentaje: periodoActual.egresos > 0 ? (monto / periodoActual.egresos) * 100 : 0,
    }))
    .sort((a, b) => b.monto - a.monto || a.categoria.localeCompare(b.categoria, "es"));

  return {
    mesActual: { clave: periodoActual.clave, etiqueta: periodoActual.etiqueta },
    ingresosMes: periodoActual.ingresos,
    egresosMes: periodoActual.egresos,
    flujoNeto: periodoActual.ingresos - periodoActual.egresos,
    egresosPorCategoria,
    historico,
    hayMovimientos,
    hayHistorico,
  };
}
