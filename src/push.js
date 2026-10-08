const fs = require("fs");
const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const dispositivosService = require("./services/dispositivosService");

// En Render se sube como "Secret File" en /etc/secrets/firebase-service-account.json.
// En local, se puede poner el mismo archivo en la raiz del proyecto (esta en .gitignore).
const RUTA_CREDENCIAL =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "/etc/secrets/firebase-service-account.json";
const RUTA_CREDENCIAL_LOCAL = "./firebase-service-account.json";

let appInicializada = null;

function obtenerApp() {
  if (appInicializada) return appInicializada;

  const ruta = fs.existsSync(RUTA_CREDENCIAL)
    ? RUTA_CREDENCIAL
    : fs.existsSync(RUTA_CREDENCIAL_LOCAL)
    ? RUTA_CREDENCIAL_LOCAL
    : null;

  if (!ruta) {
    console.warn(
      "No se encontro la credencial de Firebase (firebase-service-account.json). Las notificaciones push estan desactivadas."
    );
    return null;
  }

  const credencial = JSON.parse(fs.readFileSync(ruta, "utf8"));
  appInicializada = initializeApp({ credential: cert(credencial) });
  return appInicializada;
}

/** Envia una notificacion push a todos los dispositivos registrados. Nunca lanza. */
async function enviarATodos({ titulo, cuerpo, datos = {} }) {
  const tokens = await dispositivosService.getTokens();
  return enviarATokens(tokens, { titulo, cuerpo, datos });
}

/** Envia una notificacion push solo a los tokens indicados. Nunca lanza. */
async function enviarATokens(tokens, { titulo, cuerpo, datos = {} }) {
  const app = obtenerApp();
  if (!app) return { enviados: 0, motivo: "sin_credencial" };
  if (!tokens.length) return { enviados: 0, motivo: "sin_dispositivos" };

  // Mensaje de "solo datos" (sin bloque "notification"): asi Android siempre
  // lo entrega a la app (aunque este cerrada) en vez de mostrar el aviso
  // generico del sistema, que no permite sonido en bucle tipo alarma.
  const mensaje = {
    tokens,
    data: Object.fromEntries(
      Object.entries({ ...datos, titulo, cuerpo }).map(([k, v]) => [k, String(v)])
    ),
    android: { priority: "high" },
    // iOS no entrega de forma confiable los mensajes de "solo datos" con la
    // app cerrada, asi que para iPhone se manda un aviso visible con el
    // sonido de alarma (~29 s, el maximo que permite iOS) y nivel
    // "time-sensitive" para que atraviese los modos de concentracion.
    apns: {
      headers: { "apns-priority": "10", "apns-push-type": "alert" },
      payload: {
        aps: {
          alert: { title: titulo, body: cuerpo },
          sound: "alarma_pago.caf",
          "interruption-level": "time-sensitive",
        },
      },
    },
  };

  try {
    const resultado = await getMessaging(app).sendEachForMulticast(mensaje);

    // Limpia tokens que ya no son validos (app desinstalada, etc.)
    const tokensInvalidos = [];
    resultado.responses.forEach((respuesta, i) => {
      if (!respuesta.success) {
        const codigo = respuesta.error?.code || "";
        if (codigo.includes("registration-token-not-registered") || codigo.includes("invalid-argument")) {
          tokensInvalidos.push(tokens[i]);
        }
      }
    });
    for (const token of tokensInvalidos) {
      await dispositivosService.eliminar(token);
    }

    return { enviados: resultado.successCount, fallidos: resultado.failureCount };
  } catch (err) {
    console.error("Error enviando notificacion push:", err.message);
    return { enviados: 0, motivo: "error", error: err.message };
  }
}

module.exports = { enviarATodos, enviarATokens };
