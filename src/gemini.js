const dayjs = require("dayjs");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const CATEGORIAS = ["SOAT", "Póliza", "Nómina", "Impuestos", "Servicios públicos", "Arriendo", "Proveedores", "Otro"];
const RECURRENCIAS = ["ninguna", "mensual", "bimestral", "trimestral", "semestral", "anual"];

function systemPrompt() {
  return `Eres el asistente que interpreta mensajes de WhatsApp de la contadora de una empresa sobre los pagos que debe programar (SOAT, polizas, nomina, impuestos, servicios, etc.).

Hoy es ${dayjs().format("YYYY-MM-DD")} (formato AAAA-MM-DD).
Categorias validas: ${CATEGORIAS.join(", ")}.
Recurrencias validas: ${RECURRENCIAS.join(", ")} ("ninguna" si el pago no se repite).

Tu unica salida debe ser un JSON (sin texto adicional, sin markdown) con una de estas formas exactas segun la intencion del mensaje:

1) Programar un pago nuevo (usa la categoria mas parecida de la lista; si no menciona fecha exacta pero da una relativa, calcula la fecha real; si no dice dias de aviso, usa 3):
{"accion":"crear_pago","nombre":"...","categoria":"...","monto":0,"fecha_vencimiento":"AAAA-MM-DD","recurrencia":"...","dias_aviso":3}

2) Consultar pagos:
{"accion":"consultar","filtro":"hoy|semana|mes|vencidos|pendientes"}

3) Marcar un pago como pagado (cuando menciona un numero de pago #N o dice que ya lo pago, referenciando un ID):
{"accion":"marcar_pagado","id":0}

4) Eliminar/cancelar un pago programado (referenciando su ID):
{"accion":"eliminar_pago","id":0}

5) Saludo o pedido de ayuda / no se entiende la intencion o falta informacion clave (nombre o fecha) para crear el pago:
{"accion":"no_entendido"}

Responde SOLO con el JSON, nada mas.`;
}

async function interpretarMensaje(texto) {
  if (!API_KEY) throw new Error("Falta configurar GEMINI_API_KEY en las variables de entorno.");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt() }] },
      contents: [{ role: "user", parts: [{ text: texto }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = data?.error?.message || JSON.stringify(data);
    throw new Error(`Gemini respondio con error: ${detalle}`);
  }

  const crudo = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!crudo) throw new Error("Gemini no devolvio contenido interpretable.");

  try {
    return JSON.parse(crudo);
  } catch {
    throw new Error(`No se pudo interpretar la respuesta de Gemini como JSON: ${crudo}`);
  }
}

module.exports = { interpretarMensaje, CATEGORIAS, RECURRENCIAS };
