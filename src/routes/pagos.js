const express = require("express");
const paymentsService = require("../services/paymentsService");

const router = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get(
  "/",
  wrap(async (req, res) => {
    const { filtro, empresa } = req.query;
    const porFiltro = {
      hoy: paymentsService.getDeHoy,
      semana: paymentsService.getDeLaSemana,
      mes: paymentsService.getDelMes,
      vencidos: paymentsService.getVencidos,
      pendientes: paymentsService.getPendientes,
    };
    const obtener = porFiltro[filtro] || paymentsService.getAll;
    res.json(await obtener(empresa || undefined));
  })
);

router.get(
  "/empresas/lista",
  wrap(async (req, res) => {
    res.json(await paymentsService.getEmpresas());
  })
);

router.get(
  "/historial",
  wrap(async (req, res) => {
    res.json(await paymentsService.getHistorial());
  })
);

router.get(
  "/:id",
  wrap(async (req, res) => {
    const pago = await paymentsService.getById(Number(req.params.id));
    if (!pago) return res.status(404).json({ error: "Pago no encontrado" });
    res.json(pago);
  })
);

router.post(
  "/",
  wrap(async (req, res) => {
    const { nombre, fecha_vencimiento } = req.body;
    if (!nombre || !fecha_vencimiento) {
      return res.status(400).json({ error: "nombre y fecha_vencimiento son obligatorios" });
    }
    const pago = await paymentsService.create(req.body);
    res.status(201).json(pago);
  })
);

router.put(
  "/:id",
  wrap(async (req, res) => {
    const pago = await paymentsService.update(Number(req.params.id), req.body);
    if (!pago) return res.status(404).json({ error: "Pago no encontrado" });
    res.json(pago);
  })
);

router.post(
  "/:id/pagado",
  wrap(async (req, res) => {
    const pago = await paymentsService.marcarPagado(Number(req.params.id));
    if (!pago) return res.status(404).json({ error: "Pago no encontrado" });
    res.json(pago);
  })
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    await paymentsService.remove(Number(req.params.id));
    res.status(204).end();
  })
);

module.exports = router;
