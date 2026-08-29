const express = require("express");
const settingsService = require("../services/settingsService");
const whatsapp = require("../whatsapp");

const router = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get(
  "/",
  wrap(async (req, res) => {
    res.json(await settingsService.getAll());
  })
);

router.put(
  "/",
  wrap(async (req, res) => {
    const { numeros_whatsapp, hora_recordatorio } = req.body;
    const cambios = {};
    if (numeros_whatsapp !== undefined) cambios.numeros_whatsapp = numeros_whatsapp;
    if (hora_recordatorio !== undefined) cambios.hora_recordatorio = hora_recordatorio;
    await settingsService.setMany(cambios);
    res.json(await settingsService.getAll());
  })
);

router.post(
  "/whatsapp/prueba",
  wrap(async (req, res) => {
    const numeros = await settingsService.getNumerosWhatsapp();
    if (!numeros.length) return res.status(400).json({ error: "No hay numeros configurados" });
    const resultados = await whatsapp.enviarATodos(
      numeros,
      "Mensaje de prueba: el sistema de notificaciones de pagos está conectado correctamente. ✅",
      { plantilla: true }
    );
    res.json({ resultados });
  })
);

module.exports = router;
