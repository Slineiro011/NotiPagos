const cron = require("node-cron");
const dayjs = require("dayjs");

const paymentsService = require("./services/paymentsService");
const settingsService = require("./services/settingsService");
const usuariosService = require("./services/usuariosService");
const dispositivosService = require("./services/dispositivosService");
const cuentasService = require("./services/cuentasService");
const whatsapp = require("./whatsapp");
const push = require("./push");

async function ejecutarRevisionDiaria(cuentaId) {
  const hoy = dayjs().format("YYYY-MM-DD");
  const pendientes = await paymentsService.getPendientes(undefined, undefined, undefined, cuentaId);

  const aAvisar = [];
  for (const pago of pendientes) {
    const dias = dayjs(pago.fecha_vencimiento).startOf("day").diff(dayjs().startOf("day"), "day");
    const dentroDeVentana = dias <= (pago.dias_aviso ?? 3);
    if (dentroDeVentana && !(await paymentsService.yaSeAviso(pago.id, hoy))) {
      aAvisar.push(pago);
    }
  }

  if (!aAvisar.length) return { avisados: 0 };

  const numerosGlobales = await settingsService.getNumerosWhatsapp(cuentaId);

  let avisados = 0;
  for (const pago of aAvisar) {
    let algunoOk = false;

    // El recordatorio solo debe llegarle a quien creo el pago (no a todo el
    // mundo). Los pagos antiguos sin dueño (antes de que existiera el login
    // multiusuario) siguen usando la configuracion global como respaldo.
    const creador = pago.creado_por ? await usuariosService.getByUsuario(pago.creado_por) : null;
    const numerosDestino = creador?.telefono ? [creador.telefono] : numerosGlobales;
    const tokensDestino = creador
      ? await dispositivosService.getTokensDeUsuario(creador.usuario)
      : await dispositivosService.getTokensDeCuenta(cuentaId);

    // Canal 1: WhatsApp. Recordatorio automatico proactivo, usa plantilla aprobada
    // (funciona fuera de la ventana de 24h).
    if (numerosDestino.length) {
      const textoVariable = whatsapp.formatPagoLinea(pago);
      const resultadosWhatsapp = await whatsapp.enviarATodos(numerosDestino, textoVariable, { plantilla: true });
      if (resultadosWhatsapp.some((r) => r.ok)) algunoOk = true;
      else console.error(`No se pudo enviar el recordatorio de WhatsApp del pago #${pago.id}:`, resultadosWhatsapp);
    }

    // Canal 2: notificacion push a la app movil (independiente de WhatsApp).
    const resultadoPush = await push.enviarATokens(tokensDestino, {
      titulo: "🔔 Recordatorio de pago",
      cuerpo: whatsapp.formatPagoLinea(pago),
      datos: { pagoId: String(pago.id) },
    });
    console.log(`[push] Resultado para el pago #${pago.id}:`, resultadoPush);
    if (resultadoPush.enviados > 0) algunoOk = true;

    if (algunoOk) {
      await paymentsService.registrarAviso(pago.id, hoy);
      avisados++;
    }
  }
  return { avisados };
}

// Cada cuenta tiene su propia hora de recordatorio, asi que se recuerda la
// ultima ejecucion por cuenta (no una sola marca global). Se comparte entre
// el cron interno y el endpoint /api/cron/revisar (disparado por un cron
// externo) para que no se avise dos veces en el mismo minuto.
const ultimaEjecucionPorCuenta = new Map();

/** Revisa todas las cuentas y ejecuta la revision diaria de la(s) que les toque a esta hora. */
async function revisarTodasLasCuentas() {
  const horaActual = dayjs().format("HH:mm");
  const marcaDeHoy = horaActual + dayjs().format("YYYY-MM-DD");
  const cuentaIds = await cuentasService.listarIds();

  const resultados = {};
  for (const cuentaId of cuentaIds) {
    try {
      const horaConfigurada = (await settingsService.get(cuentaId, "hora_recordatorio")) || "08:00";
      if (horaActual !== horaConfigurada || ultimaEjecucionPorCuenta.get(cuentaId) === marcaDeHoy) continue;
      ultimaEjecucionPorCuenta.set(cuentaId, marcaDeHoy);
      // Las cuentas sin prueba ni suscripcion vigente no reciben recordatorios
      // (cada uno cuesta WhatsApp/push).
      const cuenta = await cuentasService.getConAccesoActualizado(cuentaId);
      if (!cuenta || !cuentasService.tieneAcceso(cuenta)) continue;
      resultados[cuentaId] = await ejecutarRevisionDiaria(cuentaId);
    } catch (err) {
      console.error(`Error en la revision diaria de pagos (cuenta ${cuentaId}):`, err);
    }
  }
  return resultados;
}

function iniciar() {
  cron.schedule("* * * * *", async () => {
    try {
      await revisarTodasLasCuentas();
    } catch (err) {
      console.error("Error listando cuentas para el programador:", err);
    }
  });

  console.log("Programador de recordatorios iniciado (revision interna cada minuto).");
}

module.exports = { iniciar, ejecutarRevisionDiaria, revisarTodasLasCuentas };
