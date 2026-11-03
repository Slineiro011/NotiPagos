const dayjs = require("dayjs");
const { pool } = require("../db");

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

async function estado(cuentaId) {
  const cuenta = await getById(cuentaId);
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
  listarIds,
  estado,
  tieneAcceso,
  activarSuscripcion,
  desactivarSuscripcion,
  DIAS_PRUEBA,
};
