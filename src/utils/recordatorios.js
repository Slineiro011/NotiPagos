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
  esVisibilidadRestringida,
  puedeFiltrarPorUsuario,
};
