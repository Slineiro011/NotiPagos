const express = require("express");
const tareasService = require("../services/tareasService");

const router = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get(
  "/",
  wrap(async (req, res) => {
    const { usuario } = req.query;
    res.json(await tareasService.getPendientes(req.usuario.cuenta_id, req.usuario, usuario || undefined));
  })
);

router.get(
  "/:id",
  wrap(async (req, res) => {
    const tarea = await tareasService.getById(Number(req.params.id), req.usuario, req.usuario.cuenta_id);
    if (!tarea) return res.status(404).json({ error: "Tarea no encontrada" });
    res.json(tarea);
  })
);

router.post(
  "/",
  wrap(async (req, res) => {
    const { nombre, fecha_vencimiento } = req.body;
    if (!nombre || !fecha_vencimiento) {
      return res.status(400).json({ error: "nombre y fecha_vencimiento son obligatorios" });
    }
    const tarea = await tareasService.create(req.body, req.usuario, req.usuario.cuenta_id);
    res.status(201).json(tarea);
  })
);

router.put(
  "/:id",
  wrap(async (req, res) => {
    const tarea = await tareasService.update(Number(req.params.id), req.body, req.usuario, req.usuario.cuenta_id);
    if (!tarea) return res.status(404).json({ error: "Tarea no encontrada" });
    res.json(tarea);
  })
);

router.post(
  "/:id/hecha",
  wrap(async (req, res) => {
    const tarea = await tareasService.marcarHecha(Number(req.params.id), req.usuario, req.usuario.cuenta_id);
    if (!tarea) return res.status(404).json({ error: "Tarea no encontrada" });
    res.json(tarea);
  })
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    const ok = await tareasService.remove(Number(req.params.id), req.usuario, req.usuario.cuenta_id);
    if (!ok) return res.status(404).json({ error: "Tarea no encontrada" });
    res.status(204).end();
  })
);

module.exports = router;
