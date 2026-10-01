import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Check,
  ArrowDown,
  ArrowUp,
  Download,
  Upload,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  actualizarSaldoInicial,
  actualizarMovimiento,
  crearMovimiento,
  eliminarMovimiento,
  exportarExcel,
  getCartola,
  getConfiguracion,
  importarExcel,
} from "../api.js";
import { formatearFecha, formatearMoneda } from "../utils/formato.js";
import { categoriasDelPlan, CLAVE_PLAN_CUENTAS, validarPlanCuentas } from "../utils/planCuentas.js";

function fechaLocalHoy() {
  const fecha = new Date();
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function nuevoMovimientoVacio() {
  return {
    fecha: fechaLocalHoy(),
    sucursal: "",
    descripcion: "",
    centro_costo: "",
    categoria: "Sin clasificar",
    subcategoria: "Sin subcategoría",
    cargo: "",
    abono: "",
  };
}

function formatearMontoEntrada(valor) {
  const digitos = String(valor).replace(/\D/g, "");
  return digitos ? Number.parseInt(digitos, 10).toLocaleString("es-CL") : "";
}

function crearFormularioEdicion(movimiento, categoriasPlan) {
  const esCargo = movimiento.tipo === "CARGO";
  const categoria = Object.hasOwn(categoriasPlan, movimiento.categoria)
    ? movimiento.categoria
    : "Sin clasificar";
  const subcategorias = categoriasPlan[categoria];
  const subcategoria = subcategorias.includes(movimiento.subcategoria)
    ? movimiento.subcategoria
    : subcategorias[0];
  return {
    fecha: movimiento.fecha,
    sucursal: movimiento.sucursal,
    descripcion: movimiento.descripcion,
    centro_costo: movimiento.centro_costo || "",
    categoria,
    subcategoria,
    cargo: esCargo ? formatearMontoEntrada(movimiento.monto) : "",
    abono: esCargo ? "" : formatearMontoEntrada(movimiento.monto),
  };
}

function Inicio() {
  const [planCuentas, setPlanCuentas] = useState(null);
  const [cargandoPlanCuentas, setCargandoPlanCuentas] = useState(true);
  const [errorPlanCuentas, setErrorPlanCuentas] = useState("");
  const [intentoPlan, setIntentoPlan] = useState(0);
  const [cartola, setCartola] = useState(null);
  const [periodoElegido, setPeriodoActual] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [filtroFecha, setFiltroFecha] = useState("Todas");
  const [filtroSucursal, setFiltroSucursal] = useState("Todas");
  const [menuFiltroAbierto, setMenuFiltroAbierto] = useState(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [eliminandoId, setEliminandoId] = useState(null);
  const [entradaRapida, setEntradaRapida] = useState(nuevoMovimientoVacio);
  const [guardandoRapido, setGuardandoRapido] = useState(false);
  const [mensajeIngreso, setMensajeIngreso] = useState(null);
  const [importandoExcel, setImportandoExcel] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [formularioEdicion, setFormularioEdicion] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [editandoSaldoInicial, setEditandoSaldoInicial] = useState(false);
  const [nuevoSaldoInicial, setNuevoSaldoInicial] = useState(0);
  const [guardandoSaldoInicial, setGuardandoSaldoInicial] = useState(false);
  const archivoExcelRef = useRef(null);
  const tablaRef = useRef(null);

  useEffect(() => {
    const contenedor = tablaRef.current;
    const cabecera = contenedor?.querySelector("thead");
    if (!cabecera) return;

    // La fila de ingreso se fija debajo de la altura real del encabezado,
    // incluso cuando cambian el ancho de pantalla o el tamaño del texto.
    function medirCabecera() {
      contenedor.style.setProperty("--altura-cabecera", `${cabecera.getBoundingClientRect().height}px`);
    }
    medirCabecera();
    const observador = new ResizeObserver(medirCabecera);
    observador.observe(cabecera);
    return () => observador.disconnect();
  }, [cargando, cargandoPlanCuentas, errorPlanCuentas]);

  const cargar = useCallback(async () => {
    setError("");
    try {
      const data = await getCartola(1);
      setCartola(data);
      return true;
    } catch {
      setError(
        "No se pudo leer la cartola. Confirme que el servidor esté encendido y que exista la cuenta 1."
      );
      return false;
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(cargar);
  }, [cargar]);

  useEffect(() => {
    let activo = true;
    async function cargarPlan() {
      try {
        const plan = validarPlanCuentas(await getConfiguracion(CLAVE_PLAN_CUENTAS));
        if (activo) setPlanCuentas(plan);
      } catch (errorCarga) {
        if (activo) {
          const detalle = errorCarga.response?.data?.detail;
          setErrorPlanCuentas(typeof detalle === "string" ? detalle :
            "No se pudo cargar el plan de cuentas. Compruebe que el servidor esté encendido.");
        }
      } finally {
        if (activo) setCargandoPlanCuentas(false);
      }
    }
    void cargarPlan();
    return () => { activo = false; };
  }, [intentoPlan]);

  const categoriasPlan = useMemo(() => categoriasDelPlan(planCuentas), [planCuentas]);

  const lineas = useMemo(() => cartola?.lineas ?? [], [cartola]);
  const periodosDisponibles = useMemo(() => {
    const periodos = new Map();
    lineas.forEach((linea) => {
      const coincidencia = String(linea.fecha ?? "").match(/^(\d{4})-(\d{2})-/);
      if (!coincidencia) return;
      const [, anio, mes] = coincidencia;
      const numeroMes = Number(mes);
      if (numeroMes < 1 || numeroMes > 12) return;

      const valor = `${anio}-${mes}`;
      const nombre = new Intl.DateTimeFormat("es-CL", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(Number(anio), numeroMes - 1, 1)));
      const etiqueta = nombre.replace(/^\p{L}/u, (letra) => letra.toLocaleUpperCase("es-CL"));
      periodos.set(valor, { valor, etiqueta });
    });
    return [...periodos.values()].sort((a, b) => b.valor.localeCompare(a.valor));
  }, [lineas]);

  const periodoActual = periodoElegido === "Todos"
    ? "Todos"
    : periodosDisponibles.some((periodo) => periodo.valor === periodoElegido)
      ? periodoElegido
      : periodosDisponibles[0]?.valor ?? "";

  const lineasDelPeriodo = useMemo(
    () =>
      periodoActual === "Todos"
        ? lineas
        : periodoActual
        ? lineas.filter((linea) => String(linea.fecha).slice(0, 7) === periodoActual)
        : [],
    [lineas, periodoActual]
  );
  const resumenPeriodo = useMemo(() => {
    const saldoInicialCuenta = cartola?.cuenta?.saldo_inicial ?? cartola?.saldo_inicial ?? 0;
    if (lineasDelPeriodo.length === 0) {
      return {
        saldoInicialPeriodo: saldoInicialCuenta,
        saldoFinalPeriodo: saldoInicialCuenta,
      };
    }

    const primerMovimiento = lineasDelPeriodo[0];
    const ultimoMovimiento = lineasDelPeriodo[lineasDelPeriodo.length - 1];
    const saldoPrimerMovimiento = Number(
      primerMovimiento.saldo_diario ?? primerMovimiento.saldo_resultante ?? saldoInicialCuenta
    );
    const abonoPrimerMovimiento = Number(
      primerMovimiento.abonos ??
        (primerMovimiento.tipo === "ABONO" ? primerMovimiento.monto : 0) ??
        0
    );
    const cargoPrimerMovimiento = Number(
      primerMovimiento.cargos ??
        (primerMovimiento.tipo === "CARGO" ? primerMovimiento.monto : 0) ??
        0
    );
    const saldoInicialPeriodo =
      saldoPrimerMovimiento - abonoPrimerMovimiento + cargoPrimerMovimiento;
    const saldoFinalPeriodo = Number(
      ultimoMovimiento.saldo_diario ?? ultimoMovimiento.saldo_resultante ?? saldoInicialCuenta
    );
    return {
      saldoInicialPeriodo,
      saldoFinalPeriodo,
    };
  }, [cartola, lineasDelPeriodo]);

  const etiquetaPeriodoActual =
    periodosDisponibles.find((periodo) => periodo.valor === periodoActual)?.etiqueta;

  const fechasUnicas = useMemo(
    () =>
      [...new Set(
        lineas
          .map((linea) => linea.fecha)
          .filter((fecha) => fecha != null && String(fecha).trim() !== "")
          .map(String)
      )].sort((a, b) => new Date(a).getTime() - new Date(b).getTime()),
    [lineas]
  );
  const sucursalesUnicas = useMemo(
    () =>
      [...new Set(
        lineas
          .map((linea) => linea.sucursal)
          .filter((sucursal) => sucursal != null && String(sucursal).trim() !== "")
          .map(String)
      )].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
    [lineas]
  );
  const lineasFiltradas = useMemo(() => {
    const consulta = busqueda.trim().toLocaleLowerCase("es");
    return lineasDelPeriodo.filter((linea) => {
      const coincideTipo =
        filtroTipo === "Todos" ||
        (filtroTipo === "Solo Ingresos" && linea.tipo === "ABONO") ||
        (filtroTipo === "Solo Gastos" && linea.tipo === "CARGO");
      const coincideFecha = filtroFecha === "Todas" || linea.fecha === filtroFecha;
      const coincideSucursal =
        filtroSucursal === "Todas" || linea.sucursal === filtroSucursal;
      const texto = [
        linea.fecha,
        linea.sucursal,
        linea.descripcion,
        linea.centro_costo,
        linea.categoria,
        linea.subcategoria,
        linea.tipo,
        linea.monto,
        linea.saldo_resultante,
      ]
        .join(" ")
        .toLocaleLowerCase("es");
      return (
        coincideTipo &&
        coincideFecha &&
        coincideSucursal &&
        (!consulta || texto.includes(consulta))
      );
    });
  }, [lineasDelPeriodo, filtroTipo, filtroFecha, filtroSucursal, busqueda]);

  const lineasOrdenadas = useMemo(() => {
    if (sortConfig.key === null) return lineasFiltradas;

    const multiplicador = sortConfig.direction === "asc" ? 1 : -1;
    const valorOrdenamiento = (linea) => {
      switch (sortConfig.key) {
        case "fecha":
          return new Date(linea.fecha).getTime();
        case "sucursal":
          return linea.sucursal ?? "";
        case "descripcion":
          return linea.descripcion ?? "";
        case "cargo":
          return linea.tipo === "CARGO" ? Number(linea.monto) : 0;
        case "abono":
          return linea.tipo === "ABONO" ? Number(linea.monto) : 0;
        default:
          return "";
      }
    };

    return [...lineasFiltradas].sort((a, b) => {
      const valorA = valorOrdenamiento(a);
      const valorB = valorOrdenamiento(b);
      const comparacion =
        typeof valorA === "string"
          ? valorA.localeCompare(valorB, "es", { sensitivity: "base" })
          : valorA - valorB;
      return comparacion * multiplicador;
    });
  }, [lineasFiltradas, sortConfig]);

  function handleSort(key) {
    setSortConfig((actual) => ({
      key,
      direction: actual.key === key && actual.direction === "asc" ? "desc" : "asc",
    }));
  }

  function toggleMenuFiltro(columna, evento) {
    evento.stopPropagation();
    setMenuFiltroAbierto((actual) => (actual === columna ? null : columna));
  }

  function restablecerFiltros() {
    setBusqueda("");
    setFiltroTipo("Todos");
    setFiltroFecha("Todas");
    setFiltroSucursal("Todas");
    setMenuFiltroAbierto(null);
    setSortConfig({ key: null, direction: "asc" });
  }

  function indicadorOrdenamiento(key) {
    if (sortConfig.key !== key) return null;
    const Icono = sortConfig.direction === "asc" ? ArrowUp : ArrowDown;
    return <Icono size={16} aria-hidden="true" />;
  }

  const saldoCronologiaAlterada = sortConfig.key !== null && sortConfig.key !== "fecha";
  const hayFiltrosActivos =
    busqueda !== "" ||
    filtroTipo !== "Todos" ||
    filtroFecha !== "Todas" ||
    filtroSucursal !== "Todas" ||
    sortConfig.key !== null;

  function iniciarEdicionSaldoInicial() {
    setNuevoSaldoInicial(Number(cartola?.saldo_inicial ?? 0));
    setEditandoSaldoInicial(true);
    setMensajeIngreso(null);
  }

  function cancelarEdicionSaldoInicial() {
    setEditandoSaldoInicial(false);
    setNuevoSaldoInicial(Number(cartola?.saldo_inicial ?? 0));
  }

  async function guardarSaldoInicial() {
    const saldo = Number(nuevoSaldoInicial);
    if (nuevoSaldoInicial === "" || !Number.isInteger(saldo)) {
      setMensajeIngreso({ tipo: "error", texto: "Ingrese un saldo inicial en pesos enteros." });
      return;
    }

    setGuardandoSaldoInicial(true);
    setMensajeIngreso(null);
    try {
      await actualizarSaldoInicial(1, saldo);
      const cartolaActualizada = await cargar();
      setEditandoSaldoInicial(false);
      if (cartolaActualizada) {
        setMensajeIngreso({
          tipo: "exito",
          texto: "Saldo base actualizado. Cartola y saldos recalculados.",
        });
      }
    } catch (err) {
      const detalle = err.response?.data?.detail;
      setMensajeIngreso({
        tipo: "error",
        texto: typeof detalle === "string" ? detalle : "No se pudo actualizar el saldo inicial.",
      });
    } finally {
      setGuardandoSaldoInicial(false);
    }
  }

  async function confirmarEliminacion(movimientoId) {
    const confirmar = window.confirm(
      "¿Estás seguro de que deseas eliminar este movimiento? El saldo se recalculará automáticamente."
    );
    if (!confirmar) return;

    setEliminandoId(movimientoId);
    setError("");
    try {
      await eliminarMovimiento(movimientoId);
      await cargar();
    } catch {
      setError("No se pudo eliminar el movimiento. Inténtelo nuevamente.");
    } finally {
      setEliminandoId(null);
    }
  }

  function iniciarEdicion(movimiento) {
    setEditandoId(movimiento.id);
    setFormularioEdicion(crearFormularioEdicion(movimiento, categoriasPlan));
    setMensajeIngreso(null);
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setFormularioEdicion(null);
  }

  function actualizarCampoEdicion(campo, valor) {
    if (campo === "categoria") {
      setFormularioEdicion((actual) => ({
        ...actual,
        categoria: valor,
        subcategoria: categoriasPlan[valor]?.[0] ?? "",
      }));
      return;
    }

    const valorActualizado = ["cargo", "abono"].includes(campo)
      ? formatearMontoEntrada(valor)
      : valor;
    setFormularioEdicion((actual) => ({ ...actual, [campo]: valorActualizado }));
  }

  async function guardarEdicion(movimientoId) {
    if (!formularioEdicion || movimientoId !== editandoId) return;
    setMensajeIngreso(null);

    if (
      !formularioEdicion.fecha ||
      !formularioEdicion.sucursal.trim() ||
      !formularioEdicion.descripcion.trim() ||
      !formularioEdicion.categoria.trim() ||
      !categoriasPlan[formularioEdicion.categoria]?.includes(formularioEdicion.subcategoria)
    ) {
      setMensajeIngreso({
        tipo: "error",
        texto: "Complete fecha, sucursal, descripción, categoría y subcategoría.",
      });
      return;
    }
    if (formularioEdicion.cargo && formularioEdicion.abono) {
      setMensajeIngreso({
        tipo: "error",
        texto: "Ingrese un cargo o un abono, pero no ambos en el mismo movimiento.",
      });
      return;
    }

    const tipo = formularioEdicion.cargo ? "CARGO" : "ABONO";
    const monto = Number.parseInt(
      String(formularioEdicion.cargo || formularioEdicion.abono).replace(/\D/g, ""),
      10
    );
    if (!Number.isFinite(monto) || monto <= 0) {
      setMensajeIngreso({ tipo: "error", texto: "Ingrese un monto mayor que cero." });
      return;
    }

    setGuardandoEdicion(true);
    try {
      await actualizarMovimiento(movimientoId, {
        fecha: formularioEdicion.fecha,
        sucursal: formularioEdicion.sucursal.trim(),
        descripcion: formularioEdicion.descripcion.trim(),
        centro_costo: formularioEdicion.centro_costo.trim(),
        categoria: formularioEdicion.categoria.trim(),
        subcategoria: formularioEdicion.subcategoria.trim(),
        tipo,
        monto,
      });
      const cartolaActualizada = await cargar();
      cancelarEdicion();
      if (cartolaActualizada) {
        setMensajeIngreso({
          tipo: "exito",
          texto: "Movimiento actualizado. Cartola y saldos recalculados.",
        });
      }
    } catch (err) {
      const detalle = err.response?.data?.detail;
      setMensajeIngreso({
        tipo: "error",
        texto:
          typeof detalle === "string"
            ? detalle
            : "No se pudo actualizar el movimiento. Revise los datos e inténtelo nuevamente.",
      });
    } finally {
      setGuardandoEdicion(false);
    }
  }

  function actualizarEntradaRapida(campo, valor) {
    if (campo === "categoria") {
      setEntradaRapida((actual) => ({
        ...actual,
        categoria: valor,
        subcategoria: categoriasPlan[valor]?.[0] ?? "",
      }));
    } else {
      setEntradaRapida((actual) => ({ ...actual, [campo]: valor }));
    }
    setMensajeIngreso(null);
  }

  async function guardarMovimientoRapido(evento) {
    evento.preventDefault();
    setMensajeIngreso(null);

    if (!entradaRapida.descripcion.trim()) {
      setMensajeIngreso({ tipo: "error", texto: "Escriba la descripción del movimiento." });
      return;
    }

    if (
      !entradaRapida.sucursal.trim() ||
      !entradaRapida.categoria.trim() ||
      !categoriasPlan[entradaRapida.categoria]?.includes(entradaRapida.subcategoria)
    ) {
      setMensajeIngreso({
        tipo: "error",
        texto: "Complete la sucursal, categoría y subcategoría del movimiento.",
      });
      return;
    }

    if (entradaRapida.cargo && entradaRapida.abono) {
      setMensajeIngreso({
        tipo: "error",
        texto: "Ingrese un cargo o un abono, pero no ambos en el mismo movimiento.",
      });
      return;
    }

    const tipo = entradaRapida.cargo ? "CARGO" : "ABONO";
    const montoSinFormato = String(entradaRapida.cargo || entradaRapida.abono).replace(/\D/g, "");
    const monto = Number.parseInt(montoSinFormato, 10);
    if (!Number.isFinite(monto) || monto <= 0) {
      setMensajeIngreso({ tipo: "error", texto: "Ingrese un monto mayor que cero en Cargo o Abono." });
      return;
    }

    setGuardandoRapido(true);
    try {
      await crearMovimiento({
        fecha: entradaRapida.fecha,
        sucursal: entradaRapida.sucursal.trim(),
        descripcion: entradaRapida.descripcion.trim(),
        centro_costo: entradaRapida.centro_costo.trim(),
        categoria: entradaRapida.categoria.trim(),
        subcategoria: entradaRapida.subcategoria.trim(),
        tipo,
        monto,
      });
      setEntradaRapida(nuevoMovimientoVacio());
      await cargar();
      setMensajeIngreso({ tipo: "exito", texto: "Movimiento guardado. Cartola y saldo actualizados." });
    } catch (err) {
      const detalle = err.response?.data?.detail;
      setMensajeIngreso({
        tipo: "error",
        texto:
          typeof detalle === "string"
            ? detalle
            : "No se pudo guardar el movimiento. Revise los datos y que el servidor esté encendido.",
      });
    } finally {
      setGuardandoRapido(false);
    }
  }

  async function manejarArchivoExcel(evento) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setImportandoExcel(true);
    setMensajeIngreso(null);
    try {
      const resultado = await importarExcel(archivo);
      await cargar();
      const duplicados = resultado.filas_duplicadas ?? 0;
      const otrasOmitidas = Math.max(
        0,
        (resultado.filas_omitidas ?? 0) - duplicados
      );
      setMensajeIngreso({
        tipo: "exito",
        texto: `Importación exitosa: se agregaron ${resultado.filas_insertadas ?? 0} movimientos nuevos y se omitieron ${duplicados} duplicados${
          otrasOmitidas ? `, además de ${otrasOmitidas} filas vacías o inválidas` : ""
        }.`,
      });
    } catch (err) {
      const detalle = err.response?.data?.detail;
      setMensajeIngreso({
        tipo: "error",
        texto:
          typeof detalle === "string"
            ? detalle
            : "No se pudo importar el archivo. Compruebe su formato y contenido.",
      });
    } finally {
      setImportandoExcel(false);
    }
  }

  async function manejarExportacionExcel() {
    setExportandoExcel(true);
    setMensajeIngreso(null);
    try {
      await exportarExcel();
      setMensajeIngreso({ tipo: "exito", texto: "La cartola se descargó en Excel." });
    } catch {
      setMensajeIngreso({
        tipo: "error",
        texto: "No se pudo exportar la cartola. Inténtelo nuevamente.",
      });
    } finally {
      setExportandoExcel(false);
    }
  }

  if (cargandoPlanCuentas) {
    return <div className="loading-mensaje" role="status">Cargando plan de cuentas...</div>;
  }
  if (errorPlanCuentas) {
    return (
      <main className="pagina">
        <p className="mensaje-error" role="alert"><CircleAlert aria-hidden="true" />{errorPlanCuentas}</p>
        <button type="button" className="boton-plan-secundario" onClick={() => {
          setCargandoPlanCuentas(true);
          setErrorPlanCuentas("");
          setIntentoPlan((actual) => actual + 1);
          void cargar();
        }}>Reintentar</button>
      </main>
    );
  }

  return (
    <main className="pagina">
      <section className="cuadro-saldo" aria-live="polite" aria-atomic="true">
        <p className="cuadro-saldo-etiqueta">
          {periodoActual === "Todos"
            ? "Saldo Actual"
            : etiquetaPeriodoActual
              ? `Saldo · ${etiquetaPeriodoActual}`
              : "Saldo Actual"}
        </p>
        <p className={`cuadro-saldo-valor${resumenPeriodo.saldoFinalPeriodo < 0 ? " saldo-negativo" : ""}`}>
          {formatearMoneda(resumenPeriodo.saldoFinalPeriodo)}
        </p>
      </section>

      {error ? (
        <p className="mensaje-error" role="alert">
          <CircleAlert size={28} aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <section className="seccion-cartola" aria-label="Libro banco">
        <div className="barra-herramientas-cartola">
          <div className="grupo-acciones-buscar">
            <button
              type="button"
              className="boton-mostrar-filtros"
              onClick={() => setMostrarFiltros((actual) => !actual)}
              aria-expanded={mostrarFiltros}
              aria-controls="panel-filtros-cartola"
            >
              <Search size={22} aria-hidden="true" />
              Buscar y Filtrar
            </button>
            <label className="selector-periodo">
              <span>Período</span>
              <select
                value={periodoActual}
                onChange={(evento) => {
                  const periodo = evento.target.value;
                  setPeriodoActual(periodo);
                  if (periodo !== "Todos") setEditandoSaldoInicial(false);
                }}
                aria-label="Seleccionar período de la cartola"
              >
                <option value="Todos">Todos los períodos</option>
                {periodosDisponibles.length === 0 ? (
                  <option value="" disabled>Sin períodos disponibles</option>
                ) : (
                  periodosDisponibles.map((periodo) => (
                    <option key={periodo.valor} value={periodo.valor}>
                      {periodo.etiqueta}
                    </option>
                  ))
                )}
              </select>
            </label>
            {hayFiltrosActivos && (
              <button
                type="button"
                onClick={restablecerFiltros}
                className="btn-limpiar-dinamico"
              >
                <XCircle size={18} aria-hidden="true" />
                Limpiar Filtros
              </button>
            )}
          </div>

          <div className="importar-excel">
            <input
              ref={archivoExcelRef}
              className="archivo-excel-oculto"
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={manejarArchivoExcel}
              aria-label="Seleccionar archivo Excel o CSV"
              hidden
            />
            <button
              type="button"
              className="boton-importar-excel"
              onClick={() => archivoExcelRef.current?.click()}
              disabled={
                importandoExcel || exportandoExcel || guardandoRapido || editandoId !== null
              }
            >
              <Upload size={22} aria-hidden="true" />
              {importandoExcel ? "Importando..." : "Importar Excel"}
            </button>
            <button
              type="button"
              className="boton-importar-excel"
              onClick={manejarExportacionExcel}
              disabled={
                exportandoExcel || importandoExcel || guardandoRapido || editandoId !== null
              }
            >
              <Download size={22} aria-hidden="true" />
              {exportandoExcel ? "Exportando..." : "Exportar"}
            </button>
          </div>
        </div>

        <div
          id="panel-filtros-cartola"
          className={`panel-filtros-animado ${mostrarFiltros ? 'abierto' : ''}`}
          aria-hidden={!mostrarFiltros}
        >
          <input
            type="text"
            placeholder="Buscar movimientos..."
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            className="input-busqueda-panel"
          />

          <div className="grupo-pildoras" role="group" aria-label="Filtrar por tipo de movimiento">
            {[
              { valor: "Todos", etiqueta: "Todos" },
              { valor: "Solo Ingresos", etiqueta: "Solo Ingresos" },
              { valor: "Solo Gastos", etiqueta: "Solo Gastos" },
            ].map((filtro) => (
              <button
                key={filtro.valor}
                type="button"
                className={filtroTipo === filtro.valor ? "activa" : ""}
                aria-pressed={filtroTipo === filtro.valor}
                onClick={() => setFiltroTipo(filtro.valor)}
              >
                {filtro.etiqueta}
              </button>
            ))}
          </div>

        </div>

        <form
          id="form-ingreso-rapido"
          className="formulario-ingreso-rapido"
          onSubmit={guardarMovimientoRapido}
        />

        {mensajeIngreso ? (
          <p
            className={mensajeIngreso.tipo === "error" ? "mensaje-error" : "mensaje-exito"}
            role={mensajeIngreso.tipo === "error" ? "alert" : "status"}
          >
            {mensajeIngreso.tipo === "error" ? (
              <CircleAlert size={24} aria-hidden="true" />
            ) : (
              <CircleCheck size={24} aria-hidden="true" />
            )}
            {mensajeIngreso.texto}
          </p>
        ) : null}

        {cargando ? (
          <p className="estado" role="status">Cargando movimientos…</p>
        ) : (
          <div ref={tablaRef} className="table-responsive tabla-envoltorio" tabIndex={0} role="region" aria-label="Tabla de movimientos, desplazable horizontal y verticalmente">
            <table className="tabla-cartola" aria-label="Movimientos del libro banco">
              <thead>
                <tr>
                  <th
                    scope="col"
                    aria-sort={sortConfig.key === "fecha" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div className="encabezado-controles">
                      <button type="button" className="encabezado-ordenamiento" onClick={() => handleSort("fecha")}>
                        Fecha {indicadorOrdenamiento("fecha")}
                      </button>
                      <button
                        type="button"
                        className={`boton-filtro-columna${filtroFecha !== "Todas" ? " filtro-columna-activo" : ""}`}
                        aria-label="Abrir filtro por fecha"
                        aria-haspopup="dialog"
                        aria-expanded={menuFiltroAbierto === "fecha"}
                        onClick={(evento) => toggleMenuFiltro("fecha", evento)}
                      >
                        <Filter size={14} aria-hidden="true" />
                      </button>
                    </div>
                    {menuFiltroAbierto === "fecha" ? (
                      <div
                        className="filtro-flotante-popover"
                        role="dialog"
                        aria-label="Filtro por fecha"
                        onClick={(evento) => evento.stopPropagation()}
                      >
                        <select
                          className="filtro-columna"
                          aria-label="Filtrar por fecha"
                          value={filtroFecha}
                          onChange={(evento) => {
                            setFiltroFecha(evento.target.value);
                            setMenuFiltroAbierto(null);
                          }}
                        >
                          <option value="Todas">Todas</option>
                          {fechasUnicas.map((fecha) => (
                            <option key={fecha} value={fecha}>{formatearFecha(fecha)}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="boton-cerrar-filtro"
                          onClick={() => setMenuFiltroAbierto(null)}
                        >
                          <X size={15} aria-hidden="true" />
                          Cerrar
                        </button>
                      </div>
                    ) : null}
                  </th>
                  <th
                    scope="col"
                    aria-sort={sortConfig.key === "sucursal" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div className="encabezado-controles">
                      <button type="button" className="encabezado-ordenamiento" onClick={() => handleSort("sucursal")}>
                        Sucursal {indicadorOrdenamiento("sucursal")}
                      </button>
                      <button
                        type="button"
                        className={`boton-filtro-columna${filtroSucursal !== "Todas" ? " filtro-columna-activo" : ""}`}
                        aria-label="Abrir filtro por sucursal"
                        aria-haspopup="dialog"
                        aria-expanded={menuFiltroAbierto === "sucursal"}
                        onClick={(evento) => toggleMenuFiltro("sucursal", evento)}
                      >
                        <Filter size={14} aria-hidden="true" />
                      </button>
                    </div>
                    {menuFiltroAbierto === "sucursal" ? (
                      <div
                        className="filtro-flotante-popover"
                        role="dialog"
                        aria-label="Filtro por sucursal"
                        onClick={(evento) => evento.stopPropagation()}
                      >
                        <select
                          className="filtro-columna"
                          aria-label="Filtrar por sucursal"
                          value={filtroSucursal}
                          onChange={(evento) => {
                            setFiltroSucursal(evento.target.value);
                            setMenuFiltroAbierto(null);
                          }}
                        >
                          <option value="Todas">Todas</option>
                          {sucursalesUnicas.map((sucursal) => (
                            <option key={sucursal} value={sucursal}>{sucursal}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="boton-cerrar-filtro"
                          onClick={() => setMenuFiltroAbierto(null)}
                        >
                          <X size={15} aria-hidden="true" />
                          Cerrar
                        </button>
                      </div>
                    ) : null}
                  </th>
                  <th scope="col" aria-sort={sortConfig.key === "descripcion" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" className="encabezado-ordenamiento" onClick={() => handleSort("descripcion")}>
                      Descripción {indicadorOrdenamiento("descripcion")}
                    </button>
                  </th>
                  <th scope="col">Centro de Costo</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Subcategoría</th>
                  <th scope="col" aria-sort={sortConfig.key === "cargo" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" className="encabezado-ordenamiento" onClick={() => handleSort("cargo")}>
                      Cheques y otros cargos {indicadorOrdenamiento("cargo")}
                    </button>
                  </th>
                  <th scope="col" aria-sort={sortConfig.key === "abono" ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" className="encabezado-ordenamiento" onClick={() => handleSort("abono")}>
                      Depósitos y abonos {indicadorOrdenamiento("abono")}
                    </button>
                  </th>
                  <th scope="col">Saldo Diario</th>
                  <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr className="fila-ingreso-destacada">
                <td>
                  <input
                    form="form-ingreso-rapido"
                    type="date"
                    aria-label="Fecha del movimiento"
                    value={entradaRapida.fecha}
                    onChange={(evento) => actualizarEntradaRapida("fecha", evento.target.value)}
                    required
                  />
                </td>
                <td>
                  <input
                    form="form-ingreso-rapido"
                    type="text"
                    aria-label="Sucursal"
                    placeholder="Ej: Centro"
                    value={entradaRapida.sucursal}
                    onChange={(evento) => actualizarEntradaRapida("sucursal", evento.target.value)}
                    required
                  />
                </td>
                <td>
                  <input
                    form="form-ingreso-rapido"
                    type="text"
                    aria-label="Descripción"
                    placeholder="Ej: Pago luz"
                    value={entradaRapida.descripcion}
                    onChange={(evento) => actualizarEntradaRapida("descripcion", evento.target.value)}
                    required
                  />
                </td>
                <td>
                  <input
                    form="form-ingreso-rapido"
                    type="text"
                    aria-label="Centro de costo"
                    placeholder="Centro de costo"
                    value={entradaRapida.centro_costo}
                    onChange={(evento) =>
                      actualizarEntradaRapida("centro_costo", evento.target.value)
                    }
                  />
                </td>
                <td>
                  <select
                    form="form-ingreso-rapido"
                    aria-label="Categoría"
                    value={entradaRapida.categoria}
                    onChange={(evento) => actualizarEntradaRapida("categoria", evento.target.value)}
                    required
                  >
                    {Object.entries(planCuentas).map(([grupo, categorias]) => (
                      <optgroup key={grupo} label={grupo}>
                        {Object.keys(categorias).map((categoria) => (
                          <option key={categoria} value={categoria}>{categoria}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    form="form-ingreso-rapido"
                    aria-label="Subcategoría"
                    value={entradaRapida.subcategoria}
                    onChange={(evento) => actualizarEntradaRapida("subcategoria", evento.target.value)}
                    required
                  >
                    {(categoriasPlan[entradaRapida.categoria] ?? []).map((subcategoria) => (
                      <option key={subcategoria} value={subcategoria}>{subcategoria}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    form="form-ingreso-rapido"
                    className="entrada-monto entrada-cargo"
                    type="text"
                    inputMode="numeric"
                    aria-label="Monto del cargo"
                    placeholder="$ Cargo"
                    value={entradaRapida.cargo}
                    onChange={(evento) =>
                      actualizarEntradaRapida("cargo", formatearMontoEntrada(evento.target.value))
                    }
                    disabled={Boolean(entradaRapida.abono)}
                  />
                </td>
                <td>
                  <input
                    form="form-ingreso-rapido"
                    className="entrada-monto entrada-abono"
                    type="text"
                    inputMode="numeric"
                    aria-label="Monto del abono"
                    placeholder="$ Abono"
                    value={entradaRapida.abono}
                    onChange={(evento) =>
                      actualizarEntradaRapida("abono", formatearMontoEntrada(evento.target.value))
                    }
                    disabled={Boolean(entradaRapida.cargo)}
                  />
                </td>
                <td className="col-saldo saldo-pendiente" aria-label="Saldo calculado al guardar">
                  —
                </td>
                <td className="col-accion">
                  <button
                    form="form-ingreso-rapido"
                    type="submit"
                    className="boton-guardar-rapido"
                    disabled={guardandoRapido || importandoExcel || editandoId !== null}
                  >
                    <Plus size={20} aria-hidden="true" />
                    {guardandoRapido ? "Guardando…" : "Guardar"}
                  </button>
                </td>
              </tr>

              {lineasOrdenadas.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="tabla-vacia">
                      {lineasDelPeriodo.length === 0
                        ? periodoActual
                          ? "No hay movimientos en este período."
                          : "Aún no hay movimientos. El saldo es el inicial."
                        : "No hay movimientos que coincidan con la búsqueda."}
                    </td>
                  </tr>
                ) : (
                  lineasOrdenadas.map((linea) => {
                    const esCargo = linea.tipo === "CARGO";
                    const esAbono = linea.tipo === "ABONO";
                    const estaEditando = linea.id === editandoId;
                    return (
                      <tr key={linea.id} className={estaEditando ? "fila-en-edicion" : ""}>
                        {estaEditando && formularioEdicion ? (
                          <>
                            <td>
                              <input
                                className="entrada-edicion"
                                type="date"
                                aria-label="Fecha del movimiento"
                                value={formularioEdicion.fecha}
                                onChange={(evento) => actualizarCampoEdicion("fecha", evento.target.value)}
                                disabled={guardandoEdicion}
                              />
                            </td>
                            <td>
                              <input
                                className="entrada-edicion"
                                type="text"
                                aria-label="Sucursal"
                                value={formularioEdicion.sucursal}
                                onChange={(evento) => actualizarCampoEdicion("sucursal", evento.target.value)}
                                disabled={guardandoEdicion}
                              />
                            </td>
                            <td>
                              <input
                                className="entrada-edicion"
                                type="text"
                                aria-label="Descripción"
                                value={formularioEdicion.descripcion}
                                onChange={(evento) => actualizarCampoEdicion("descripcion", evento.target.value)}
                                disabled={guardandoEdicion}
                              />
                            </td>
                            <td>
                              <input
                                className="entrada-edicion"
                                type="text"
                                aria-label="Centro de costo"
                                value={formularioEdicion.centro_costo}
                                onChange={(evento) =>
                                  actualizarCampoEdicion("centro_costo", evento.target.value)
                                }
                                disabled={guardandoEdicion}
                              />
                            </td>
                            <td>
                              <select
                                className="entrada-edicion"
                                aria-label="Categoría"
                                value={formularioEdicion.categoria}
                                onChange={(evento) =>
                                  actualizarCampoEdicion("categoria", evento.target.value)
                                }
                                disabled={guardandoEdicion}
                              >
                                {Object.entries(planCuentas).map(([grupo, categorias]) => (
                                  <optgroup key={grupo} label={grupo}>
                                    {Object.keys(categorias).map((categoria) => (
                                      <option key={categoria} value={categoria}>{categoria}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                className="entrada-edicion"
                                aria-label="Subcategoría"
                                value={formularioEdicion.subcategoria}
                                onChange={(evento) =>
                                  actualizarCampoEdicion("subcategoria", evento.target.value)
                                }
                                disabled={guardandoEdicion}
                              >
                                {(categoriasPlan[formularioEdicion.categoria] ?? []).map((subcategoria) => (
                                  <option key={subcategoria} value={subcategoria}>{subcategoria}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                className="entrada-edicion entrada-monto-edicion entrada-cargo-edicion"
                                type="text"
                                inputMode="numeric"
                                aria-label="Monto del cargo"
                                placeholder="$ Cargo"
                                value={formularioEdicion.cargo}
                                onChange={(evento) => actualizarCampoEdicion("cargo", evento.target.value)}
                                disabled={Boolean(formularioEdicion.abono) || guardandoEdicion}
                              />
                            </td>
                            <td>
                              <input
                                className="entrada-edicion entrada-monto-edicion entrada-abono-edicion"
                                type="text"
                                inputMode="numeric"
                                aria-label="Monto del abono"
                                placeholder="$ Abono"
                                value={formularioEdicion.abono}
                                onChange={(evento) => actualizarCampoEdicion("abono", evento.target.value)}
                                disabled={Boolean(formularioEdicion.cargo) || guardandoEdicion}
                              />
                            </td>
                            <td className={`col-monto col-saldo${saldoCronologiaAlterada ? " saldo-cronologia-alterada" : ""}${linea.saldo_resultante < 0 ? " saldo-negativo" : ""}`}>
                              {formatearMoneda(linea.saldo_resultante)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="celda-secundaria">{formatearFecha(linea.fecha)}</td>
                            <td className="celda-secundaria">{linea.sucursal}</td>
                            <td>{linea.descripcion}</td>
                            <td>{linea.centro_costo}</td>
                            <td>{linea.categoria}</td>
                            <td>{linea.subcategoria}</td>
                            <td className={`col-monto ${esCargo ? "col-cargo" : ""}`}>
                              {esCargo ? formatearMoneda(linea.monto) : ""}
                            </td>
                            <td className={`col-monto ${esAbono ? "col-abono" : ""}`}>
                              {esAbono ? formatearMoneda(linea.monto) : ""}
                            </td>
                            <td className={`col-monto col-saldo${saldoCronologiaAlterada ? " saldo-cronologia-alterada" : ""}${linea.saldo_resultante < 0 ? " saldo-negativo" : ""}`}>
                              {formatearMoneda(linea.saldo_resultante)}
                            </td>
                          </>
                        )}
                        <td className="col-accion">
                          {estaEditando ? (
                            <div className="acciones-fila">
                              <button
                                type="button"
                                className="boton-edicion boton-confirmar-edicion"
                                onClick={() => guardarEdicion(linea.id)}
                                disabled={guardandoEdicion}
                                aria-label={guardandoEdicion ? "Guardando cambios" : "Guardar cambios"}
                                title="Guardar cambios"
                              >
                                <Check size={24} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="boton-edicion boton-cancelar-edicion"
                                onClick={cancelarEdicion}
                                disabled={guardandoEdicion}
                                aria-label="Cancelar edición"
                                title="Cancelar edición"
                              >
                                <X size={24} aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <div className="acciones-fila">
                              <button
                                type="button"
                                className="boton-edicion boton-iniciar-edicion"
                                onClick={() => iniciarEdicion(linea)}
                                disabled={editandoId !== null || eliminandoId !== null}
                                aria-label={`Editar ${linea.descripcion}`}
                                title="Editar movimiento"
                              >
                                <Pencil size={22} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="boton-eliminar"
                                onClick={() => confirmarEliminacion(linea.id)}
                                disabled={
                                  eliminandoId === linea.id ||
                                  editandoId !== null ||
                                  guardandoEdicion
                                }
                                aria-label={`Eliminar ${linea.descripcion}`}
                                title="Eliminar movimiento"
                              >
                                <Trash2 size={24} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {cartola && !cargando ? (
          <div className="resumen-saldos">
            <div className="saldo-base-cuenta">
              <span className="saldo-base-etiqueta">Saldo inicial del período</span>
              {editandoSaldoInicial && periodoActual === "Todos" ? (
                <div className="saldo-base-edicion">
                  <label className="sr-only" htmlFor="saldo-inicial-cuenta">
                    Nuevo saldo inicial de la cuenta
                  </label>
                  <input
                    id="saldo-inicial-cuenta"
                    className={`entrada-edicion entrada-saldo-base${nuevoSaldoInicial < 0 ? " saldo-negativo" : ""}`}
                    type="number"
                    step="1"
                    inputMode="numeric"
                    value={nuevoSaldoInicial}
                    onChange={(evento) =>
                      setNuevoSaldoInicial(evento.target.value === "" ? "" : Number(evento.target.value))
                    }
                    disabled={guardandoSaldoInicial}
                    onKeyDown={(evento) => {
                      if (evento.key === "Enter") void guardarSaldoInicial();
                      if (evento.key === "Escape") cancelarEdicionSaldoInicial();
                    }}
                  />
                  <div className="acciones-fila">
                    <button
                      type="button"
                      className="boton-edicion boton-confirmar-edicion"
                      onClick={guardarSaldoInicial}
                      disabled={guardandoSaldoInicial}
                      aria-label={guardandoSaldoInicial ? "Guardando saldo inicial" : "Guardar saldo inicial"}
                      title="Guardar saldo inicial"
                    >
                      <Check size={24} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="boton-edicion boton-cancelar-edicion"
                      onClick={cancelarEdicionSaldoInicial}
                      disabled={guardandoSaldoInicial}
                      aria-label="Cancelar edición del saldo inicial"
                      title="Cancelar"
                    >
                      <X size={24} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="saldo-base-valor">
                  <strong className={resumenPeriodo.saldoInicialPeriodo < 0 ? "saldo-negativo" : undefined}>{formatearMoneda(resumenPeriodo.saldoInicialPeriodo)}</strong>
                  {periodoActual === "Todos" ? (
                    <button
                      type="button"
                      className="boton-editar-saldo-base"
                      onClick={iniciarEdicionSaldoInicial}
                      aria-label="Editar saldo inicial de la cuenta"
                    >
                      <Pencil size={18} aria-hidden="true" />
                      Editar base
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            <p className="saldo-final">
              Saldo final del período: <strong className={resumenPeriodo.saldoFinalPeriodo < 0 ? "saldo-negativo" : undefined}>{formatearMoneda(resumenPeriodo.saldoFinalPeriodo)}</strong>
            </p>
          </div>
        ) : null}
      </section>

    </main>
  );
}

export default Inicio;
