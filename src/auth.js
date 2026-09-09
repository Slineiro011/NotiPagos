const jwt = require("jsonwebtoken");

const SECRETO = process.env.JWT_SECRET;
if (!SECRETO) {
  console.warn(
    "Advertencia: no se definio JWT_SECRET. El login no funcionara de forma segura hasta que se configure."
  );
}

function generarToken(usuario) {
  return jwt.sign(
    { sub: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol || "usuario" },
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
    req.usuario = { usuario: payload.sub, nombre: payload.nombre, rol: payload.rol || "usuario" };
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

module.exports = { generarToken, requireAuth, requireJefe };
