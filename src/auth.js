const jwt = require("jsonwebtoken");
const cuentasService = require("./services/cuentasService");

const SECRETO = process.env.JWT_SECRET;
if (!SECRETO) {
  console.warn(
    "Advertencia: no se definio JWT_SECRET. El login no funcionara de forma segura hasta que se configure."
  );
}

function generarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.usuario,
      nombre: usuario.nombre,
      rol: usuario.rol || "usuario",
      cuenta_id: usuario.cuenta_id,
    },
    SECRETO || "cambia-esto",
    { expiresIn: "30d" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado" });

  try {
    const payload = jwt.verify(token, SECRETO || "cambia-esto");
    req.usuario = {
      usuario: payload.sub,
      nombre: payload.nombre,
      rol: payload.rol || "usuario",
      cuenta_id: payload.cuenta_id,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Sesion invalida o expirada" });
  }
}

function requireJefe(req, res, next) {
  if (req.usuario?.rol !== "jefe") {
    return res.status(403).json({ error: "Solo el jefe puede hacer esto" });
  }
  next();
}

/**
 * Bloquea el acceso a pagos/historial si ya paso el mes de prueba gratis y la
 * cuenta no tiene una suscripcion activa. Se deja fuera de configuracion/
 * usuarios para que el jefe pueda seguir gestionando su cuenta (y suscribirse)
 * aunque este bloqueado.
 */
async function requireSuscripcionActiva(req, res, next) {
  try {
    const cuentaId = req.usuario?.cuenta_id;
    if (!cuentaId) return res.status(401).json({ error: "No autenticado" });
    const cuenta = await cuentasService.getById(cuentaId);
    if (!cuenta || !cuentasService.tieneAcceso(cuenta)) {
      return res.status(402).json({
        error: "Tu mes de prueba gratis termino. Suscribete para seguir usando la app.",
        codigo: "SUSCRIPCION_REQUERIDA",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { generarToken, requireAuth, requireJefe, requireSuscripcionActiva };
