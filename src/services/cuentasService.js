const dayjs = require("dayjs");
const { pool } = require("../db");
const comprasService = require("./comprasService");

const DIAS_PRUEBA = 30;

async function crear(nombre) {
  const { rows } = await pool.query(
    "INSERT INTO cuentas (nombre) VALUES ($1) RETURNING *",
    [nombre || "Mi empresa"]
  );
  return rows[0];
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM cuentas WHERE id = $1", [id]);
  return rows[0] || null;
}

async function listarIds() {
  const { rows } = await pool.query("SELECT id FROM cuentas ORDER BY id ASC");
  return rows.map((r) => r.id);
}

function pruebaVenceEn(cuenta) {
  return dayjs(cuenta.prueba_inicio).add(DIAS_PRUEBA, "day");
}

/** true si la cuenta todavia puede usar la app (en el mes gratis o con suscripcion vigente). */
function tieneAcceso(cuenta) {
  if (dayjs().isBefore(pruebaVenceEn(cuenta))) return true;
  if (!cuenta.suscripcion_activa) return false;
  if (!cuenta.suscripcion_vence) return true;
  return dayjs().isBefore(dayjs(cuenta.suscripcion_vence));
}

/**
 * Devuelve la cuenta, pero si su suscripcion de Android ya paso la fecha de
 * vencimiento guardada, primero le pregunta a Google: las renovaciones
 * mensuales conservan el mismo purchaseToken y solo mueven la fecha, que el
 * servidor no se entera de otra forma. Si Google dice que ya no esta activa,
 * se desactiva para no volver a consultar en cada peticion.
 */
async function getConAccesoActualizado(cuentaId) {
  const cuenta = await getById(cuentaId);
  if (!cuenta || tieneAcceso(cuenta)) return cuenta;
  if (!cuenta.suscripcion_activa || cuenta.plataforma_pago !== "android" || !cuenta.id_compra) return cuenta;

  let resultado;
  try {
    resultado = await comprasService.verificarSuscripcionAndroid(cuenta.id_compra);
  } catch (err) {
    // Google no respondio: se niega por ahora sin desactivar, y se reintenta en la proxima peticion.
    console.error(`No se pudo revisar la renovacion de la cuenta ${cuentaId}:`, err.message);
    return cuenta;
  }
  if (resultado.activa) {
    return activarSuscripcion(cuentaId, { vence: resultado.vence, plataforma: "android", idCompra: cuenta.id_compra });
  }
  return desactivarSuscripcion(cuentaId);
}

/** La cuenta (si existe) que ya uso esta compra de la tienda. */
async function getPorCompra(idCompra) {
  const { rows } = await pool.query("SELECT * FROM cuentas WHERE id_compra = $1", [idCompra]);
  return rows[0] || null;
}

async function estado(cuentaId) {
  const cuenta = await getConAccesoActualizado(cuentaId);
  if (!cuenta) return null;
  return {
    enPrueba: dayjs().isBefore(pruebaVenceEn(cuenta)),
    pruebaVenceEn: pruebaVenceEn(cuenta).toISOString(),
    suscripcionActiva: cuenta.suscripcion_activa,
    suscripcionVence: cuenta.suscripcion_vence,
    tieneAcceso: tieneAcceso(cuenta),
  };
}

async function activarSuscripcion(cuentaId, { vence, plataforma, idCompra } = {}) {
  const { rows } = await pool.query(
    `UPDATE cuentas SET suscripcion_activa = true, suscripcion_vence = $2,
       plataforma_pago = $3, id_compra = $4
     WHERE id = $1 RETURNING *`,
    [cuentaId, vence || null, plataforma || null, idCompra || null]
  );
  return rows[0] || null;
}

async function desactivarSuscripcion(cuentaId) {
  const { rows } = await pool.query(
    "UPDATE cuentas SET suscripcion_activa = false WHERE id = $1 RETURNING *",
    [cuentaId]
  );
  return rows[0] || null;
}

module.exports = {
  crear,
  getById,
  getConAccesoActualizado,
  getPorCompra,
  listarIds,
  estado,
  tieneAcceso,
  activarSuscripcion,
  desactivarSuscripcion,
  DIAS_PRUEBA,
};
