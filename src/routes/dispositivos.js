const express = require("express");
const dispositivosService = require("../services/dispositivosService");

const router = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.post(
  "/",
  wrap(async (req, res) => {
    const { token, plataforma } = req.body;
    if (!token) return res.status(400).json({ error: "token es obligatorio" });
    await dispositivosService.registrar(token, plataforma || "android");
    console.log(`[dispositivos] Registrado token de ${plataforma || "android"}: ${token.slice(0, 20)}...`);
    res.status(201).json({ ok: true });
  })
);

router.delete(
  "/:token",
  wrap(async (req, res) => {
    await dispositivosService.eliminar(req.params.token);
    res.status(204).end();
  })
);

module.exports = router;
