const { pool } = require("../db");

/** Borrador de un pago que se esta armando a preguntas en una conversacion de WhatsApp. */
async function get(numero) {
  const { rows } = await pool.query("SELECT datos FROM borradores_pago WHERE numero = $1", [numero]);
  return rows[0] ? rows[0].datos : null;
}

async function guardar(numero, datos) {
  await pool.query(
    `INSERT INTO borradores_pago (numero, datos, actualizado_en) VALUES ($1, $2, now())
     ON CONFLICT (numero) DO UPDATE SET datos = excluded.datos, actualizado_en = now()`,
    [numero, JSON.stringify(datos)]
  );
}

async function borrar(numero) {
  await pool.query("DELETE FROM borradores_pago WHERE numero = $1", [numero]);
}

module.exports = { get, guardar, borrar };
