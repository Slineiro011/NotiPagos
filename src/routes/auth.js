const express = require("express");
const usuariosService = require("../services/usuariosService");
const { generarToken, requireAuth } = require("../auth");

const router = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.post(
  "/login",
  wrap(async (req, res) => {
    const { usuario, password } = req.body;
    if (!usuario || !password) {
      return res.status(400).json({ error: "usuario y password son obligatorios" });
    }
    const encontrado = await usuariosService.verificarPassword(usuario, password);
    if (!encontrado) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

    const token = generarToken(encontrado);
    res.json({
      token,
      nombre: encontrado.nombre,
      usuario: encontrado.usuario,
      rol: encontrado.rol,
      telefono: encontrado.telefono,
    });
  })
);

// Autoservicio: cualquier usuario autenticado puede ver/editar su propio
// telefono y cambiar su propia contraseña, sin necesitar el rol jefe.
router.get(
  "/perfil",
  requireAuth,
  wrap(async (req, res) => {
    const fila = await usuariosService.getByUsuario(req.usuario.usuario);
    if (!fila) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol, telefono: fila.telefono });
  })
);

router.put(
  "/perfil",
  requireAuth,
  wrap(async (req, res) => {
    const { telefono, password } = req.body;
    const actualizado = await usuariosService.actualizar(req.usuario.usuario, { telefono, password });
    if (!actualizado) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(actualizado);
  })
);

module.exports = router;
