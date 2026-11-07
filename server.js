require("dotenv").config();
const express = require("express");
const path = require("path");

const { migrar } = require("./src/db");
const pagosRouter = require("./src/routes/pagos");
const tareasRouter = require("./src/routes/tareas");
const configuracionRouter = require("./src/routes/configuracion");
const webhookRouter = require("./src/routes/webhook");
const cronRouter = require("./src/routes/cron");
const dispositivosRouter = require("./src/routes/dispositivos");
const authRouter = require("./src/routes/auth");
const usuariosRouter = require("./src/routes/usuarios");
const { requireAuth, requireJefe, requireSuscripcionActiva } = require("./src/auth");
const scheduler = require("./src/scheduler");

const app = express();
// Render pone un proxy delante: sin esto, todos los clientes tendrian la misma
// IP y los limites de intentos de /api/auth se compartirian entre todos.
app.set("trust proxy", true);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRouter);
app.use("/api/pagos", requireAuth, requireSuscripcionActiva, pagosRouter);
app.use("/api/tareas", requireAuth, requireSuscripcionActiva, tareasRouter);
app.use("/api/configuracion", requireAuth, configuracionRouter);
app.use("/api/usuarios", requireAuth, requireJefe, usuariosRouter);
app.use("/webhook/whatsapp", webhookRouter);
app.use("/api/cron", cronRouter);
app.use("/api/dispositivos", requireAuth, dispositivosRouter);

// Manejador de errores: cualquier ruta async que llame next(err) cae aqui.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Error interno del servidor" });
});

async function iniciar() {
  await migrar();
  app.listen(PORT, () => {
    console.log(`Servidor web escuchando en http://localhost:${PORT}`);
  });
  scheduler.iniciar();
}

iniciar().catch((err) => {
  console.error("No se pudo iniciar el servidor:", err);
  process.exit(1);
});
