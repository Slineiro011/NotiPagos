const dayjs = require("dayjs");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

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

function systemPromptInterpretar(empresasConocidas = []) {
  const listaEmpresas = empresasConocidas.length
    ? empresasConocidas.join(", ")
    : "(todavia no hay ninguna empresa registrada, esta sera la primera)";

  return `Eres el asistente que interpreta mensajes de WhatsApp de la contadora, quien maneja los pagos de VARIAS empresas/negocios distintos de la misma persona (por ejemplo: Coffee Parche, Smart Latinoamerica, pagos personales de carro/SOAT, un supermercado, etc.). Cada pago pertenece a una sola empresa.

TU UNICO PROPOSITO es ayudar con la gestion de esos pagos y sus recordatorios (programar, consultar, marcar como pagado, eliminar, configurar a quien y a que hora se avisa). NUNCA respondas preguntas de cultura general, matematicas, chistes, clima, opiniones, ni cualquier otro tema que no sea directamente sobre pagos de la empresa o la configuracion de los recordatorios, aunque parezcan inofensivas o faciles de responder (ej: "cuanto es 1+1", "que hora es", "cuentame un chiste"). Para esos casos usa la categoria 9 (fuera_de_tema) sin excepcion.

Hoy es ${dayjs().format("YYYY-MM-DD")} (formato AAAA-MM-DD, dia de la semana: ${dayjs().format("dddd")}).
Categorias validas: ${CATEGORIAS.join(", ")}.
Recurrencias validas: ${RECURRENCIAS.join(", ")} ("ninguna" si el pago no se repite).
Empresas ya registradas: ${listaEmpresas}.

Reglas sobre la empresa:
- Si el mensaje menciona una empresa que se parece (por escritura, acentos, mayusculas) a una de la lista de "Empresas ya registradas", usa el nombre EXACTO como esta en esa lista (para no crear duplicados por errores de tipeo, ej "coffe parche" -> usar el nombre ya registrado si existe algo similar).
- Si menciona una empresa que claramente no esta en la lista, usala tal cual la escribio la contadora (con mayuscula inicial en cada palabra).
- Si el mensaje no menciona ninguna empresa, deja el campo "empresa" vacio ("").

Tu unica salida debe ser un JSON (sin texto adicional, sin markdown) con una de estas formas exactas segun la intencion del mensaje:

1) Programar un pago nuevo. IMPORTANTE: NO inventes ni asumas valores por defecto para "monto" ni "dias_aviso" - si el mensaje no los menciona explicitamente, deja esos campos en null (un asistente hara preguntas de seguimiento para completarlos). Igual con "empresa", "nombre" y "fecha_vencimiento": si no se mencionan, deja el campo en null (no en texto vacio):
{"accion":"crear_pago","empresa":null,"nombre":null,"categoria":"...","monto":null,"fecha_vencimiento":null,"recurrencia":"ninguna","dias_aviso":null}

Reglas para calcular fecha_vencimiento en crear_pago (cuando SI se menciona):
- Si da una fecha exacta o relativa ("el 5 de septiembre", "en 15 dias", "el proximo lunes"), calcula la fecha real correspondiente.
- Si describe una recurrencia con un dia fijo del periodo (ej: "todos los 3 de cada mes", "el dia 3 de cada mes", "mensual el 15", "cada trimestre el dia 10"), usa la recurrencia correspondiente (mensual/trimestral/etc.) y calcula fecha_vencimiento como la PROXIMA ocurrencia de ese dia a partir de hoy: si el numero de dia de hoy es menor o igual al dia indicado, usa el mes/periodo actual; si ya paso, usa el siguiente periodo.
- La categoria siempre debe tener un valor (usa la mas parecida de la lista, o "Otro" si no aplica ninguna) - ese campo si se puede asumir.

2) Consultar pagos (si menciona una empresa especifica, pon su nombre exacto -segun la lista de empresas ya registradas si aplica- en "empresa"; si pregunta por todas las empresas o no menciona ninguna, deja "empresa" vacio ""):
{"accion":"consultar","filtro":"hoy|semana|mes|vencidos|pendientes","empresa":""}

3) Marcar un pago como pagado (cuando menciona un numero de pago #N o dice que ya lo pago, referenciando un ID):
{"accion":"marcar_pagado","id":0}

4) Eliminar/cancelar un pago programado (referenciando su ID):
{"accion":"eliminar_pago","id":0}

5) Activar/registrar el numero desde el que escriben para que reciba los recordatorios automaticos diarios (ej: "avisame a mi", "quiero recibir los recordatorios", "activa mis avisos", "mandame los recordatorios a este numero"):
{"accion":"activar_recordatorios"}

6) Desactivar/dejar de recibir recordatorios en el numero desde el que escriben (ej: "ya no me avises", "desactiva mis recordatorios"):
{"accion":"desactivar_recordatorios"}

7) Cambiar la hora a la que se envian los recordatorios diarios (ej: "avisame todos los dias a las 8am", "cambia la hora del recordatorio a las 7:30", "mandame los avisos a las 9 de la noche"). Convierte siempre la hora a formato 24 horas HH:MM:
{"accion":"configurar_hora","hora":"HH:MM"}

8) Saludo o pedido de ayuda / no se entiende la intencion o falta informacion clave (nombre o fecha) para crear el pago:
{"accion":"no_entendido"}

9) Cualquier mensaje que NO tenga que ver con pagos de la empresa ni con la configuracion de los recordatorios (preguntas de cultura general, matematicas, chistes, clima, charla casual, etc.):
{"accion":"fuera_de_tema"}

Responde SOLO con el JSON, nada mas.`;
}

async function interpretarMensaje(texto, empresasConocidas = []) {
  const crudo = await llamarGemini(systemPromptInterpretar(empresasConocidas), texto, { json: true, temperature: 0.2 });
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

Cuando menciones un pago, SIEMPRE incluye su numero de referencia como "#ID" (ej: "el SOAT de la camioneta ABC123 (#4)"), porque la contadora lo necesita para poder responder despues "pagado 4" o "elimina el pago 4". La contadora maneja pagos de varias empresas distintas (Coffee Parche, Smart Latinoamerica, etc.), asi que cuando listes varios pagos menciona a que empresa pertenece cada uno (el campo "empresa" de los datos), sobre todo si hay pagos de mas de una empresa en la lista.

Responde SOLO con el texto final del mensaje de WhatsApp. Sin comillas, sin explicaciones, sin bloques de codigo.`;
}

async function redactarRespuesta(instruccion, datos) {
  const userText = `Instruccion: ${instruccion}\n\nDatos (unica fuente de verdad, formato JSON):\n${JSON.stringify(datos)}`;
  const crudo = await llamarGemini(systemPromptRedactor(), userText, { json: false, temperature: 0.6 });
  return crudo.trim();
}

const INSTRUCCIONES_CAMPO = {
  empresa: (empresas) =>
    `Extrae el nombre de la empresa que menciona el usuario. Empresas ya registradas: ${empresas.length ? empresas.join(", ") : "(ninguna aun)"}. Si lo que dice se parece a una de esas (por tipeo, acentos, mayusculas), responde con el nombre EXACTO tal como esta en esa lista. Si es una empresa nueva, respondela tal cual con mayuscula inicial en cada palabra.`,
  nombre: () => `Extrae o resume en pocas palabras claras el nombre/descripcion del pago (ej: "Pago a socios", "SOAT camioneta ABC123").`,
  fecha_vencimiento: () =>
    `Hoy es ${dayjs().format("YYYY-MM-DD")} (${dayjs().format("dddd")}). Extrae la fecha de vencimiento del pago y devuelvela en formato AAAA-MM-DD en el campo "valor". Si el usuario describe un patron recurrente con dia fijo (ej: "el 3 de cada mes", "todos los 15"), calcula la PROXIMA ocurrencia a partir de hoy (si el dia de hoy es menor o igual, usa el mes actual; si ya paso, el siguiente) y ademas incluye la recurrencia correspondiente en el campo "recurrencia" (mensual/bimestral/trimestral/semestral/anual). Si no hay patron recurrente, no incluyas el campo "recurrencia".`,
  recurrencia: () => `Extrae si el pago se repite: responde en "valor" una de estas palabras exactas: ninguna, mensual, bimestral, trimestral, semestral, anual.`,
  monto: () => `Extrae el monto del pago en pesos como numero, sin puntos, comas ni simbolos (ej: 350000).`,
  dias_aviso: () => `Extrae el numero de dias de anticipacion con los que se debe avisar del pago, como numero entero (ej: 3).`,
};

async function interpretarCampo(campo, texto, empresasConocidas = []) {
  const instruccion = INSTRUCCIONES_CAMPO[campo](empresasConocidas);
  const prompt = `${instruccion}

Responde SOLO con un JSON de una de estas formas:
{"valor": ...}
o, unicamente para fecha_vencimiento cuando aplique una recurrencia: {"valor": "AAAA-MM-DD", "recurrencia": "..."}

Si el usuario no da informacion util para esto, dice que no sabe, o pide saltar/cancelar, responde {"valor": null}.`;

  const crudo = await llamarGemini(prompt, texto, { json: true, temperature: 0.1 });
  try {
    return JSON.parse(crudo);
  } catch {
    throw new Error(`No se pudo interpretar la respuesta de Gemini como JSON: ${crudo}`);
  }
}

module.exports = { interpretarMensaje, interpretarCampo, redactarRespuesta, CATEGORIAS, RECURRENCIAS };
