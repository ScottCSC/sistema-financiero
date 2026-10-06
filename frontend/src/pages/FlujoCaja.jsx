import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, ChevronDown, ChevronRight, Download, Info, LoaderCircle } from "lucide-react";
import { CUENTA_ID, getCartola } from "../api.js";
import { formatearMoneda } from "../utils/formato.js";
import { exportarFlujoPdf } from "../utils/exportarFlujoPdf.js";

const FORMATO_MES = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" });

function obtenerClavePeriodo(fechaString, tipoAgrupacion) {
  const fechaISO = typeof fechaString === "string" ? fechaString.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) return null;

  const fecha = new Date(`${fechaISO}T00:00:00.000Z`);
  if (
    !Number.isFinite(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== fechaISO
  ) return null;

  if (tipoAgrupacion === "anual") return fechaISO.slice(0, 4);
  if (tipoAgrupacion === "mensual") {
    const mes = FORMATO_MES.format(fecha);
    return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${fechaISO.slice(0, 4)}`;
  }
  if (tipoAgrupacion !== "semanal") return null;

  // ISO: la semana empieza el lunes y pertenece al año de su jueves.
  const diaSemana = fecha.getUTCDay() || 7;
  fecha.setUTCDate(fecha.getUTCDate() + 4 - diaSemana);
  const anioISO = fecha.getUTCFullYear();
  const inicioAnio = new Date(fecha);
  inicioAnio.setUTCMonth(0, 1);
  const numeroSemana = Math.ceil(((fecha - inicioAnio) / 86400000 + 1) / 7);
  return `Semana ${numeroSemana} - ${anioISO}`;
}

const TEXTOS_AGRUPACION = {
  semanal: { detalle: "semana a semana", flujo: "Flujo Neto de la Semana" },
  mensual: { detalle: "mes a mes", flujo: "Flujo Neto del Mes" },
  anual: { detalle: "año a año", flujo: "Flujo Neto del Año" },
};

function FlujoCaja() {
  const [agrupacion, setAgrupacion] = useState("mensual");
  const [movimientos, setMovimientos] = useState([]);
  const [cuenta, setCuenta] = useState(null);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [categoriasCerradas, setCategoriasCerradas] = useState(() => new Set());
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [mensajePdf, setMensajePdf] = useState("");
  const [errorPdf, setErrorPdf] = useState("");
  const tablaRef = useRef(null);

  useEffect(() => {
    let activo = true;

    async function cargarDatos() {
      setCargando(true);
      setError("");
      try {
        const cartola = await getCartola(CUENTA_ID);
        if (!activo) return;
        setMovimientos(Array.isArray(cartola?.lineas) ? cartola.lineas : []);
        setCuenta(cartola.cuenta ?? null);
        setSaldoInicial(Number(cartola.cuenta?.saldo_inicial ?? cartola.saldo_inicial ?? 0));
      } catch (errorCarga) {
        if (activo) {
          const detalle = errorCarga.response?.data?.detail;
          setError(
            typeof detalle === "string"
              ? detalle
              : "No se pudo cargar el flujo de caja. Compruebe que el servidor esté disponible."
          );
        }
      } finally {
        if (activo) setCargando(false);
      }
    }

    void cargarDatos();
    return () => {
      activo = false;
    };
  }, []);

  const matriz = useMemo(() => {
    if (!Array.isArray(movimientos) || movimientos.length === 0) {
      return {
        periodos: [],
        matrizIngresos: new Map(),
        matrizEgresos: new Map(),
        subtotalesIngresos: new Map(),
        subtotalesEgresos: new Map(),
        saldosPorPeriodo: [],
        proyeccion: {
          ingresos: 0,
          egresos: 0,
          flujoNeto: 0,
          saldoAcumulado: saldoInicial,
        },
      };
    }

    const periodosPorClave = new Map();
    const matrizIngresos = new Map();
    const matrizEgresos = new Map();
    const subtotalesIngresos = new Map();
    const subtotalesEgresos = new Map();
    const movimientosCronologicos = [...movimientos].sort((a, b) => {
      const porFecha = String(a.fecha).localeCompare(String(b.fecha));
      return porFecha || Number(a.id) - Number(b.id);
    });

    function sumarMonto(destino, clavePeriodo, monto) {
      destino.set(clavePeriodo, (destino.get(clavePeriodo) ?? 0) + monto);
    }

    function agregarAlBloque(destino, subtotales, movimiento, clavePeriodo, monto) {
      sumarMonto(subtotales, clavePeriodo, monto);
      const nombreCategoria = movimiento.categoria?.trim() || "Sin clasificar";
      const nombreSubcategoria = movimiento.subcategoria?.trim() || "Sin subcategoría";
      let categoria = destino.get(nombreCategoria);
      if (!categoria) {
        categoria = { nombre: nombreCategoria, periodos: new Map(), subcategorias: new Map() };
        destino.set(nombreCategoria, categoria);
      }
      sumarMonto(categoria.periodos, clavePeriodo, monto);

      let subcategoria = categoria.subcategorias.get(nombreSubcategoria);
      if (!subcategoria) {
        subcategoria = { nombre: nombreSubcategoria, periodos: new Map() };
        categoria.subcategorias.set(nombreSubcategoria, subcategoria);
      }
      sumarMonto(subcategoria.periodos, clavePeriodo, monto);
    }

    movimientosCronologicos.forEach((movimiento) => {
      const fecha = typeof movimiento.fecha === "string" ? movimiento.fecha.trim() : "";
      const clavePeriodo = obtenerClavePeriodo(fecha, agrupacion);
      if (clavePeriodo === null) return;

      const abonos = Number(
        movimiento.abonos ?? (movimiento.tipo === "ABONO" ? movimiento.monto : 0)
      ) || 0;
      const cargos = Number(
        movimiento.cargos ?? (movimiento.tipo === "CARGO" ? movimiento.monto : 0)
      ) || 0;
      if (
        !Number.isFinite(abonos) || !Number.isFinite(cargos) ||
        abonos < 0 || cargos < 0 || (abonos === 0 && cargos === 0)
      ) return;

      if (!periodosPorClave.has(clavePeriodo)) {
        // Guardar la primera fecha del período evita ordenar alfabéticamente sus etiquetas.
        periodosPorClave.set(clavePeriodo, {
          clave: clavePeriodo,
          etiqueta: clavePeriodo,
          orden: new Date(`${fecha}T00:00:00.000Z`).getTime(),
        });
      }
      if (abonos > 0) {
        agregarAlBloque(matrizIngresos, subtotalesIngresos, movimiento, clavePeriodo, abonos);
      }
      if (cargos > 0) {
        agregarAlBloque(matrizEgresos, subtotalesEgresos, movimiento, clavePeriodo, cargos);
      }
    });

    const periodos = [...periodosPorClave.values()].sort((a, b) => a.orden - b.orden);
    const promedioPorPeriodo = (totalesPorPeriodo) => {
      if (periodos.length === 0) return 0;
      const total = periodos.reduce(
        (suma, periodo) => suma + (totalesPorPeriodo.get(periodo.clave) ?? 0),
        0
      );
      return total / periodos.length;
    };

    function prepararMatriz(bloque) {
      const categorias = [...bloque.values()]
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }))
        .map((categoria) => ({
          ...categoria,
          proyeccion: promedioPorPeriodo(categoria.periodos),
          subcategorias: [...categoria.subcategorias.values()]
            .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }))
            .map((subcategoria) => ({
              ...subcategoria,
              proyeccion: promedioPorPeriodo(subcategoria.periodos),
            })),
        }));
      return new Map(categorias.map((categoria) => [categoria.nombre, categoria]));
    }

    const saldosPorPeriodo = periodos.reduce((saldos, periodo) => {
      const flujoNeto = (subtotalesIngresos.get(periodo.clave) ?? 0) -
        (subtotalesEgresos.get(periodo.clave) ?? 0);
      const saldoAnterior = saldos.at(-1)?.saldoAcumulado ?? saldoInicial;
      saldos.push({
        clave: periodo.clave,
        flujoNeto,
        saldoAcumulado: saldoAnterior + flujoNeto,
      });
      return saldos;
    }, []);

    const proyeccionIngresos = promedioPorPeriodo(subtotalesIngresos);
    const proyeccionEgresos = promedioPorPeriodo(subtotalesEgresos);
    const proyeccionFlujoNeto = proyeccionIngresos - proyeccionEgresos;

    return {
      periodos,
      matrizIngresos: prepararMatriz(matrizIngresos),
      matrizEgresos: prepararMatriz(matrizEgresos),
      subtotalesIngresos,
      subtotalesEgresos,
      saldosPorPeriodo,
      proyeccion: {
        ingresos: proyeccionIngresos,
        egresos: proyeccionEgresos,
        flujoNeto: proyeccionFlujoNeto,
        saldoAcumulado:
          (saldosPorPeriodo.at(-1)?.saldoAcumulado ?? saldoInicial) + proyeccionFlujoNeto,
      },
    };
  }, [movimientos, saldoInicial, agrupacion]);

  function alternarCategoria(claveCategoria) {
    setCategoriasCerradas((actuales) => {
      const nuevas = new Set(actuales);
      if (nuevas.has(claveCategoria)) nuevas.delete(claveCategoria);
      else nuevas.add(claveCategoria);
      return nuevas;
    });
  }

  function claseMonto(valor) {
    if (valor > 0) return "monto-flujo positivo";
    if (valor < 0) return "monto-flujo negativo";
    return "monto-flujo";
  }

  async function generarReportePdf() {
    if (generandoPdf) return;
    setGenerandoPdf(true);
    setMensajePdf("");
    setErrorPdf("");

    try {
      await exportarFlujoPdf({
        tabla: tablaRef.current,
        empresa: cuenta?.titular || "Control Cartola",
        agrupacion,
      });
      setMensajePdf("Reporte PDF generado.");
    } catch (errorExportacion) {
      setErrorPdf(
        errorExportacion instanceof Error
          ? `No se pudo generar el reporte PDF. ${errorExportacion.message}`
          : "No se pudo generar el reporte PDF. Intente nuevamente."
      );
    } finally {
      setGenerandoPdf(false);
    }
  }

  if (cargando) {
    return <div className="loading-mensaje" role="status">Cargando flujo de caja...</div>;
  }

  if (error) {
    return (
      <div className="error-flujo-mensaje" role="alert">
        <CircleAlert size={24} aria-hidden="true" />
        {error}
      </div>
    );
  }

  return (
    <main className="pagina pagina-flujo">
      <header className="flujo-cabecera">
        <p className="flujo-eyebrow">Inteligencia de negocios</p>
        <div className="flujo-titulo-controles">
          <h1>Flujo de Caja</h1>
          <div className="flujo-acciones">
            <label className="selector-periodo selector-agrupacion">
              Agrupar por
              <select value={agrupacion} onChange={(evento) => setAgrupacion(evento.target.value)}>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
                <option value="anual">Anual</option>
              </select>
            </label>
            <button
              type="button"
              className="boton-generar-pdf"
              onClick={generarReportePdf}
              disabled={generandoPdf}
              aria-busy={generandoPdf}
            >
              {generandoPdf
                ? <LoaderCircle size={18} className="icono-cargando-pdf" aria-hidden="true" />
                : <Download size={18} aria-hidden="true" />}
              {generandoPdf ? "Generando reporte..." : "Generar Reporte PDF"}
            </button>
          </div>
        </div>
        <p>Ingresos y egresos por categoría, {TEXTOS_AGRUPACION[agrupacion].detalle}.</p>
        {mensajePdf && <p className="reporte-pdf-mensaje" role="status">{mensajePdf}</p>}
        {errorPdf && <p className="reporte-pdf-error" role="alert">{errorPdf}</p>}
      </header>

      <section className="envoltorio-flujo" aria-label="Matriz de flujo de caja">
          <div className="table-responsive tabla-flujo-scroll" tabIndex={0} role="region" aria-label="Tabla de flujo de caja, desplazable horizontal y verticalmente">
            <table className="tabla-flujo" ref={tablaRef}>
              <thead>
                <tr>
                  <th scope="col">Categoría / Subcategoría</th>
                  {matriz.periodos.map((periodo) => (
                    <th scope="col" key={periodo.clave}>{periodo.etiqueta}</th>
                  ))}
                  <th scope="col" className="columna-proyeccion">
                    <div
                      className="tooltip-container"
                      tabIndex={0}
                      aria-describedby="ayuda-proyeccion"
                    >
                      <span>Proyección</span>
                      <Info className="icono-info" size={14} aria-hidden="true" />
                      <span className="tooltip-text" id="ayuda-proyeccion" role="tooltip">
                        Cálculo estimado basado en el promedio histórico {agrupacion}. Para cada concepto, los períodos disponibles sin actividad cuentan como $0.
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <BloqueFlujo
                bloque="ingresos"
                titulo="INGRESOS"
                categorias={matriz.matrizIngresos}
                periodos={matriz.periodos}
                subtotales={matriz.subtotalesIngresos}
                proyeccion={matriz.proyeccion.ingresos}
                categoriasCerradas={categoriasCerradas}
                alAlternar={alternarCategoria}
              />
              <BloqueFlujo
                bloque="egresos"
                titulo="EGRESOS"
                categorias={matriz.matrizEgresos}
                periodos={matriz.periodos}
                subtotales={matriz.subtotalesEgresos}
                proyeccion={matriz.proyeccion.egresos}
                categoriasCerradas={categoriasCerradas}
                alAlternar={alternarCategoria}
              />
              <tfoot>
                <tr className="fila-flujo-neto">
                  <th scope="row">{TEXTOS_AGRUPACION[agrupacion].flujo}</th>
                  {matriz.periodos.map((periodo) => {
                    const neto = (matriz.subtotalesIngresos.get(periodo.clave) ?? 0) -
                      (matriz.subtotalesEgresos.get(periodo.clave) ?? 0);
                    return (
                      <td className={claseMonto(neto)} key={periodo.clave}>
                        {formatearMoneda(neto)}
                      </td>
                    );
                  })}
                  <td className={`columna-proyeccion ${claseMonto(matriz.proyeccion.flujoNeto)}`}>
                    {formatearMoneda(matriz.proyeccion.flujoNeto)}
                  </td>
                </tr>
                <tr className="fila-saldo-acumulado">
                  <th scope="row">Saldo Acumulado</th>
                  {matriz.saldosPorPeriodo.map((periodo) => (
                    <td
                      className={periodo.saldoAcumulado < 0 ? "saldo-negativo" : undefined}
                      key={periodo.clave}
                    >
                      {formatearMoneda(periodo.saldoAcumulado)}
                    </td>
                  ))}
                  <td className={`columna-proyeccion${matriz.proyeccion.saldoAcumulado < 0 ? " saldo-negativo" : ""}`}>
                    {formatearMoneda(matriz.proyeccion.saldoAcumulado)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="detalle-proyeccion" aria-label="Desglose de valores proyectados">
            <span>Ingresos proyectados <strong className="monto-flujo positivo">{formatearMoneda(matriz.proyeccion.ingresos)}</strong></span>
            <span>Egresos proyectados <strong className="monto-flujo negativo">{formatearMoneda(matriz.proyeccion.egresos)}</strong></span>
          </div>
      </section>
    </main>
  );
}

function BloqueFlujo({
  bloque, titulo, categorias, periodos, subtotales, proyeccion,
  categoriasCerradas, alAlternar,
}) {
  const nombreBloque = bloque === "ingresos" ? "Ingresos" : "Egresos";
  const claseMonto = (valor) => {
    if (valor === 0) return "monto-flujo";
    return `monto-flujo ${bloque === "ingresos" ? "positivo" : "negativo"}`;
  };

  return (
    <tbody>
      <tr className="fila-seccion-titulo">
        <th colSpan={periodos.length + 2} scope="rowgroup">{titulo}</th>
      </tr>
      {categorias.size === 0 ? (
        <tr>
          <td className="tabla-flujo-vacia" colSpan={periodos.length + 2}>
            No hay {bloque} para mostrar todavía.
          </td>
        </tr>
      ) : (
        [...categorias.values()].map((categoria) => {
          const claveCategoria = `${bloque}:${categoria.nombre}`;
          const abierta = !categoriasCerradas.has(claveCategoria);
          return (
            <FragmentCategoria
              key={claveCategoria}
              categoria={categoria}
              periodos={periodos}
              abierta={abierta}
              Icono={abierta ? ChevronDown : ChevronRight}
              alAlternar={() => alAlternar(claveCategoria)}
              claseMonto={claseMonto}
            />
          );
        })
      )}
      <tr className="fila-subtotal">
        <th scope="row">Subtotal {nombreBloque}</th>
        {periodos.map((periodo) => {
          const total = subtotales.get(periodo.clave) ?? 0;
          return (
            <td className={claseMonto(total)} key={periodo.clave}>
              {formatearMoneda(total)}
            </td>
          );
        })}
        <td className={`columna-proyeccion ${claseMonto(proyeccion)}`}>
          {formatearMoneda(proyeccion)}
        </td>
      </tr>
    </tbody>
  );
}

function FragmentCategoria({ categoria, periodos, abierta, Icono, alAlternar, claseMonto }) {
  return (
    <>
      <tr className="fila-categoria">
        <th scope="row">
          <button
            type="button"
            className="boton-categoria-flujo"
            onClick={alAlternar}
            aria-expanded={abierta}
          >
            <Icono size={20} aria-hidden="true" />
            <span>{categoria.nombre}</span>
          </button>
        </th>
        {periodos.map((periodo) => {
          const monto = categoria.periodos.get(periodo.clave) ?? 0;
          return (
            <td className={claseMonto(monto)} key={periodo.clave}>
              {formatearMoneda(monto)}
            </td>
          );
        })}
        <td className={`columna-proyeccion ${claseMonto(categoria.proyeccion)}`}>
          {formatearMoneda(categoria.proyeccion)}
        </td>
      </tr>
      {abierta
        ? categoria.subcategorias.map((subcategoria) => (
            <tr className="fila-subcategoria" key={`${categoria.nombre}-${subcategoria.nombre}`}>
              <th scope="row">{subcategoria.nombre}</th>
              {periodos.map((periodo) => {
                const monto = subcategoria.periodos.get(periodo.clave) ?? 0;
                return (
                  <td className={claseMonto(monto)} key={periodo.clave}>
                    {formatearMoneda(monto)}
                  </td>
                );
              })}
              <td className={`columna-proyeccion ${claseMonto(subcategoria.proyeccion)}`}>
                {formatearMoneda(subcategoria.proyeccion)}
              </td>
            </tr>
          ))
        : null}
    </>
  );
}

export default FlujoCaja;
