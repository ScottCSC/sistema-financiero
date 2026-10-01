import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Plus, Save } from "lucide-react";
import { actualizarConfiguracion, getConfiguracion } from "../api.js";
import {
  categoriasDelPlan,
  CLAVE_PLAN_CUENTAS,
  normalizarNombreCuenta,
  validarPlanCuentas,
} from "../utils/planCuentas.js";

function Configuracion() {
  const [planCuentas, setPlanCuentas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [intentoCarga, setIntentoCarga] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [hayCambios, setHayCambios] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [nuevasCategorias, setNuevasCategorias] = useState({});
  const [nuevasSubcategorias, setNuevasSubcategorias] = useState({});
  const [subcategoriaAbierta, setSubcategoriaAbierta] = useState(null);
  const [grupoNuevaCategoria, setGrupoNuevaCategoria] = useState(null);

  useEffect(() => {
    let activo = true;
    async function cargarPlan() {
      try {
        const plan = validarPlanCuentas(await getConfiguracion(CLAVE_PLAN_CUENTAS));
        if (activo) setPlanCuentas(plan);
      } catch (error) {
        if (activo) {
          const detalle = error.response?.data?.detail;
          setErrorCarga(typeof detalle === "string" ? detalle :
            "No se pudo cargar el plan de cuentas. Compruebe que el servidor esté encendido.");
        }
      } finally {
        if (activo) setCargando(false);
      }
    }
    void cargarPlan();
    return () => { activo = false; };
  }, [intentoCarga]);

  function reintentarCarga() {
    setCargando(true);
    setErrorCarga("");
    setIntentoCarga((actual) => actual + 1);
  }

  function agregarCategoria(evento, grupo) {
    evento.preventDefault();
    if (guardando) return;
    const nombre = (nuevasCategorias[grupo] ?? "").trim().replace(/\s+/g, " ");
    if (!nombre || nombre.length > 100) {
      setMensaje({ tipo: "error", texto: "Escriba un nombre de categoría de hasta 100 caracteres." });
      return;
    }
    const repetida = Object.keys(categoriasDelPlan(planCuentas)).some(
      (categoria) => normalizarNombreCuenta(categoria) === normalizarNombreCuenta(nombre)
    );
    if (repetida) {
      setMensaje({ tipo: "error", texto: `La categoría «${nombre}» ya existe en el plan de cuentas.` });
      return;
    }
    setPlanCuentas((actual) => ({
      ...actual,
      [grupo]: { ...actual[grupo], [nombre]: ["Sin subcategoría"] },
    }));
    setNuevasCategorias((actual) => ({ ...actual, [grupo]: "" }));
    setGrupoNuevaCategoria(null);
    setHayCambios(true);
    setMensaje(null);
  }

  function agregarSubcategoria(evento, grupo, categoria) {
    evento.preventDefault();
    if (guardando) return;
    const clave = JSON.stringify([grupo, categoria]);
    const nombre = (nuevasSubcategorias[clave] ?? "").trim().replace(/\s+/g, " ");
    if (!nombre || nombre.length > 100) {
      setMensaje({ tipo: "error", texto: "Escriba un nombre de subcategoría de hasta 100 caracteres." });
      return;
    }
    if (planCuentas[grupo][categoria].some(
      (subcategoria) => normalizarNombreCuenta(subcategoria) === normalizarNombreCuenta(nombre)
    )) {
      setMensaje({ tipo: "error", texto: `La subcategoría «${nombre}» ya existe en «${categoria}».` });
      return;
    }
    setPlanCuentas((actual) => ({
      ...actual,
      [grupo]: { ...actual[grupo], [categoria]: [...actual[grupo][categoria], nombre] },
    }));
    setNuevasSubcategorias((actual) => ({ ...actual, [clave]: "" }));
    setSubcategoriaAbierta(null);
    setHayCambios(true);
    setMensaje(null);
  }

  async function guardarCambios() {
    if (!hayCambios || guardando) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const guardado = await actualizarConfiguracion(CLAVE_PLAN_CUENTAS, planCuentas);
      setPlanCuentas(validarPlanCuentas(guardado));
      setHayCambios(false);
      setMensaje({ tipo: "exito", texto: "Plan de cuentas guardado. Las nuevas opciones están disponibles en el Libro Banco." });
    } catch (error) {
      const detalle = error.response?.data?.detail;
      setMensaje({ tipo: "error", texto: typeof detalle === "string" ? detalle :
        "No se pudieron guardar los cambios. Sus cambios siguen aquí; inténtelo nuevamente." });
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <div className="loading-mensaje" role="status">Cargando plan de cuentas...</div>;
  }
  if (errorCarga) {
    return (
      <main className="pagina pagina-configuracion">
        <p className="mensaje-error" role="alert"><CircleAlert aria-hidden="true" />{errorCarga}</p>
        <button type="button" className="boton-plan-secundario" onClick={reintentarCarga}>Reintentar</button>
      </main>
    );
  }

  return (
    <main className="pagina pagina-configuracion" aria-busy={guardando}>
      <header className="configuracion-cabecera">
        <div>
          <p className="flujo-eyebrow">Ajustes</p>
          <h1>Plan de cuentas</h1>
          <p>Agregue categorías y subcategorías. Luego presione Guardar Cambios.</p>
        </div>
        <div className="configuracion-guardar">
          {hayCambios && <span className="cambios-pendientes">Cambios pendientes</span>}
          <button type="button" className="boton-plan-principal" disabled={!hayCambios || guardando} onClick={guardarCambios}>
            <Save size={22} aria-hidden="true" />
            {guardando ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </header>

      {mensaje && (
        <p className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-exito"} role={mensaje.tipo === "error" ? "alert" : "status"}>
          {mensaje.tipo === "error" ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
          {mensaje.texto}
        </p>
      )}

      <div className="grupos-plan">
        {Object.entries(planCuentas).map(([grupo, categorias], indiceGrupo) => (
          <section className="grupo-plan" data-grupo={grupo} key={grupo} aria-labelledby={`grupo-plan-${indiceGrupo}`}>
            <header className="grupo-plan-cabecera">
              <h2 id={`grupo-plan-${indiceGrupo}`}>{grupo}</h2>
              <span>{Object.keys(categorias).length} categorías</span>
            </header>
            {Object.entries(categorias).map(([categoria, subcategorias], indiceCategoria) => {
              const clave = JSON.stringify([grupo, categoria]);
              const inputId = `subcategoria-${indiceGrupo}-${indiceCategoria}`;
              return (
                <article className="categoria-plan" key={categoria}>
                  <div className="categoria-plan-cabecera">
                    <h3>{categoria}</h3>
                    <button type="button" className="boton-plan-texto" disabled={guardando}
                      aria-expanded={subcategoriaAbierta === clave} aria-controls={`form-${inputId}`}
                      onClick={() => setSubcategoriaAbierta((actual) => actual === clave ? null : clave)}>
                      <Plus size={16} aria-hidden="true" />Subcategoría
                      <span className="sr-only"> en {categoria}</span>
                    </button>
                  </div>
                  <ul className="subcategorias-plan">
                    {subcategorias.map((nombre) => <li key={nombre}>{nombre}</li>)}
                  </ul>
                  {subcategoriaAbierta === clave && <form id={`form-${inputId}`} className="form-agregar-plan" onSubmit={(evento) => agregarSubcategoria(evento, grupo, categoria)}>
                    <label className="campo-plan" htmlFor={inputId}>
                      Nueva subcategoría
                      <input id={inputId} type="text" maxLength={100} required autoFocus placeholder="Ej: Mantenimiento" disabled={guardando}
                        value={nuevasSubcategorias[clave] ?? ""}
                        onChange={(evento) => setNuevasSubcategorias((actual) => ({ ...actual, [clave]: evento.target.value }))} />
                    </label>
                    <button type="submit" className="boton-plan-secundario" disabled={guardando}>
                      <Plus size={20} aria-hidden="true" />Agregar
                    </button>
                    <button type="button" className="boton-plan-texto" disabled={guardando} onClick={() => setSubcategoriaAbierta(null)}>Cancelar</button>
                  </form>}
                </article>
              );
            })}
            <div className="nueva-categoria-plan">
            <button type="button" className="boton-plan-texto" disabled={guardando}
              aria-expanded={grupoNuevaCategoria === grupo} aria-controls={`form-categoria-${indiceGrupo}`}
              onClick={() => setGrupoNuevaCategoria((actual) => actual === grupo ? null : grupo)}>
              <Plus size={16} aria-hidden="true" />Nueva Categoría
              <span className="sr-only"> en {grupo}</span>
            </button>
            {grupoNuevaCategoria === grupo && <form id={`form-categoria-${indiceGrupo}`} className="form-agregar-plan form-nueva-categoria" onSubmit={(evento) => agregarCategoria(evento, grupo)}>
              <label className="campo-plan" htmlFor={`categoria-${indiceGrupo}`}>
                Nueva categoría en {grupo}
                <input id={`categoria-${indiceGrupo}`} type="text" maxLength={100} required autoFocus placeholder="Nombre de la categoría" disabled={guardando}
                  value={nuevasCategorias[grupo] ?? ""}
                  onChange={(evento) => setNuevasCategorias((actual) => ({ ...actual, [grupo]: evento.target.value }))} />
              </label>
              <button type="submit" className="boton-plan-secundario" disabled={guardando}>
                <Plus size={20} aria-hidden="true" />Agregar categoría
              </button>
              <button type="button" className="boton-plan-texto" disabled={guardando} onClick={() => setGrupoNuevaCategoria(null)}>Cancelar</button>
            </form>}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

export default Configuracion;
