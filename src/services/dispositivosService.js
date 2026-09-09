const { pool } = require("../db");

async function registrar(token, plataforma = "android", usuario = null) {
  await pool.query(
    `INSERT INTO dispositivos (token, plataforma, usuario) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET plataforma = excluded.plataforma, usuario = excluded.usuario`,
    [token, plataforma, usuario]
  );
}

async function eliminar(token) {
  await pool.query("DELETE FROM dispositivos WHERE token = $1", [token]);
}

async function getTokens() {
  const { rows } = await pool.query("SELECT token FROM dispositivos");
  return rows.map((r) => r.token);
}

async function getTokensDeUsuario(usuario) {
  const { rows } = await pool.query("SELECT token FROM dispositivos WHERE usuario = $1", [usuario]);
  return rows.map((r) => r.token);
}

module.exports = { registrar, eliminar, getTokens, getTokensDeUsuario };
