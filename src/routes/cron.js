const express = require("express");
const scheduler = require("../scheduler");

const router = express.Router();

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Endpoint para que un servicio externo (ej. cron-job.org) dispare la revision
 * de pagos. Es necesario en Render porque el plan gratuito "duerme" el servicio
 * por inactividad y el cron interno (node-cron) no corre mientras esta dormido.
 * Protegido por un secreto simple en la query string: /api/cron/revisar?secreto=...
 */
router.all("/revisar", async (req, res) => {
  if (CRON_SECRET && req.query.secreto !== CRON_SECRET) {
    return res.sendStatus(403);
  }
  try {
    const resultado = await scheduler.ejecutarRevisionDiaria();
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("Error ejecutando revision via cron externo:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
