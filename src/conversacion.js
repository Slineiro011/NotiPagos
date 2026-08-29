const dayjs = require("dayjs");
const paymentsService = require("./services/paymentsService");
const whatsapp = require("./whatsapp");
const gemini = require("./gemini");

async function responder(numero, texto) {
  try {
    await whatsapp.enviarTexto(numero, texto);
  } catch (err) {
    console.error("No se pudo responder por WhatsApp:", err.message);
  }
}

async function consultar(numero, filtro) {
  const mapa = {
    hoy: ["📅 Pagos que vencen HOY:", paymentsService.getDeHoy],
    semana: ["📅 Pagos de los próximos 7 días:", paymentsService.getDeLaSemana],
    mes: ["📅 Pagos de los próximos 30 días:", paymentsService.getDelMes],
    vencidos: ["⚠️ Pagos vencidos:", paymentsService.getVencidos],
    pendientes: ["📋 Todos los pagos pendientes:", paymentsService.getPendientes],
  };
  const entrada = mapa[filtro] || mapa.pendientes;
  const [titulo, obtener] = entrada;
  const pagos = await obtener();
  return responder(numero, whatsapp.listaMensaje(titulo, pagos));
}

async function marcarPagado(numero, id) {
  const pago = await paymentsService.getById(id);
  if (!pago) return responder(numero, `No encontré ningún pago con el número #${id}.`);
  await paymentsService.marcarPagado(id);
  return responder(numero, `✅ Marqué como pagado: *${pago.nombre}* ($${whatsapp.formatMoneda(pago.monto)}).`);
}

async function eliminarPago(numero, id) {
  const pago = await paymentsService.getById(id);
  if (!pago) return responder(numero, `No encontré ningún pago con el número #${id}.`);
  await paymentsService.remove(id);
  return responder(numero, `🗑️ Eliminé el pago: *${pago.nombre}*.`);
}

async function crearPago(numero, datos) {
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
  return responder(
    numero,
    `✅ Pago programado:\n\n${whatsapp.formatPago(pago)}\n\n_Si algo está mal, escribe "elimina el pago ${pago.id}" y vuelve a intentarlo._`
  );
}

async function manejarMensaje(numero, textoOriginal) {
  const texto = (textoOriginal || "").trim();
  if (!texto) return;
  const textoLower = texto.toLowerCase();

  const matchPagado = textoLower.match(/^pagad[oa]?\s+(\d+)$/) || textoLower.match(/^pagu[ée]\s+(\d+)$/);
  if (matchPagado) return marcarPagado(numero, Number(matchPagado[1]));

  const matchEliminar = textoLower.match(/^(?:elimina|borra|cancela)r?\s+(?:el\s+)?pago\s+(\d+)$/);
  if (matchEliminar) return eliminarPago(numero, Number(matchEliminar[1]));

  if (/^hoy$/.test(textoLower)) return consultar(numero, "hoy");
  if (/^semana$/.test(textoLower)) return consultar(numero, "semana");
  if (/^mes$/.test(textoLower)) return consultar(numero, "mes");
  if (/^(vencidos|atrasados)$/.test(textoLower)) return consultar(numero, "vencidos");
  if (/^(pendientes|pagos)$/.test(textoLower)) return consultar(numero, "pendientes");
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
      return crearPago(numero, intencion);
    case "consultar":
      return consultar(numero, intencion.filtro);
    case "marcar_pagado":
      return marcarPagado(numero, intencion.id);
    case "eliminar_pago":
      return eliminarPago(numero, intencion.id);
    default:
      return responder(numero, whatsapp.AYUDA);
  }
}

module.exports = { manejarMensaje };
