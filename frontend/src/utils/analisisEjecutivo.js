import { formatearMoneda } from "./formato.js";

const FORMATO_PORCENTAJE = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 1,
});

function numeroSeguro(valor, respaldo = 0) {
  if (typeof valor !== "number" && typeof valor !== "string") return respaldo;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : respaldo;
}

function porcentajeLegible(valor) {
  const porcentaje = Math.abs(numeroSeguro(valor));
  return porcentaje > 0 && porcentaje < 0.1
    ? "menos del 0,1%"
    : `${FORMATO_PORCENTAJE.format(porcentaje)}%`;
}

function crearComparacion(flujoActual, periodoAnterior) {
  const ingresosAnteriores = numeroSeguro(periodoAnterior?.ingresos);
  const egresosAnteriores = numeroSeguro(periodoAnterior?.egresos);
  const flujoAnterior = numeroSeguro(ingresosAnteriores - egresosAnteriores);
  const diferencia = numeroSeguro(flujoActual - flujoAnterior);

  if (ingresosAnteriores === 0 && egresosAnteriores === 0) {
    return {
      id: "comparacion-mensual",
      titulo: "Sin referencia del mes anterior",
      texto: "No hay ingresos ni egresos registrados en el mes anterior. Se necesita esa información para comparar ambos meses.",
      tono: "neutral",
    };
  }

  if (diferencia === 0) {
    return {
      id: "comparacion-mensual",
      titulo: "Flujo neto sin variación",
      texto: `El flujo neto se mantiene en ${formatearMoneda(flujoActual)}, igual que el mes anterior.`,
      tono: "neutral",
    };
  }

  const mejora = diferencia > 0;

  if (flujoAnterior > 0) {
    const porcentaje = (Math.abs(diferencia) / flujoAnterior) * 100;
    if (Number.isFinite(porcentaje)) {
      const variacion = porcentaje > 0 && porcentaje < 0.1
        ? porcentajeLegible(porcentaje)
        : `un ${porcentajeLegible(porcentaje)}`;
      return {
        id: "comparacion-mensual",
        titulo: mejora ? "El flujo neto ha crecido" : "El flujo neto ha caído",
        texto: `Su flujo neto mensual ha ${mejora ? "crecido" : "caído"} ${variacion} respecto al mes anterior: pasó de ${formatearMoneda(flujoAnterior)} a ${formatearMoneda(flujoActual)}.`,
        tono: mejora ? "positivo" : "negativo",
      };
    }
  }

  const sigueNegativo = flujoAnterior < 0 && flujoActual < 0;
  return {
    id: "comparacion-mensual",
    titulo: mejora ? "Mejora del flujo neto" : "Deterioro del flujo neto",
    texto: `Su flujo neto ${mejora ? "mejoró" : "empeoró"} en ${formatearMoneda(Math.abs(diferencia))} respecto al mes anterior: pasó de ${formatearMoneda(flujoAnterior)} a ${formatearMoneda(flujoActual)}.${sigueNegativo ? " Aún es negativo." : ""}${flujoAnterior === 0 ? " No se calcula un porcentaje porque el flujo anterior fue cero." : ""}`,
    tono: mejora ? "positivo" : "negativo",
  };
}

// Reutiliza el resumen del Dashboard; describe datos registrados sin generar recomendaciones.
export function crearAnalisisEjecutivo(resumen) {
  const datos = resumen ?? {};
  const ingresos = numeroSeguro(datos.ingresosMes);
  const egresos = numeroSeguro(datos.egresosMes);
  const flujoNeto = numeroSeguro(datos.flujoNeto, numeroSeguro(ingresos - egresos));
  const mes = datos.mesActual?.etiqueta || "el mes actual";

  if (ingresos === 0 && egresos === 0) {
    return [{
      id: "sin-actividad",
      titulo: "Sin movimientos del mes",
      texto: `No hay ingresos ni egresos registrados en ${mes}. El análisis se actualizará cuando registre movimientos de este período.`,
      tono: "neutral",
    }];
  }

  const entradas = [];
  const mayorCategoria = Array.isArray(datos.egresosPorCategoria)
    ? datos.egresosPorCategoria[0]
    : null;
  const montoCategoria = numeroSeguro(mayorCategoria?.monto);

  if (egresos > 0 && mayorCategoria && montoCategoria > 0) {
    const categoria = typeof mayorCategoria.categoria === "string"
      ? mayorCategoria.categoria.trim() || "Sin clasificar"
      : "Sin clasificar";
    const porcentaje = porcentajeLegible((montoCategoria / egresos) * 100);
    const proporcion = porcentaje.startsWith("menos")
      ? porcentaje
      : `el ${porcentaje}`;
    entradas.push({
      id: "mayor-egreso",
      titulo: "Mayor egreso del mes",
      texto: categoria === "Sin clasificar"
        ? `Este mes, los egresos sin clasificar representan ${proporcion} de sus salidas (${formatearMoneda(montoCategoria)}).`
        : `Este mes, sus gastos en «${categoria}» representan ${proporcion} de sus salidas (${formatearMoneda(montoCategoria)}).`,
      tono: "neutral",
    });
  }

  entradas.push({
    id: "balance-mensual",
    titulo: flujoNeto > 0
      ? "Flujo neto positivo"
      : flujoNeto < 0 ? "Flujo neto negativo" : "Ingresos y egresos equilibrados",
    texto: flujoNeto > 0
      ? `Los ingresos superan a los egresos del mes en ${formatearMoneda(flujoNeto)}.`
      : flujoNeto < 0
        ? `Los egresos superan a los ingresos del mes en ${formatearMoneda(Math.abs(flujoNeto))}.`
        : `Los ingresos y los egresos del mes suman ${formatearMoneda(ingresos)} cada uno. El flujo neto es ${formatearMoneda(0)}.`,
    tono: flujoNeto > 0 ? "positivo" : flujoNeto < 0 ? "negativo" : "neutral",
  });

  const historico = Array.isArray(datos.historico) ? datos.historico : [];
  entradas.push(crearComparacion(flujoNeto, historico.at(-2)));
  return entradas;
}
