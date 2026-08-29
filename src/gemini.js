const dayjs = require("dayjs");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const CATEGORIAS = ["SOAT", "Póliza", "Nómina", "Impuestos", "Servicios públicos", "Arriendo", "Proveedores", "Otro"];
const RECURRENCIAS = ["ninguna", "mensual", "bimestral", "trimestral", "semestral", "anual"];

async function llamarGemini(systemInstructionText, userText, { json = false, temperature = 0.3 } = {}) {
  if (!API_KEY) throw new Error("Falta configurar GEMINI_API_KEY en las variables de entorno.");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstructionText }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        temperature,
        ...(json ? { responseMimeType: "application/json" } : {}),
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
  return crudo;
}

function systemPromptInterpretar() {
  return `Eres el asistente que interpreta mensajes de WhatsApp de la contadora de una empresa sobre los pagos que debe programar (SOAT, polizas, nomina, impuestos, servicios, etc.).

Hoy es ${dayjs().format("YYYY-MM-DD")} (formato AAAA-MM-DD, dia de la semana: ${dayjs().format("dddd")}).
Categorias validas: ${CATEGORIAS.join(", ")}.
Recurrencias validas: ${RECURRENCIAS.join(", ")} ("ninguna" si el pago no se repite).

Tu unica salida debe ser un JSON (sin texto adicional, sin markdown) con una de estas formas exactas segun la intencion del mensaje:

1) Programar un pago nuevo (usa la categoria mas parecida de la lista; si no dice dias de aviso, usa 3):
{"accion":"crear_pago","nombre":"...","categoria":"...","monto":0,"fecha_vencimiento":"AAAA-MM-DD","recurrencia":"...","dias_aviso":3}

Reglas para calcular fecha_vencimiento en crear_pago:
- Si da una fecha exacta o relativa ("el 5 de septiembre", "en 15 dias", "el proximo lunes"), calcula la fecha real correspondiente.
- Si describe una recurrencia con un dia fijo del periodo (ej: "todos los 3 de cada mes", "el dia 3 de cada mes", "mensual el 15", "cada trimestre el dia 10"), usa la recurrencia correspondiente (mensual/trimestral/etc.) y calcula fecha_vencimiento como la PROXIMA ocurrencia de ese dia a partir de hoy: si el numero de dia de hoy es menor o igual al dia indicado, usa el mes/periodo actual; si ya paso, usa el siguiente periodo.

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
  const crudo = await llamarGemini(systemPromptInterpretar(), texto, { json: true, temperature: 0.2 });
  try {
    return JSON.parse(crudo);
  } catch {
    throw new Error(`No se pudo interpretar la respuesta de Gemini como JSON: ${crudo}`);
  }
}

function systemPromptRedactor() {
  return `Eres el asistente de WhatsApp de la contadora de una empresa. Tu trabajo es avisarle y contarle sobre los pagos que debe hacer (SOAT, polizas, nomina, impuestos, servicios, etc.), de forma breve, cordial y natural, como si fueras una persona escribiendole por WhatsApp. Puedes usar emojis con moderacion (maximo 2-3 por mensaje). No uses saludos largos ni te presentes, ve directo al punto.

Hoy es ${dayjs().format("YYYY-MM-DD")}.

REGLA MAS IMPORTANTE: Solo puedes hablar de los datos que te paso en la instruccion (formato JSON). Es tu UNICA fuente de verdad: nunca inventes ni calcules montos, fechas, nombres de pagos o IDs distintos a los que te doy. Si la lista de pagos esta vacia, dilo de forma natural (ej. "vas al dia, no tienes pagos pendientes en ese rango 🎉").

Cuando menciones un pago, SIEMPRE incluye su numero de referencia como "#ID" (ej: "el SOAT de la camioneta ABC123 (#4)"), porque la contadora lo necesita para poder responder despues "pagado 4" o "elimina el pago 4".

Responde SOLO con el texto final del mensaje de WhatsApp. Sin comillas, sin explicaciones, sin bloques de codigo.`;
}

async function redactarRespuesta(instruccion, datos) {
  const userText = `Instruccion: ${instruccion}\n\nDatos (unica fuente de verdad, formato JSON):\n${JSON.stringify(datos)}`;
  const crudo = await llamarGemini(systemPromptRedactor(), userText, { json: false, temperature: 0.6 });
  return crudo.trim();
}

module.exports = { interpretarMensaje, redactarRespuesta, CATEGORIAS, RECURRENCIAS };
