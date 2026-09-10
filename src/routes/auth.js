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
    const { nombre, telefono, password, usuario } = req.body;
    let usuarioActual = req.usuario.usuario;

    const nuevoUsuario = typeof usuario === "string" ? usuario.trim() : "";
    if (nuevoUsuario && nuevoUsuario !== usuarioActual) {
      const existente = await usuariosService.getByUsuario(nuevoUsuario);
      if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });
      const renombrado = await usuariosService.cambiarUsuario(usuarioActual, nuevoUsuario);
      if (!renombrado) return res.status(404).json({ error: "Usuario no encontrado" });
      usuarioActual = nuevoUsuario;
    }

    const actualizado = await usuariosService.actualizar(usuarioActual, { nombre, telefono, password });
    if (!actualizado) return res.status(404).json({ error: "Usuario no encontrado" });

    // El usuario y/o el nombre pudieron cambiar: se reemite el token para que
    // el cliente no quede con datos de sesion desactualizados.
    const token = generarToken(actualizado);
    res.json({ ...actualizado, token });
  })
);

module.exports = router;
