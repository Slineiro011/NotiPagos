const bcrypt = require("bcryptjs");
const { pool } = require("../db");

async function getByUsuario(usuario) {
  const { rows } = await pool.query("SELECT * FROM usuarios WHERE usuario = $1", [usuario]);
  return rows[0] || null;
}

async function crear(usuario, nombre, passwordPlano) {
  const hash = await bcrypt.hash(passwordPlano, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (usuario, nombre, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (usuario) DO UPDATE SET password_hash = excluded.password_hash, nombre = excluded.nombre
     RETURNING id, usuario, nombre`,
    [usuario, nombre || usuario, hash]
  );
  return rows[0];
}

async function verificarPassword(usuario, passwordPlano) {
  const fila = await getByUsuario(usuario);
  if (!fila) return null;
  const ok = await bcrypt.compare(passwordPlano, fila.password_hash);
  return ok ? { id: fila.id, usuario: fila.usuario, nombre: fila.nombre } : null;
}

module.exports = { getByUsuario, crear, verificarPassword };
