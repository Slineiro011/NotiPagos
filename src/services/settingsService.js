const { pool } = require("../db");

const DEFAULTS = {
  numeros_whatsapp: "",
  hora_recordatorio: "08:00",
};

async function getAll(cuentaId) {
  const { rows } = await pool.query("SELECT clave, valor FROM configuracion WHERE cuenta_id = $1", [cuentaId]);
  const config = { ...DEFAULTS };
  for (const row of rows) config[row.clave] = row.valor;
  return config;
}

async function get(cuentaId, clave) {
  const { rows } = await pool.query("SELECT valor FROM configuracion WHERE cuenta_id = $1 AND clave = $2", [cuentaId, clave]);
  return rows[0] ? rows[0].valor : DEFAULTS[clave];
}

async function set(cuentaId, clave, valor) {
  await pool.query(
    `INSERT INTO configuracion (cuenta_id, clave, valor) VALUES ($1, $2, $3)
     ON CONFLICT (cuenta_id, clave) DO UPDATE SET valor = excluded.valor`,
    [cuentaId, clave, valor]
  );
}

async function setMany(cuentaId, obj) {
  for (const [clave, valor] of Object.entries(obj)) await set(cuentaId, clave, valor);
}

async function getNumerosWhatsapp(cuentaId) {
  const raw = (await get(cuentaId, "numeros_whatsapp")) || "";
  return raw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

function limpiarNumero(numero) {
  return String(numero).replace(/[^\d]/g, "");
}

async function agregarNumero(cuentaId, numero) {
  const limpio = limpiarNumero(numero);
  const numeros = await getNumerosWhatsapp(cuentaId);
  if (!numeros.includes(limpio)) {
    numeros.push(limpio);
    await set(cuentaId, "numeros_whatsapp", numeros.join(","));
  }
  return numeros;
}

async function quitarNumero(cuentaId, numero) {
  const limpio = limpiarNumero(numero);
  const numeros = (await getNumerosWhatsapp(cuentaId)).filter((n) => n !== limpio);
  await set(cuentaId, "numeros_whatsapp", numeros.join(","));
  return numeros;
}

module.exports = {
  getAll,
  get,
  set,
  setMany,
  getNumerosWhatsapp,
  agregarNumero,
  quitarNumero,
  DEFAULTS,
};
