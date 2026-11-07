const crypto = require("crypto");
const dayjs = require("dayjs");
const { pool } = require("../db");

const VIGENCIA_MINUTOS = 30;

/** Crea un token de un solo uso para que `usuario` restablezca su contraseña. */
async function crear(usuario) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiraEn = dayjs().add(VIGENCIA_MINUTOS, "minute").toISOString();
  await pool.query(
    "INSERT INTO restablecimientos_password (usuario, token, expira_en) VALUES ($1, $2, $3)",
    [usuario, token, expiraEn]
  );
  return token;
}

/** Devuelve la solicitud si el token existe, no ha sido usado y no ha expirado. */
async function getVigente(token) {
  const { rows } = await pool.query(
    "SELECT * FROM restablecimientos_password WHERE token = $1 AND usado = false AND expira_en > now()",
    [token]
  );
  return rows[0] || null;
}

async function marcarUsado(token) {
  await pool.query("UPDATE restablecimientos_password SET usado = true WHERE token = $1", [token]);
}

/** Cuantos enlaces se le han generado a `usuario` en la ultima hora. */
async function contarRecientes(usuario) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM restablecimientos_password WHERE usuario = $1 AND creado_en > now() - interval '1 hour'",
    [usuario]
  );
  return rows[0].n;
}

module.exports = { VIGENCIA_MINUTOS, crear, getVigente, marcarUsado, contarRecientes };
