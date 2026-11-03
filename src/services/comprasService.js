const fs = require("fs");
const { google } = require("googleapis");

// Igual que con Firebase: en Render se sube como "Secret File" en
// /etc/secrets/google-play-service-account.json; en local se puede poner el
// mismo archivo en la raiz del proyecto (esta en .gitignore).
const RUTA_CREDENCIAL =
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH || "/etc/secrets/google-play-service-account.json";
const RUTA_CREDENCIAL_LOCAL = "./google-play-service-account.json";

const PACKAGE_NAME = "com.smartlatam.notipagos_app";

let clienteAndroidPublisher = null;

function obtenerCliente() {
  if (clienteAndroidPublisher) return clienteAndroidPublisher;

  const ruta = fs.existsSync(RUTA_CREDENCIAL)
    ? RUTA_CREDENCIAL
    : fs.existsSync(RUTA_CREDENCIAL_LOCAL)
    ? RUTA_CREDENCIAL_LOCAL
    : null;

  if (!ruta) {
    console.warn(
      "No se encontro la credencial de Google Play (google-play-service-account.json). La verificacion de suscripciones de Android esta desactivada."
    );
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: ruta,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  clienteAndroidPublisher = google.androidpublisher({ version: "v3", auth });
  return clienteAndroidPublisher;
}

const ESTADOS_ACTIVOS = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"]);

/**
 * Verifica contra Google (no contra lo que mande la app) que un purchaseToken
 * corresponde a una suscripcion realmente activa. Lanza si no hay credencial
 * configurada o si Google rechaza la consulta (token invalido, etc.).
 */
async function verificarSuscripcionAndroid(purchaseToken) {
  const cliente = obtenerCliente();
  if (!cliente) throw new Error("La verificacion de compras de Android no esta configurada en el servidor");

  const { data } = await cliente.purchases.subscriptionsv2.get({
    packageName: PACKAGE_NAME,
    token: purchaseToken,
  });

  const activa = ESTADOS_ACTIVOS.has(data.subscriptionState);
  const vence = data.lineItems?.[0]?.expiryTime || null;
  return { activa, vence, estado: data.subscriptionState };
}

module.exports = { verificarSuscripcionAndroid };
