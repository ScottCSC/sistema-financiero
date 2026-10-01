export function formatearMoneda(valor) {
  const numero = Number(valor);
  const seguro = Number.isFinite(numero) ? numero : 0;
  const negativo = seguro < 0;
  const absoluto = Math.abs(Math.round(seguro));
  const miles = new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(absoluto);

  return `${negativo ? "-" : ""}$ ${miles}`;
}

export function formatearFecha(fecha) {
  if (!fecha) return "";
  const [anio, mes, dia] = String(fecha).split("-");
  if (!dia) return fecha;
  return `${dia}/${mes}/${anio}`;
}
