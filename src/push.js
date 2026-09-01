const fs = require("fs");
const admin = require("firebase-admin");
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
  appInicializada = admin.initializeApp({ credential: admin.credential.cert(credencial) });
  return appInicializada;
}

/** Envia una notificacion push a todos los dispositivos registrados. Nunca lanza. */
async function enviarATodos({ titulo, cuerpo, datos = {} }) {
  const app = obtenerApp();
  if (!app) return { enviados: 0, motivo: "sin_credencial" };

  const tokens = await dispositivosService.getTokens();
  if (!tokens.length) return { enviados: 0, motivo: "sin_dispositivos" };

  const mensaje = {
    tokens,
    notification: { title: titulo, body: cuerpo },
    data: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, String(v)])),
    android: { priority: "high" },
  };

  try {
    const resultado = await admin.messaging(app).sendEachForMulticast(mensaje);

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

module.exports = { enviarATodos };
