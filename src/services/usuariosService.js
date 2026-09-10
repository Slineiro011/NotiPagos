const bcrypt = require("bcryptjs");
const { pool } = require("../db");

function limpiarTelefono(telefono) {
  if (!telefono) return null;
  const limpio = String(telefono).replace(/[^\d]/g, "");
  return limpio || null;
}

async function getByUsuario(usuario) {
  const { rows } = await pool.query("SELECT * FROM usuarios WHERE usuario = $1", [usuario]);
  return rows[0] || null;
}

async function getByTelefono(telefono) {
  const limpio = limpiarTelefono(telefono);
  if (!limpio) return null;
  const { rows } = await pool.query("SELECT * FROM usuarios WHERE telefono = $1", [limpio]);
  return rows[0] || null;
}

async function listar() {
  const { rows } = await pool.query(
    "SELECT id, usuario, nombre, rol, telefono, creado_en FROM usuarios ORDER BY creado_en ASC"
  );
  return rows;
}

async function crear(usuario, nombre, passwordPlano, { rol = "usuario", telefono = null } = {}) {
  const hash = await bcrypt.hash(passwordPlano, 10);
  const rolFinal = rol === "jefe" ? "jefe" : "usuario";
  const { rows } = await pool.query(
    `INSERT INTO usuarios (usuario, nombre, password_hash, rol, telefono) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (usuario) DO UPDATE SET
       password_hash = excluded.password_hash,
       nombre = excluded.nombre,
       rol = excluded.rol,
       telefono = excluded.telefono
     RETURNING id, usuario, nombre, rol, telefono`,
    [usuario, nombre || usuario, hash, rolFinal, limpiarTelefono(telefono)]
  );
  return rows[0];
}

/** Edita nombre/rol/telefono y, opcionalmente, la contraseña (si se pasa). No crea usuarios nuevos. */
async function actualizar(usuario, { nombre, rol, telefono, password } = {}) {
  const actual = await getByUsuario(usuario);
  if (!actual) return null;

  const nuevoHash = password ? await bcrypt.hash(password, 10) : actual.password_hash;
  const rolFinal = rol === "jefe" || rol === "usuario" ? rol : actual.rol;
  const telefonoFinal = telefono !== undefined ? limpiarTelefono(telefono) : actual.telefono;

  const { rows } = await pool.query(
    `UPDATE usuarios SET nombre=$1, rol=$2, telefono=$3, password_hash=$4 WHERE usuario=$5
     RETURNING id, usuario, nombre, rol, telefono`,
    [nombre ?? actual.nombre, rolFinal, telefonoFinal, nuevoHash, usuario]
  );
  return rows[0];
}

async function eliminar(usuario) {
  const { rowCount } = await pool.query("DELETE FROM usuarios WHERE usuario = $1", [usuario]);
  return rowCount > 0;
}

/**
 * Renombra el identificador de inicio de sesion de un usuario y propaga el
 * cambio a las tablas que lo referencian por valor (no por id): los pagos
 * que creo, su historial y sus dispositivos registrados. Todo en una sola
 * transaccion para que nunca quede a medias.
 */
async function cambiarUsuario(usuarioActual, nuevoUsuario) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE usuarios SET usuario = $2 WHERE usuario = $1
       RETURNING id, usuario, nombre, rol, telefono`,
      [usuarioActual, nuevoUsuario]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("UPDATE pagos SET creado_por = $2 WHERE creado_por = $1", [usuarioActual, nuevoUsuario]);
    await client.query("UPDATE historial_pagos SET creado_por = $2 WHERE creado_por = $1", [usuarioActual, nuevoUsuario]);
    await client.query("UPDATE dispositivos SET usuario = $2 WHERE usuario = $1", [usuarioActual, nuevoUsuario]);
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function verificarPassword(usuario, passwordPlano) {
  const fila = await getByUsuario(usuario);
  if (!fila) return null;
  const ok = await bcrypt.compare(passwordPlano, fila.password_hash);
  return ok ? { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol, telefono: fila.telefono } : null;
}

module.exports = {
  getByUsuario,
  getByTelefono,
  listar,
  crear,
  actualizar,
  eliminar,
  cambiarUsuario,
  verificarPassword,
};
