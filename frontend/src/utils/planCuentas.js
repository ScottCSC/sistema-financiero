export const CLAVE_PLAN_CUENTAS = "PLAN_DE_CUENTAS";

export function categoriasDelPlan(plan) {
  return Object.fromEntries(
    Object.values(plan ?? {}).flatMap((categorias) => Object.entries(categorias))
  );
}

export function normalizarNombreCuenta(nombre) {
  return nombre.trim().replace(/\s+/g, " ").normalize("NFKD")
    .replace(/\p{M}/gu, "").toLocaleLowerCase("es");
}

export function validarPlanCuentas(plan) {
  const esObjeto = (valor) => valor !== null && typeof valor === "object" && !Array.isArray(valor);
  if (!esObjeto(plan) || !["Ingresos", "Egresos", "Sin clasificar"].every((grupo) => esObjeto(plan[grupo]))) {
    throw new Error("No se pudo leer el plan de cuentas. Revise su configuración en Ajustes.");
  }
  for (const categorias of Object.values(plan)) {
    if (!esObjeto(categorias) || Object.entries(categorias).some(([categoria, subcategorias]) =>
      !categoria.trim() || !Array.isArray(subcategorias) || subcategorias.length === 0 ||
      subcategorias.some((nombre) => typeof nombre !== "string" || !nombre.trim())
    )) {
      throw new Error("El plan de cuentas contiene categorías o subcategorías inválidas.");
    }
  }
  if (!plan["Sin clasificar"]["Sin clasificar"]?.includes("Sin subcategoría")) {
    throw new Error("Falta la clasificación predeterminada en el plan de cuentas.");
  }
  return plan;
}
