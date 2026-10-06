const COLORES = {
  texto: [55, 65, 81],
  secundario: [100, 116, 139],
  borde: [226, 232, 240],
  blanco: [255, 255, 255],
  claro: [248, 250, 252],
  categoria: [241, 245, 249],
  seccion: [30, 41, 59],
  ingreso: [21, 128, 61],
  egreso: [185, 28, 28],
};

const NOMBRES_AGRUPACION = {
  semanal: "Semanal",
  mensual: "Mensual",
  anual: "Anual",
};

function textoLimpio(elemento) {
  return (elemento?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function copiarTabla(tabla) {
  if (tabla?.tagName !== "TABLE") {
    throw new Error("No se encontró la tabla de flujo de caja para generar el reporte.");
  }

  // La copia fija la vista elegida antes de cargar las librerías y no toca la pantalla.
  const copia = tabla.cloneNode(true);
  copia.querySelectorAll("svg, .tooltip-text, .icono-info, [role='tooltip']")
    .forEach((elemento) => elemento.remove());
  copia.querySelectorAll("button").forEach((boton) => {
    boton.replaceWith(copia.ownerDocument.createTextNode(textoLimpio(boton)));
  });
  return copia;
}

function estilosCelda(fila, celda, indice) {
  const esSeccion = fila.classList.contains("fila-seccion-titulo");
  const esSubtotal = fila.classList.contains("fila-subtotal");
  const esCategoria = fila.classList.contains("fila-categoria");
  const esSaldo = fila.classList.contains("fila-saldo-acumulado");
  const esFlujoNeto = fila.classList.contains("fila-flujo-neto");
  const esSubcategoria = fila.classList.contains("fila-subcategoria");
  const esProyeccion = celda?.classList.contains("columna-proyeccion");
  const esNegativo = celda?.classList.contains("negativo") ||
    celda?.classList.contains("saldo-negativo");
  const esPositivo = celda?.classList.contains("positivo");
  const esDestacado = esCategoria || esSubtotal || esSaldo || esFlujoNeto || esSeccion;

  const estilos = {
    halign: indice === 0 ? "left" : "right",
    fontStyle: esDestacado ? "bold" : "normal",
    textColor: COLORES.texto,
    fillColor: COLORES.blanco,
  };

  if (esCategoria || esSubtotal || esSaldo) estilos.fillColor = COLORES.categoria;
  if (esFlujoNeto) estilos.fillColor = [226, 232, 240];
  if (esSubtotal || esFlujoNeto || esSaldo) {
    estilos.lineWidth = { top: 0.35, right: 0, bottom: 0.15, left: 0 };
  }
  if (esSubcategoria && indice === 0) {
    estilos.cellPadding = { top: 2.8, right: 3, bottom: 2.8, left: 8 };
  }
  if (esProyeccion) {
    estilos.fontStyle = esDestacado ? "bolditalic" : "italic";
    estilos.fillColor = COLORES.claro;
    estilos.textColor = COLORES.secundario;
    estilos.lineWidth = { top: 0.15, right: 0, bottom: 0.15, left: 0.35 };
  }
  // Egresos se presentan como montos positivos: su semántica viene de la clase.
  if (esNegativo) estilos.textColor = COLORES.egreso;
  else if (esPositivo) estilos.textColor = COLORES.ingreso;
  if (esSeccion) {
    estilos.fillColor = COLORES.seccion;
    estilos.textColor = COLORES.blanco;
    estilos.lineWidth = 0;
  }
  return estilos;
}

function prepararFilas(copia, cantidadColumnas) {
  const filas = [...copia.tBodies].flatMap((cuerpo) => [...cuerpo.rows]);
  if (copia.tFoot) filas.push(...copia.tFoot.rows);

  return filas.map((fila) => {
    const celdas = [...fila.cells];
    const esFilaCompleta = celdas.length === 1 && celdas[0].colSpan > 1;

    // Evitar colspan permite que cada tramo horizontal repita su título de bloque.
    return Array.from({ length: cantidadColumnas }, (_, indice) => {
      const celda = esFilaCompleta ? celdas[0] : celdas[indice];
      const contenido = esFilaCompleta && indice > 0 ? "" : textoLimpio(celda);
      return {
        content: contenido,
        styles: estilosCelda(fila, celda, indice),
      };
    });
  });
}

function fechaArchivo(fecha) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(fecha);
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export async function exportarFlujoPdf({ tabla, empresa, agrupacion }) {
  const copia = copiarTabla(tabla);
  const cabeceras = [...(copia.tHead?.rows[0]?.cells ?? [])].map(textoLimpio);
  if (cabeceras.length < 2) {
    throw new Error("La tabla todavía no está disponible para generar el reporte.");
  }

  const filas = prepararFilas(copia, cabeceras.length);
  const periodos = cabeceras.slice(1, -1);
  const fechaEmision = new Date();
  const nombreEmpresa = String(empresa ?? "").trim() || "Control Cartola";
  const tipoAgrupacion = NOMBRES_AGRUPACION[agrupacion] ?? "Mensual";
  const rango = periodos.length === 0 ? "Sin períodos con actividad" :
    periodos.length === 1 ? periodos[0] : `${periodos[0]} a ${periodos.at(-1)}`;
  const fechaTexto = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago", day: "2-digit", month: "long", year: "numeric",
  }).format(fechaEmision);

  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const documento = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  documento.setProperties({ title: "Reporte Financiero - Flujo de Caja", creator: "Control Cartola" });
  const anchoPagina = documento.internal.pageSize.getWidth();
  const altoPagina = documento.internal.pageSize.getHeight();
  const margen = 12;

  function dibujarEncabezado() {
    documento.setFont("helvetica", "bold");
    documento.setFontSize(11);
    documento.setTextColor(...COLORES.seccion);
    const nombreEnLineas = documento.splitTextToSize(nombreEmpresa, anchoPagina - margen * 2);
    documento.text(nombreEnLineas.slice(0, 2), margen, 13);
    documento.setFontSize(17);
    documento.text("Reporte Financiero", margen, 27);
    documento.setFont("helvetica", "normal");
    documento.setFontSize(9);
    documento.setTextColor(...COLORES.secundario);
    documento.text(`Flujo de Caja | Agrupación ${tipoAgrupacion}`, margen, 34);
    documento.text(`Fecha de emisión: ${fechaTexto}`, anchoPagina - margen, 34, { align: "right" });
    const rangoEnLineas = documento.splitTextToSize(`Períodos: ${rango}`, anchoPagina - margen * 2);
    documento.text(rangoEnLineas.slice(0, 2), margen, 40);
  }

  autoTable(documento, {
    head: [cabeceras.map((contenido, indice) => ({
      content: contenido,
      styles: {
        halign: indice === 0 ? "left" : "right",
        ...(indice === cabeceras.length - 1 ? {
          fontStyle: "bolditalic", textColor: COLORES.secundario,
        } : {}),
      },
    }))],
    body: filas,
    theme: "plain",
    startY: 47,
    margin: { top: 47, right: margen, bottom: 22, left: margen },
    styles: {
      font: "helvetica", fontSize: 9, textColor: COLORES.texto,
      cellPadding: { top: 2.8, right: 3, bottom: 2.8, left: 3 },
      overflow: "linebreak", valign: "middle", lineColor: COLORES.borde,
      lineWidth: { top: 0, right: 0, bottom: 0.15, left: 0 },
      cellWidth: 31,
    },
    headStyles: { fillColor: COLORES.claro, fontStyle: "bold", minCellHeight: 11 },
    columnStyles: { 0: { cellWidth: 63, halign: "left" } },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: 0,
    horizontalPageBreakBehaviour: "afterAllRows",
    willDrawPage: dibujarEncabezado,
  });

  const paginas = documento.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    documento.setPage(pagina);
    documento.setDrawColor(...COLORES.borde);
    documento.setLineWidth(0.2);
    documento.line(margen, altoPagina - 17, anchoPagina - margen, altoPagina - 17);
    documento.setFont("helvetica", "normal");
    documento.setFontSize(8);
    documento.setTextColor(...COLORES.secundario);
    documento.text("Proyección: estimación basada en el promedio histórico de los períodos disponibles.", margen, altoPagina - 12);
    documento.text("Moneda: pesos chilenos (CLP).", margen, altoPagina - 7);
    documento.text(`Página ${pagina} de ${paginas}`, anchoPagina - margen, altoPagina - 7, { align: "right" });
  }

  await documento.save(`reporte-financiero-${agrupacion}-${fechaArchivo(fechaEmision)}.pdf`, {
    returnPromise: true,
  });
}
