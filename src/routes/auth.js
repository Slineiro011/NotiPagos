const express = require("express");
const usuariosService = require("../services/usuariosService");
const { generarToken } = require("../auth");

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
    res.json({ token, nombre: encontrado.nombre, usuario: encontrado.usuario });
  })
);

module.exports = router;
