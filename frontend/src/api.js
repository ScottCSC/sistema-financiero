import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.PROD ? "" : "http://127.0.0.1:8000",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export const CUENTA_ID = 1;

export async function getConfiguracion(clave) {
  const { data } = await api.get(`/configuracion/${encodeURIComponent(clave)}`);
  return data;
}

export async function actualizarConfiguracion(clave, valor) {
  const { data } = await api.put(`/configuracion/${encodeURIComponent(clave)}`, valor);
  return data;
}

export async function getCartola(cuentaId = CUENTA_ID) {
  const { data } = await api.get(`/cuentas/${cuentaId}/cartola`);
  return data;
}

export async function crearMovimiento(datos) {
  const { data } = await api.post("/movimientos", {
    cuenta_id: CUENTA_ID,
    ...datos,
  });
  return data;
}

export async function getMovimientos(cuentaId = CUENTA_ID) {
  const { data } = await api.get("/movimientos", {
    params: { cuenta_id: cuentaId },
  });
  return data;
}

export async function getDiccionarioClasificacion(cuentaId = CUENTA_ID) {
  const { data } = await api.get("/api/diccionario-clasificacion", {
    params: { cuenta_id: cuentaId },
  });
  return data;
}

export async function actualizarSaldoInicial(id, nuevoSaldo) {
  const { data } = await api.put(`/cuentas/${id}/saldo_inicial`, {
    nuevo_saldo: Number.parseInt(nuevoSaldo, 10),
  });
  return data;
}

export async function eliminarMovimiento(movimientoId) {
  await api.delete(`/movimientos/${movimientoId}`);
}

export async function actualizarMovimiento(movimientoId, datos) {
  const { data } = await api.put(`/movimientos/${movimientoId}`, datos);
  return data;
}

export async function importarExcel(archivo) {
  const formulario = new FormData();
  formulario.append("file", archivo);
  const { data } = await api.post("/movimientos/importar", formulario, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function exportarExcel() {
  const { data: blob } = await api.get("/movimientos/exportar", {
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "cartola_bci.xlsx";
  enlace.style.display = "none";
  document.body.appendChild(enlace);

  try {
    enlace.click();
  } finally {
    enlace.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  }
}

export default api;
