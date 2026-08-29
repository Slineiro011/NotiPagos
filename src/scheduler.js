const cron = require("node-cron");
const dayjs = require("dayjs");

const paymentsService = require("./services/paymentsService");
const settingsService = require("./services/settingsService");
const whatsapp = require("./whatsapp");

async function ejecutarRevisionDiaria() {
  const hoy = dayjs().format("YYYY-MM-DD");
  const pendientes = await paymentsService.getPendientes();

  const aAvisar = [];
  for (const pago of pendientes) {
    const dias = dayjs(pago.fecha_vencimiento).startOf("day").diff(dayjs().startOf("day"), "day");
    const dentroDeVentana = dias <= (pago.dias_aviso ?? 3);
    if (dentroDeVentana && !(await paymentsService.yaSeAviso(pago.id, hoy))) {
      aAvisar.push(pago);
    }
  }

  if (!aAvisar.length) return { avisados: 0 };

  const numeros = await settingsService.getNumerosWhatsapp();
  if (!numeros.length) {
    console.warn("No hay numeros de WhatsApp configurados para enviar recordatorios.");
    return { avisados: 0, error: "sin_numeros" };
  }

  let avisados = 0;
  for (const pago of aAvisar) {
    // Recordatorio automatico proactivo: usa plantilla aprobada (funciona fuera de la ventana de 24h).
    const textoVariable = whatsapp.formatPago(pago);
    const resultados = await whatsapp.enviarATodos(numeros, textoVariable, { plantilla: true });
    const algunoOk = resultados.some((r) => r.ok);
    if (algunoOk) {
      await paymentsService.registrarAviso(pago.id, hoy);
      avisados++;
    } else {
      console.error(`No se pudo enviar el recordatorio del pago #${pago.id}:`, resultados);
    }
  }
  return { avisados };
}

function iniciar() {
  let ultimaEjecucion = null;

  cron.schedule("* * * * *", async () => {
    const horaConfigurada = (await settingsService.get("hora_recordatorio")) || "08:00";
    const horaActual = dayjs().format("HH:mm");
    const marca = horaActual + dayjs().format("YYYY-MM-DD");
    if (horaActual !== horaConfigurada || ultimaEjecucion === marca) return;
    ultimaEjecucion = marca;

    try {
      await ejecutarRevisionDiaria();
    } catch (err) {
      console.error("Error en la revision diaria de pagos:", err);
    }
  });

  console.log("Programador de recordatorios iniciado (revision interna cada minuto).");
}

module.exports = { iniciar, ejecutarRevisionDiaria };
