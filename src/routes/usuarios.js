const express = require("express");
const usuariosService = require("../services/usuariosService");

const router = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Todas las rutas de aqui ya pasaron por requireAuth + requireJefe (montado
// en server.js), pero ademas hay que limitar cada operacion a la cuenta del
// jefe que la pide: sin esto, cualquier jefe podria ver o editar los
// empleados de otra empresa con solo adivinar su nombre de usuario.
async function usuarioDeLaCuenta(usuario, cuentaId) {
  const fila = await usuariosService.getByUsuario(usuario);
  if (!fila || fila.cuenta_id !== cuentaId) return null;
  return fila;
}

router.get(
  "/",
  wrap(async (req, res) => {
    res.json(await usuariosService.listar(req.usuario.cuenta_id));
  })
);

router.post(
  "/",
  wrap(async (req, res) => {
    const { usuario, password, nombre, rol, telefono } = req.body;
    if (!usuario || !password) {
      return res.status(400).json({ error: "usuario y password son obligatorios" });
    }
    const existente = await usuariosService.getByUsuario(usuario);
    if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });

    const creado = await usuariosService.crear(usuario, nombre, password, {
      rol,
      telefono,
      cuentaId: req.usuario.cuenta_id,
    });
    res.status(201).json(creado);
  })
);

router.put(
  "/:usuario",
  wrap(async (req, res) => {
    const existente = await usuarioDeLaCuenta(req.params.usuario, req.usuario.cuenta_id);
    if (!existente) return res.status(404).json({ error: "Usuario no encontrado" });
    const { nombre, rol, telefono, password } = req.body;
    const actualizado = await usuariosService.actualizar(req.params.usuario, { nombre, rol, telefono, password });
    if (!actualizado) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(actualizado);
  })
);

router.delete(
  "/:usuario",
  wrap(async (req, res) => {
    if (req.params.usuario === req.usuario.usuario) {
      return res.status(400).json({ error: "No puedes eliminar tu propia cuenta mientras tienes la sesión abierta" });
    }
    const existente = await usuarioDeLaCuenta(req.params.usuario, req.usuario.cuenta_id);
    if (!existente) return res.status(404).json({ error: "Usuario no encontrado" });
    const ok = await usuariosService.eliminar(req.params.usuario);
    if (!ok) return res.status(404).json({ error: "Usuario no encontrado" });
    res.status(204).end();
  })
);

module.exports = router;
