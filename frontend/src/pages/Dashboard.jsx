import { useEffect, useMemo, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CUENTA_ID, getCartola } from "../api.js";
import { crearResumenDashboard } from "../utils/dashboard.js";
import { formatearMoneda } from "../utils/formato.js";

const COLORES_EGRESOS = [
  "#b91c1c", "#ef4444", "#e11d48", "#7f1d1d",
  "#dc2626", "#9f1239", "#991b1b", "#be123c",
];
const FORMATO_PORCENTAJE = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 1,
});
const FORMATO_EJE = new Intl.NumberFormat("es-CL", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatearEje(valor) {
  return `$ ${FORMATO_EJE.format(Number(valor) || 0)}`;
}

function formatearTooltipDonut(valor, nombre, entrada) {
  const porcentaje = FORMATO_PORCENTAJE.format(entrada?.payload?.porcentaje ?? 0);
  return [`${formatearMoneda(valor)} (${porcentaje}%)`, nombre];
}

function Dashboard() {
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let activo = true;

    async function cargarDatos() {
      setCargando(true);
      setError(null);
      try {
        const cartola = await getCartola(CUENTA_ID);
        if (!Array.isArray(cartola?.lineas)) {
          throw new Error("El servidor no devolvió una lista de movimientos válida.");
        }
        if (activo) setMovimientos(cartola.lineas);
      } catch (errorCarga) {
        if (!activo) return;
        const detalle = errorCarga.response?.data?.detail;
        setError(
          typeof detalle === "string"
            ? detalle
            : "No se pudo cargar el Dashboard. Compruebe la conexión e intente nuevamente."
        );
      } finally {
        if (activo) setCargando(false);
      }
    }

    void cargarDatos();
    return () => {
      activo = false;
    };
  }, [version]);

  const resumen = useMemo(() => crearResumenDashboard(movimientos), [movimientos]);

  const actualizar = () => setVersion((anterior) => anterior + 1);

  return (
    <main className="pagina dashboard-pagina">
      <header className="dashboard-cabecera">
        <div>
          <p className="dashboard-eyebrow">Dashboard</p>
          <h1>Resumen financiero</h1>
          <p>{resumen.mesActual.etiqueta} · Datos del Libro Banco</p>
        </div>
        <button
          type="button"
          className="dashboard-actualizar"
          onClick={actualizar}
          disabled={cargando}
          aria-label="Actualizar los datos del Dashboard"
        >
          <RefreshCw size={18} aria-hidden="true" />
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </header>

      {cargando ? (
        <div className="dashboard-cargando" role="status">
          Cargando resumen financiero...
        </div>
      ) : error ? (
        <div className="dashboard-error" role="alert">
          <CircleAlert size={22} aria-hidden="true" />
          <p>{error}</p>
          <button type="button" className="dashboard-actualizar" onClick={actualizar}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {!resumen.hayMovimientos && (
            <p className="dashboard-vacio" role="status">
              Todavía no hay movimientos registrados. Ingrese o importe su cartola en el Libro Banco para ver sus gráficos.
            </p>
          )}

          <section className="dashboard-kpis" aria-labelledby="dashboard-resumen">
            <h2 id="dashboard-resumen" className="sr-only">Resumen del mes actual</h2>
            <article className="dashboard-kpi">
              <h3 className="dashboard-kpi-titulo">Ingresos del Mes</h3>
              <p className="dashboard-kpi-valor importe-abono">
                {formatearMoneda(resumen.ingresosMes)}
              </p>
              <p className="dashboard-kpi-detalle">Dinero recibido en {resumen.mesActual.etiqueta}</p>
            </article>
            <article className="dashboard-kpi">
              <h3 className="dashboard-kpi-titulo">Egresos del Mes</h3>
              <p className="dashboard-kpi-valor importe-cargo">
                {formatearMoneda(resumen.egresosMes)}
              </p>
              <p className="dashboard-kpi-detalle">Dinero pagado en {resumen.mesActual.etiqueta}</p>
            </article>
            <article className="dashboard-kpi">
              <h3 className="dashboard-kpi-titulo">Flujo Neto</h3>
              <p className={`dashboard-kpi-valor${resumen.flujoNeto < 0 ? " importe-cargo" : ""}`}>
                {formatearMoneda(resumen.flujoNeto)}
              </p>
              <p className="dashboard-kpi-detalle">Ingresos menos egresos del mes</p>
            </article>
          </section>

          <section className="dashboard-graficos" aria-label="Gráficos financieros">
            <article className="dashboard-tarjeta" aria-labelledby="dashboard-egresos-titulo">
              <header className="dashboard-tarjeta-cabecera">
                <h2 id="dashboard-egresos-titulo">Egresos por categoría</h2>
                <p>{resumen.mesActual.etiqueta}</p>
              </header>

              {resumen.egresosPorCategoria.length > 0 ? (
                <>
                  <div
                    className="dashboard-grafico"
                    style={{ height: 320, minWidth: 0 }}
                    aria-describedby="dashboard-egresos-leyenda"
                  >
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <PieChart accessibilityLayer>
                        <Pie
                          data={resumen.egresosPorCategoria}
                          dataKey="monto"
                          nameKey="categoria"
                          cx="50%"
                          cy="50%"
                          innerRadius="57%"
                          outerRadius="82%"
                          paddingAngle={2}
                          isAnimationActive={false}
                          stroke="#ffffff"
                          strokeWidth={2}
                        >
                          {resumen.egresosPorCategoria.map((entrada, indice) => (
                            <Cell
                              key={entrada.categoria}
                              fill={COLORES_EGRESOS[indice % COLORES_EGRESOS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={formatearTooltipDonut} />
                        <text x="50%" y="47%" textAnchor="middle" fill="#374151" fontSize={28} fontWeight={600}>
                          100%
                        </text>
                        <text x="50%" y="56%" textAnchor="middle" fill="#64748b" fontSize={14}>
                          Egresos del mes
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="dashboard-donut-leyenda" id="dashboard-egresos-leyenda">
                    {resumen.egresosPorCategoria.map((entrada, indice) => (
                      <li key={entrada.categoria}>
                        <span className="dashboard-leyenda-categoria">
                          <span
                            className="dashboard-leyenda-color"
                            style={{ backgroundColor: COLORES_EGRESOS[indice % COLORES_EGRESOS.length] }}
                            aria-hidden="true"
                          />
                          {entrada.categoria}
                        </span>
                        <span className="dashboard-leyenda-valor importe-cargo">
                          {formatearMoneda(entrada.monto)}
                        </span>
                        <span className="dashboard-leyenda-porcentaje">
                          {FORMATO_PORCENTAJE.format(entrada.porcentaje)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="dashboard-vacio">
                  No hay egresos registrados en {resumen.mesActual.etiqueta}.
                </div>
              )}
            </article>

            <article className="dashboard-tarjeta" aria-labelledby="dashboard-historico-titulo">
              <header className="dashboard-tarjeta-cabecera">
                <h2 id="dashboard-historico-titulo">Ingresos y egresos</h2>
                <p>Últimos 6 meses, incluido el mes actual</p>
              </header>

              {resumen.hayHistorico ? (
                <div
                  className="dashboard-grafico"
                  style={{ height: 320, minWidth: 0 }}
                  aria-describedby="dashboard-historico-detalle"
                >
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={resumen.historico} accessibilityLayer margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 14 }} interval={0} />
                      <YAxis tickFormatter={formatearEje} tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} width={82} />
                      <Tooltip
                        formatter={(valor, nombre) => [formatearMoneda(valor), nombre]}
                        labelFormatter={(etiqueta, entradas) => entradas?.[0]?.payload?.etiqueta ?? etiqueta}
                        cursor={{ fill: "#f3f4f6" }}
                      />
                      <Legend iconType="circle" />
                      <Bar dataKey="ingresos" name="Ingresos" fill="#15803d" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                      <Bar dataKey="egresos" name="Egresos" fill="#b91c1c" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="dashboard-vacio">
                  No hay movimientos registrados en los últimos 6 meses.
                </div>
              )}

              <details className="dashboard-detalle" id="dashboard-historico-detalle">
                <summary>Ver los montos por mes</summary>
                <div className="table-responsive">
                  <table className="dashboard-tabla-detalle">
                    <caption className="sr-only">Ingresos, egresos y flujo neto de los últimos 6 meses</caption>
                    <thead>
                      <tr>
                        <th scope="col">Mes</th>
                        <th scope="col">Ingresos</th>
                        <th scope="col">Egresos</th>
                        <th scope="col">Flujo Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.historico.map((periodo) => (
                        <tr key={periodo.clave}>
                          <th scope="row">{periodo.etiqueta}</th>
                          <td className="importe-abono">{formatearMoneda(periodo.ingresos)}</td>
                          <td className="importe-cargo">{formatearMoneda(periodo.egresos)}</td>
                          <td className={periodo.ingresos - periodo.egresos < 0 ? "importe-cargo" : undefined}>
                            {formatearMoneda(periodo.ingresos - periodo.egresos)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </article>
          </section>
        </>
      )}
    </main>
  );
}

export default Dashboard;
