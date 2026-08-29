const dayjs = require("dayjs");
const paymentsService = require("./services/paymentsService");
const settingsService = require("./services/settingsService");
const whatsapp = require("./whatsapp");
const gemini = require("./gemini");

async function responder(numero, texto) {
  try {
    await whatsapp.enviarTexto(numero, texto);
    console.log(`[conversacion] Respondido a ${numero} correctamente.`);
  } catch (err) {
    console.error("No se pudo responder por WhatsApp:", err.message);
  }
}

function datosParaGemini(pago) {
  const hoy = dayjs().startOf("day");
  return {
    id: pago.id,
    nombre: pago.nombre,
    categoria: pago.categoria,
    monto: pago.monto,
    fecha_vencimiento: pago.fecha_vencimiento,
    dias_restantes: dayjs(pago.fecha_vencimiento).startOf("day").diff(hoy, "day"),
    recurrencia: pago.recurrencia,
  };
}

/** Responde con una redaccion natural via Gemini; si falla, usa la plantilla fija de respaldo. */
async function responderConRedaccion(numero, instruccion, datos, textoRespaldo) {
  try {
    const texto = await gemini.redactarRespuesta(instruccion, datos);
    return responder(numero, texto);
  } catch (err) {
    console.error("Gemini fallo redactando la respuesta, uso plantilla fija:", err.message);
    return responder(numero, textoRespaldo);
  }
}

const FILTROS = {
  hoy: { descripcion: "los pagos que vencen HOY", titulo: "📅 Pagos que vencen HOY:", obtener: paymentsService.getDeHoy },
  semana: { descripcion: "los pagos que vencen en los próximos 7 días", titulo: "📅 Pagos de los próximos 7 días:", obtener: paymentsService.getDeLaSemana },
  mes: { descripcion: "los pagos que vencen en los próximos 30 días", titulo: "📅 Pagos de los próximos 30 días:", obtener: paymentsService.getDelMes },
  vencidos: { descripcion: "los pagos que ya están vencidos (atrasados)", titulo: "⚠️ Pagos vencidos:", obtener: paymentsService.getVencidos },
  pendientes: { descripcion: "todos los pagos pendientes", titulo: "📋 Todos los pagos pendientes:", obtener: paymentsService.getPendientes },
};

async function consultar(numero, filtro, textoOriginal) {
  const entrada = FILTROS[filtro] || FILTROS.pendientes;
  const pagos = await entrada.obtener();
  const datos = pagos.map(datosParaGemini);

  return responderConRedaccion(
    numero,
    `La contadora pregunto: "${textoOriginal || entrada.descripcion}". Cuentale de forma natural cuales son ${entrada.descripcion}.`,
    datos,
    whatsapp.listaMensaje(entrada.titulo, pagos)
  );
}

async function marcarPagado(numero, id) {
  const pago = await paymentsService.getById(id);
  if (!pago) return responder(numero, `No encontré ningún pago con el número #${id}.`);
  await paymentsService.marcarPagado(id);
  return responderConRedaccion(
    numero,
    "La contadora acaba de marcar este pago como realizado. Confirmaselo de forma breve y natural.",
    datosParaGemini(pago),
    `✅ Marqué como pagado: *${pago.nombre}* ($${whatsapp.formatMoneda(pago.monto)}).`
  );
}

async function eliminarPago(numero, id) {
  const pago = await paymentsService.getById(id);
  if (!pago) return responder(numero, `No encontré ningún pago con el número #${id}.`);
  await paymentsService.remove(id);
  return responder(numero, `🗑️ Eliminé el pago: *${pago.nombre}*.`);
}

async function crearPago(numero, datos, textoOriginal) {
  if (!datos.nombre || !datos.fecha_vencimiento || !dayjs(datos.fecha_vencimiento, "YYYY-MM-DD", true).isValid()) {
    return responder(
      numero,
      "Me falta información para programar ese pago (necesito al menos el nombre y la fecha de vencimiento). ¿Puedes darme más detalles?"
    );
  }
  const pago = await paymentsService.create({
    nombre: datos.nombre,
    categoria: datos.categoria || "Otro",
    monto: datos.monto || 0,
    fecha_vencimiento: datos.fecha_vencimiento,
    recurrencia: paymentsService.RECURRENCIAS.includes(datos.recurrencia) ? datos.recurrencia : "ninguna",
    dias_aviso: Number.isFinite(datos.dias_aviso) ? datos.dias_aviso : 3,
    notas: "",
  });

  return responderConRedaccion(
    numero,
    `La contadora pidio programar este pago (mensaje original: "${textoOriginal || ""}") y ya quedo guardado exitosamente. Confirmaselo de forma natural, mencionando nombre, monto, fecha de vencimiento y si se repite. Aclarale al final, en una frase corta, que si algo esta mal puede escribir "elimina el pago ${pago.id}".`,
    datosParaGemini(pago),
    `✅ Pago programado:\n\n${whatsapp.formatPago(pago)}\n\n_Si algo está mal, escribe "elimina el pago ${pago.id}" y vuelve a intentarlo._`
  );
}

async function activarRecordatorios(numero) {
  await settingsService.agregarNumero(numero);
  const hora = (await settingsService.get("hora_recordatorio")) || "08:00";
  return responder(
    numero,
    `✅ Listo, quedaste registrada para recibir los recordatorios de pago todos los días a las ${hora}. Si quieres cambiar la hora, solo dime algo como "avísame a las 7:30".`
  );
}

async function desactivarRecordatorios(numero) {
  await settingsService.quitarNumero(numero);
  return responder(numero, "🔕 Listo, ya no te voy a mandar recordatorios automáticos a este número. Puedes seguir preguntándome por los pagos cuando quieras.");
}

async function configurarHora(numero, hora) {
  if (!/^\d{2}:\d{2}$/.test(hora || "")) {
    return responder(numero, "No logré entender la hora. ¿Puedes decirla de nuevo? (ej: 'avísame a las 8am' o 'cambia la hora a las 19:30')");
  }
  await settingsService.set("hora_recordatorio", hora);
  return responder(numero, `⏰ Listo, los recordatorios diarios ahora salen a las ${hora}.`);
}

async function manejarMensaje(numero, textoOriginal) {
  const texto = (textoOriginal || "").trim();
  if (!texto) return;
  const textoLower = texto.toLowerCase();

  const matchPagado = textoLower.match(/^pagad[oa]?\s+(\d+)$/) || textoLower.match(/^pagu[ée]\s+(\d+)$/);
  if (matchPagado) return marcarPagado(numero, Number(matchPagado[1]));

  const matchEliminar = textoLower.match(/^(?:elimina|borra|cancela)r?\s+(?:el\s+)?pago\s+(\d+)$/);
  if (matchEliminar) return eliminarPago(numero, Number(matchEliminar[1]));

  if (/^hoy$/.test(textoLower)) return consultar(numero, "hoy", texto);
  if (/^semana$/.test(textoLower)) return consultar(numero, "semana", texto);
  if (/^mes$/.test(textoLower)) return consultar(numero, "mes", texto);
  if (/^(vencidos|atrasados)$/.test(textoLower)) return consultar(numero, "vencidos", texto);
  if (/^(pendientes|pagos)$/.test(textoLower)) return consultar(numero, "pendientes", texto);
  if (/^(hola|ayuda|menu|menú)$/.test(textoLower)) return responder(numero, whatsapp.AYUDA);

  let intencion;
  try {
    intencion = await gemini.interpretarMensaje(texto);
  } catch (err) {
    console.error("Error interpretando mensaje con Gemini:", err.message);
    return responder(numero, "Tuve un problema entendiendo tu mensaje. Intenta de nuevo o escribe *ayuda*.");
  }

  switch (intencion.accion) {
    case "crear_pago":
      return crearPago(numero, intencion, texto);
    case "consultar":
      return consultar(numero, intencion.filtro, texto);
    case "marcar_pagado":
      return marcarPagado(numero, intencion.id);
    case "eliminar_pago":
      return eliminarPago(numero, intencion.id);
    case "activar_recordatorios":
      return activarRecordatorios(numero);
    case "desactivar_recordatorios":
      return desactivarRecordatorios(numero);
    case "configurar_hora":
      return configurarHora(numero, intencion.hora);
    case "fuera_de_tema":
      return responder(numero, "Lo siento, no puedo ayudarte con eso 🙏 Solo puedo ayudarte con los pagos de la empresa y sus recordatorios. Escribe *ayuda* si quieres ver qué puedo hacer.");
    default:
      return responder(numero, whatsapp.AYUDA);
  }
}

module.exports = { manejarMensaje };
