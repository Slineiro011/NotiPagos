const { pool } = require("../db");

const DEFAULTS = {
  numeros_whatsapp: "",
  hora_recordatorio: "08:00",
};

async function getAll() {
  const { rows } = await pool.query("SELECT clave, valor FROM configuracion");
  const config = { ...DEFAULTS };
  for (const row of rows) config[row.clave] = row.valor;
  return config;
}

async function get(clave) {
  const { rows } = await pool.query("SELECT valor FROM configuracion WHERE clave = $1", [clave]);
  return rows[0] ? rows[0].valor : DEFAULTS[clave];
}

async function set(clave, valor) {
  await pool.query(
    `INSERT INTO configuracion (clave, valor) VALUES ($1, $2)
     ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor`,
    [clave, valor]
  );
}

async function setMany(obj) {
  for (const [clave, valor] of Object.entries(obj)) await set(clave, valor);
}

async function getNumerosWhatsapp() {
  const raw = (await get("numeros_whatsapp")) || "";
  return raw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

function limpiarNumero(numero) {
  return String(numero).replace(/[^\d]/g, "");
}

async function agregarNumero(numero) {
  const limpio = limpiarNumero(numero);
  const numeros = await getNumerosWhatsapp();
  if (!numeros.includes(limpio)) {
    numeros.push(limpio);
    await set("numeros_whatsapp", numeros.join(","));
  }
  return numeros;
}

async function quitarNumero(numero) {
  const limpio = limpiarNumero(numero);
  const numeros = (await getNumerosWhatsapp()).filter((n) => n !== limpio);
  await set("numeros_whatsapp", numeros.join(","));
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
