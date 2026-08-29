const express = require("express");
const conversacion = require("../conversacion");

const router = express.Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// Meta llama a este endpoint una sola vez para verificar el webhook.
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Meta llama a este endpoint cada vez que llega un mensaje o cambia un estado.
router.post("/", (req, res) => {
  // Responder rapido para que Meta no reintente; procesar en segundo plano.
  res.sendStatus(200);

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const mensaje = value?.messages?.[0];
    if (!mensaje) return; // puede ser un evento de "statuses" (entregado/leido), lo ignoramos

    const numero = mensaje.from;
    const texto = mensaje.text?.body;
    if (!texto) return; // por ahora solo procesamos mensajes de texto

    conversacion.manejarMensaje(numero, texto).catch((err) => {
      console.error("Error manejando mensaje entrante de WhatsApp:", err);
    });
  } catch (err) {
    console.error("Error procesando webhook de WhatsApp:", err);
  }
});

module.exports = router;
