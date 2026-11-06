const dayjs = require("dayjs");

const MESES_POR_RECURRENCIA = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

// Compartido entre pagos y tareas: "semanal" avanza por dias, el resto por meses.
const RECURRENCIAS = ["ninguna", "semanal", ...Object.keys(MESES_POR_RECURRENCIA)];

function siguienteFecha(fecha, recurrencia) {
  if (recurrencia === "semanal") return dayjs(fecha).add(7, "day").format("YYYY-MM-DD");
  const meses = MESES_POR_RECURRENCIA[recurrencia];
  if (!meses) return null;
  return dayjs(fecha).add(meses, "month").format("YYYY-MM-DD");
}

/**
 * Primera fecha de la recurrencia que no haya pasado todavia. Sirve para que
 * "todos los jueves" siga avisando cada jueves aunque el anterior no se haya
 * marcado como hecho. Sin recurrencia devuelve la misma fecha.
 */
function proximaFechaVigente(fecha, recurrencia, hoy = dayjs().format("YYYY-MM-DD")) {
  let actual = dayjs(fecha).format("YYYY-MM-DD");
  while (actual < hoy) {
    const siguiente = siguienteFecha(actual, recurrencia);
    if (!siguiente) return actual;
    actual = siguiente;
  }
  return actual;
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Ej: "jueves 12 de noviembre". */
function formatFechaLarga(fecha) {
  const d = dayjs(fecha);
  return `${DIAS_SEMANA[d.day()]} ${d.date()} de ${MESES[d.month()]}`;
}

/** Ej: "vence hoy, jueves 12 de noviembre". */
function formatVencimiento(fecha, hoy = dayjs().format("YYYY-MM-DD")) {
  const dias = dayjs(fecha).startOf("day").diff(dayjs(hoy).startOf("day"), "day");
  const larga = formatFechaLarga(fecha);
  if (dias < 0) return `venció el ${larga}`;
  if (dias === 0) return `vence hoy, ${larga}`;
  if (dias === 1) return `vence mañana, ${larga}`;
  return `vence el ${larga}`;
}

/**
 * Si usuarioActual viene definido y NO es "jefe", solo puede ver lo que el
 * mismo creo. Sin usuarioActual (llamadas internas: scheduler, bot de
 * sistema) o con rol "jefe", no se filtra por dueno.
 */
function esVisibilidadRestringida(usuarioActual) {
  return !!usuarioActual && usuarioActual.rol !== "jefe";
}

function puedeFiltrarPorUsuario(usuarioActual) {
  return !usuarioActual || usuarioActual.rol === "jefe";
}

module.exports = {
  MESES_POR_RECURRENCIA,
  RECURRENCIAS,
  siguienteFecha,
  proximaFechaVigente,
  formatFechaLarga,
  formatVencimiento,
  esVisibilidadRestringida,
  puedeFiltrarPorUsuario,
};
