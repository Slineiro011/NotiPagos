const dayjs = require("dayjs");

const GRAPH_VERSION = "v21.0";
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || "recordatorio_pagos";
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || "es";

function urlMensajes() {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
}

function limpiarNumero(numero) {
  return String(numero).replace(/[^\d]/g, "");
}

async function llamarGraphAPI(body) {
  if (!TOKEN || !PHONE_NUMBER_ID) {
    throw new Error("Falta configurar WHATSAPP_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID en las variables de entorno.");
  }
  const res = await fetch(urlMensajes(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = data?.error?.message || JSON.stringify(data);
    throw new Error(`Meta WhatsApp API respondio con error: ${detalle}`);
  }
  return data;
}

/** Mensaje de texto libre. Solo funciona si el destinatario escribio en las ultimas 24h. */
async function enviarTexto(numero, texto) {
  return llamarGraphAPI({
    messaging_product: "whatsapp",
    to: limpiarNumero(numero),
    type: "text",
    text: { body: texto, preview_url: false },
  });
}

/**
 * Mensaje de plantilla, funciona incluso fuera de la ventana de 24h (necesario
 * para los recordatorios automaticos). La plantilla debe existir y estar
 * aprobada en el Meta Business Manager con una sola variable de texto en el body.
 */
async function enviarPlantilla(numero, textoVariable) {
  return llamarGraphAPI({
    messaging_product: "whatsapp",
    to: limpiarNumero(numero),
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", parameter_name: "recordatorio", text: textoVariable }],
        },
      ],
    },
  });
}

async function enviarATodos(numeros, texto, { plantilla = false } = {}) {
  const resultados = [];
  for (const numero of numeros) {
    try {
      if (plantilla) await enviarPlantilla(numero, texto);
      else await enviarTexto(numero, texto);
      resultados.push({ numero, ok: true });
    } catch (err) {
      resultados.push({ numero, ok: false, error: err.message });
    }
  }
  return resultados;
}

// ---------- Formato de mensajes ----------

function formatMoneda(valor) {
  return Number(valor).toLocaleString("es-CO", { minimumFractionDigits: 0 });
}

function formatPago(pago) {
  const hoy = dayjs().startOf("day");
  const venc = dayjs(pago.fecha_vencimiento).startOf("day");
  const dias = venc.diff(hoy, "day");
  let cuando;
  if (dias < 0) cuando = `⚠️ vencido hace ${Math.abs(dias)} dia(s)`;
  else if (dias === 0) cuando = "🔴 vence HOY";
  else if (dias === 1) cuando = "🟠 vence MAÑANA";
  else cuando = `vence en ${dias} dias (${pago.fecha_vencimiento})`;

  return `#${pago.id} *${pago.nombre}* — ${pago.empresa} (${pago.categoria})\n   💰 $${formatMoneda(pago.monto)} - ${cuando}`;
}

/**
 * Version de una sola linea, sin saltos de linea ni tabs, para usar como
 * variable de una plantilla de WhatsApp (Meta rechaza parametros con saltos
 * de linea con el error 132018).
 */
function formatPagoLinea(pago) {
  const hoy = dayjs().startOf("day");
  const venc = dayjs(pago.fecha_vencimiento).startOf("day");
  const dias = venc.diff(hoy, "day");
  let cuando;
  if (dias < 0) cuando = `vencido hace ${Math.abs(dias)} dia(s)`;
  else if (dias === 0) cuando = "vence HOY";
  else if (dias === 1) cuando = "vence MAÑANA";
  else cuando = `vence en ${dias} dias (${pago.fecha_vencimiento})`;

  return `#${pago.id} ${pago.nombre} - ${pago.empresa} (${pago.categoria}) - $${formatMoneda(pago.monto)} - ${cuando}`;
}

function listaMensaje(titulo, pagos) {
  if (!pagos.length) return `${titulo}\n\nNo hay pagos pendientes en ese rango. 🎉`;
  const cuerpo = pagos.map(formatPago).join("\n\n");
  return `${titulo}\n\n${cuerpo}\n\n_Responde "pagado <numero>" para marcar un pago como realizado, ej: "pagado ${pagos[0].id}"_`;
}

const AYUDA = `👋 Hola, soy tu asistente de pagos. Manejo los pagos de varias empresas, así que siempre dime a cuál pertenece. Puedes escribirme en lenguaje natural, por ejemplo:

• "Programa en Coffee Parche el SOAT de la camioneta ABC123, vence el 5 de septiembre, son 350000, se repite cada año, avisame con 7 dias"
• "¿Qué pagos tiene Smart Latinoamérica esta semana?"
• "pagado 4" (marca el pago #4 como realizado)
• "elimina el pago 4"
• "avísame a mí" (activa los recordatorios diarios en este número)
• "cambia la hora del recordatorio a las 8am"

También puedes usar directamente: *hoy*, *semana*, *mes*, *vencidos*, *pendientes*.`;

module.exports = {
  enviarTexto,
  enviarPlantilla,
  enviarATodos,
  formatPago,
  formatPagoLinea,
  listaMensaje,
  formatMoneda,
  AYUDA,
};
