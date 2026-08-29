const dayjs = require("dayjs");
const paymentsService = require("./services/paymentsService");
const settingsService = require("./services/settingsService");
const borradoresService = require("./services/borradoresService");
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
    empresa: pago.empresa,
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

async function consultar(numero, filtro, textoOriginal, empresa) {
  const entrada = FILTROS[filtro] || FILTROS.pendientes;
  const pagos = await entrada.obtener(empresa || undefined);
  const datos = pagos.map(datosParaGemini);
  const contexto = empresa ? `${entrada.descripcion} de la empresa "${empresa}"` : entrada.descripcion;
  const titulo = empresa ? `${entrada.titulo} (${empresa})` : entrada.titulo;

  return responderConRedaccion(
    numero,
    `La contadora pregunto: "${textoOriginal || contexto}". Cuentale de forma natural cuales son ${contexto}.`,
    datos,
    whatsapp.listaMensaje(titulo, pagos)
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

// Campos obligatorios para crear un pago, en el orden en que se preguntan si faltan.
const CAMPOS_REQUERIDOS = [
  { campo: "empresa", pregunta: "¿A qué empresa pertenece este pago?" },
  { campo: "nombre", pregunta: "¿Cómo quieres que se llame este pago? (ej: SOAT camioneta ABC123, Pago a socios...)" },
  { campo: "fecha_vencimiento", pregunta: "¿Cuándo vence? (puedes decir una fecha, o algo como 'el día 3 de cada mes')" },
  { campo: "monto", pregunta: "¿Cuál es el monto?" },
  { campo: "dias_aviso", pregunta: "¿Con cuántos días de anticipación quieres que te lo recuerde?" },
];

function normalizarDatosPago(datos) {
  const fechaValida =
    datos.fecha_vencimiento && dayjs(datos.fecha_vencimiento, "YYYY-MM-DD", true).isValid()
      ? datos.fecha_vencimiento
      : null;
  return {
    empresa: datos.empresa || null,
    nombre: datos.nombre || null,
    categoria: datos.categoria || "Otro",
    fecha_vencimiento: fechaValida,
    recurrencia: paymentsService.RECURRENCIAS.includes(datos.recurrencia) ? datos.recurrencia : "ninguna",
    monto: typeof datos.monto === "number" && datos.monto > 0 ? datos.monto : null,
    dias_aviso: Number.isFinite(datos.dias_aviso) ? datos.dias_aviso : null,
  };
}

function primerCampoFaltante(datos) {
  return CAMPOS_REQUERIDOS.find((c) => !datos[c.campo] && datos[c.campo] !== 0);
}

async function crearPagoFinal(numero, datos) {
  const pago = await paymentsService.create({
    empresa: datos.empresa,
    nombre: datos.nombre,
    categoria: datos.categoria || "Otro",
    monto: datos.monto,
    fecha_vencimiento: datos.fecha_vencimiento,
    recurrencia: paymentsService.RECURRENCIAS.includes(datos.recurrencia) ? datos.recurrencia : "ninguna",
    dias_aviso: datos.dias_aviso,
    notas: "",
  });

  return responderConRedaccion(
    numero,
    `Ya se termino de reunir toda la informacion y este pago quedo guardado exitosamente. Confirmaselo de forma natural, mencionando empresa, nombre, monto, fecha de vencimiento y si se repite. Aclarale al final, en una frase corta, que si algo esta mal puede escribir "elimina el pago ${pago.id}".`,
    datosParaGemini(pago),
    `✅ Pago programado:\n\n${whatsapp.formatPago(pago)}\n\n_Si algo está mal, escribe "elimina el pago ${pago.id}" y vuelve a intentarlo._`
  );
}

/** Punto de entrada cuando Gemini detecta la intencion de crear un pago (primer mensaje). */
async function crearOPreguntar(numero, datosParciales) {
  const datos = normalizarDatosPago(datosParciales);
  const faltante = primerCampoFaltante(datos);

  if (!faltante) return crearPagoFinal(numero, datos);

  await borradoresService.guardar(numero, datos);
  return responder(numero, faltante.pregunta);
}

/** El numero tiene un pago a medio armar: esta respuesta completa el campo que faltaba. */
async function continuarBorrador(numero, borrador, texto) {
  if (/^(cancela|cancelar|olv[ií]dalo|nada|ya no)$/i.test(texto.trim())) {
    await borradoresService.borrar(numero);
    return responder(numero, "Listo, cancelé el pago que estábamos armando. ¿Algo más?");
  }

  const campoActual = primerCampoFaltante(borrador);
  if (!campoActual) {
    await borradoresService.borrar(numero);
    return crearPagoFinal(numero, borrador);
  }

  let resultado;
  try {
    const empresasConocidas = campoActual.campo === "empresa" ? await paymentsService.getEmpresas() : [];
    resultado = await gemini.interpretarCampo(campoActual.campo, texto, empresasConocidas);
  } catch (err) {
    console.error("Error interpretando respuesta de campo pendiente:", err.message);
    return responder(numero, "No logré entenderlo, ¿puedes intentar de nuevo?");
  }

  if (resultado.valor === null || resultado.valor === undefined || resultado.valor === "") {
    return responder(numero, `No logré entenderlo. ${campoActual.pregunta}`);
  }

  const actualizado = { ...borrador, [campoActual.campo]: resultado.valor };
  if (campoActual.campo === "fecha_vencimiento" && resultado.recurrencia) {
    actualizado.recurrencia = resultado.recurrencia;
  }

  const siguienteFaltante = primerCampoFaltante(actualizado);
  if (siguienteFaltante) {
    await borradoresService.guardar(numero, actualizado);
    return responder(numero, siguienteFaltante.pregunta);
  }

  await borradoresService.borrar(numero);
  return crearPagoFinal(numero, actualizado);
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

  // Si hay un pago a medio armar para este numero, esta respuesta completa el siguiente dato pendiente.
  const borrador = await borradoresService.get(numero);
  if (borrador) return continuarBorrador(numero, borrador, texto);

  let intencion;
  try {
    const empresasConocidas = await paymentsService.getEmpresas();
    intencion = await gemini.interpretarMensaje(texto, empresasConocidas);
  } catch (err) {
    console.error("Error interpretando mensaje con Gemini:", err.message);
    return responder(numero, "Tuve un problema entendiendo tu mensaje. Intenta de nuevo o escribe *ayuda*.");
  }

  switch (intencion.accion) {
    case "crear_pago":
      return crearOPreguntar(numero, intencion);
    case "consultar":
      return consultar(numero, intencion.filtro, texto, intencion.empresa);
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
