const { pool } = require("../db");

async function registrar(token, plataforma = "android") {
  await pool.query(
    `INSERT INTO dispositivos (token, plataforma) VALUES ($1, $2)
     ON CONFLICT (token) DO UPDATE SET plataforma = excluded.plataforma`,
    [token, plataforma]
  );
}

async function eliminar(token) {
  await pool.query("DELETE FROM dispositivos WHERE token = $1", [token]);
}

async function getTokens() {
  const { rows } = await pool.query("SELECT token FROM dispositivos");
  return rows.map((r) => r.token);
}

module.exports = { registrar, eliminar, getTokens };
