const REMITENTE = "ActivoX <noreply@smartlatinoamerica.org>";

/** Manda un correo con la API de Resend. Si no hay API key configurada, solo avisa por consola (no rompe el flujo). */
async function enviarCorreo({ para, asunto, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY no configurada; no se envio el correo "${asunto}" a ${para}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: REMITENTE, to: para, subject: asunto, html }),
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`Resend respondio ${res.status}: ${texto}`);
  }
}

module.exports = { enviarCorreo };
