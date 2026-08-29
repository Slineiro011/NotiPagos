# Sistema de notificaciones de pagos

Aplicación web para programar los pagos recurrentes de la empresa (SOAT, pólizas, nómina, impuestos, servicios, etc.) con recordatorios automáticos por WhatsApp y un bot conversacional (impulsado por Gemini) al que se le puede escribir en lenguaje natural para programar pagos o preguntar cuáles se aproximan.

## Arquitectura

- **Backend**: Node.js + Express.
- **Base de datos**: Postgres en [Neon](https://neon.tech) (capa gratuita).
- **WhatsApp**: API oficial de Meta (WhatsApp Cloud API) — no requiere QR ni depende de un celular encendido.
- **Conversación natural**: [Google Gemini](https://aistudio.google.com) (capa gratuita) interpreta lo que escribe la contadora y decide si hay que programar un pago, consultar, marcar como pagado, etc.
- **Hosting**: pensado para desplegarse en [Render](https://render.com) (plan free).

## 1. Crear la base de datos en Neon

1. Crea una cuenta en [neon.tech](https://neon.tech) y un proyecto nuevo.
2. Copia el **connection string** (botón "Connect", incluye `?sslmode=require`).
3. Pégalo en `DATABASE_URL` dentro de tu `.env`.

Las tablas se crean solas la primera vez que arranca el servidor (no hay que correr ningún script).

## 2. Crear la app de WhatsApp en Meta

1. Ve a [developers.facebook.com](https://developers.facebook.com) → **Mis apps** → **Crear app** → tipo "Negocio".
2. Dentro de la app, agrega el producto **WhatsApp**.
3. En "Introducción a la API" verás un **número de prueba** gratuito y un **token de acceso temporal** (dura 24h; más abajo se explica cómo generar uno permanente).
4. Copia:
   - `WHATSAPP_PHONE_NUMBER_ID` (aparece ahí mismo, "Phone number ID").
   - `WHATSAPP_TOKEN` (el token de acceso).
5. En **"Números de teléfono destinatarios"**, agrega el número de la contadora y verifícalo con el código que le llega por WhatsApp. Mientras la app esté en modo desarrollo, **solo puedes escribirle a los números que agregues aquí** (hasta 5).

### Token permanente

El token temporal expira en 24h. Para uno que no expire:
1. Ve a **Configuración de la empresa** (business.facebook.com) → **Usuarios del sistema** → crea un usuario del sistema con rol Admin.
2. Genera un token para ese usuario con permisos `whatsapp_business_messaging` y `whatsapp_business_management`, sin fecha de expiración.
3. Usa ese token como `WHATSAPP_TOKEN`.

### Configurar el webhook (para que el bot reciba mensajes)

Meta necesita una URL pública HTTPS para enviarte los mensajes entrantes — por eso este paso se hace **después** de desplegar en Render (paso 5).

1. En tu app de Meta → **WhatsApp → Configuración**.
2. En "Webhook", pon la URL: `https://TU-APP.onrender.com/webhook/whatsapp`.
3. En "Verify token" escribe cualquier palabra secreta y ponla también en `WHATSAPP_VERIFY_TOKEN` de tus variables de entorno en Render.
4. Dale a **Verificar y guardar**.
5. Suscríbete al campo **`messages`**.

### Crear la plantilla para los recordatorios automáticos

Fuera de las 24 horas después de que la contadora te escriba, Meta **exige** usar una plantilla pre-aprobada para poder escribirle tú primero (por eso los recordatorios diarios la necesitan).

1. En el Meta Business Manager → **WhatsApp Manager → Plantillas de mensajes → Crear plantilla**.
2. Categoría: **Utilidad**.
3. Nombre: `recordatorio_pagos` (debe coincidir con `WHATSAPP_TEMPLATE_NAME`).
4. Idioma: Español.
5. Cuerpo del mensaje:
   ```
   🔔 Recordatorio de pago:

   {{1}}
   ```
   (Meta pedirá un ejemplo para `{{1}}`; escribe algo como `SOAT camioneta ABC123 - $350.000 - vence en 3 días`).
6. Envía a revisión. Normalmente la aprueban en minutos u horas.

## 3. Obtener la API key de Gemini

1. Ve a [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Crea una API key gratuita.
3. Ponla en `GEMINI_API_KEY`.

## 4. Configurar las variables de entorno

Copia `.env.example` a `.env` y llena los valores:

```bash
cp .env.example .env
```

| Variable | De dónde sale |
|---|---|
| `DATABASE_URL` | Connection string de Neon |
| `WHATSAPP_TOKEN` | Token del usuario del sistema en Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | Panel de WhatsApp en Meta for Developers |
| `WHATSAPP_VERIFY_TOKEN` | Lo inventas tú, debe coincidir con lo que pongas en el webhook de Meta |
| `WHATSAPP_TEMPLATE_NAME` | Nombre de la plantilla aprobada (`recordatorio_pagos`) |
| `GEMINI_API_KEY` | API key de Google AI Studio |
| `CRON_SECRET` | Lo inventas tú, protege el endpoint que dispara los recordatorios (ver paso 6) |

## 5. Instalar y correr localmente

```bash
npm install
npm start
```

Abre http://localhost:3000 para la app web (agregar/editar pagos). El webhook de WhatsApp solo funcionará una vez desplegado con una URL pública (paso siguiente) — localmente puedes probar todo lo demás.

## 6. Desplegar en Render

1. Sube este proyecto a un repositorio de GitHub.
2. En Render: **New → Web Service**, conecta el repo.
3. Build command: `npm install` — Start command: `npm start`.
4. En **Environment**, agrega todas las variables del paso 4 (más `PORT` no hace falta, Render lo define solo).
5. Despliega. Copia la URL que te da Render (`https://tu-app.onrender.com`).
6. Vuelve a Meta y configura el webhook con esa URL (`/webhook/whatsapp`) como se explicó arriba.

### Importante: el plan gratis de Render "duerme" el servicio

Si nadie lo visita, Render apaga el servicio tras ~15 minutos y lo reinicia en la siguiente petición. Esto significa que el recordatorio programado internamente (`node-cron`) **no es confiable** por sí solo en el plan free, porque puede estar dormido justo a la hora configurada.

**Solución**: usa un servicio externo gratuito de cron para "tocar" el sistema todos los días a la hora deseada. Por ejemplo, con [cron-job.org](https://cron-job.org) (gratis):

1. Crea una cuenta.
2. Crea un cron job nuevo que llame a:
   ```
   https://tu-app.onrender.com/api/cron/revisar?secreto=EL_MISMO_VALOR_DE_CRON_SECRET
   ```
3. Prográmalo a la hora en que quieres que salgan los recordatorios (esto reemplaza, para efectos prácticos, el campo "hora del recordatorio" de la app cuando corres en Render — ese campo interno solo aplica si el servicio nunca se duerme).

Ese endpoint es seguro de llamar varias veces al día: cada pago solo se avisa una vez por día aunque se dispare varias veces.

## Uso de la app web

- **Pagos**: crear/editar/eliminar, marcar como pagado, filtrar por hoy/semana/mes/vencidos.
- **Historial**: pagos ya realizados.
- **WhatsApp / Configuración**: números que reciben los recordatorios, hora del recordatorio (ver nota de Render arriba), botón de mensaje de prueba.

## Hablar con el bot por WhatsApp

Le puedes escribir en lenguaje natural, por ejemplo:

- *"Programa el SOAT de la camioneta ABC123, vence el 5 de septiembre, son 350000, se repite cada año, avísame con 7 días"* → lo agenda automáticamente.
- *"¿Qué pagos hay esta semana?"* → lista los próximos 7 días.
- *"pagado 4"* → marca el pago #4 como realizado (y si es recurrente, programa la siguiente fecha solo).
- *"elimina el pago 4"* → lo borra (por si Gemini entendió mal algo).
- También responde a atajos directos sin pasar por Gemini: `hoy`, `semana`, `mes`, `vencidos`, `pendientes`, `ayuda`.

## Estructura del proyecto

```
server.js                    Punto de entrada: servidor web, migraciones, cron interno
src/db.js                    Conexion a Postgres (Neon) y creacion de tablas
src/services/                Logica de negocio (pagos, configuracion) - todo async/await
src/routes/pagos.js          CRUD de pagos usado por la app web
src/routes/configuracion.js  Numeros/hora de aviso, botón de prueba
src/routes/webhook.js        Recibe los mensajes entrantes de WhatsApp (Meta)
src/routes/cron.js           Endpoint para el cron externo (Render)
src/whatsapp.js              Envio de mensajes via Meta Cloud API + formato de mensajes
src/gemini.js                Interpreta mensajes en lenguaje natural con Gemini
src/conversacion.js          Logica del bot: que hacer segun la intencion detectada
src/scheduler.js             Revision diaria que dispara los recordatorios
public/                      App web (HTML/CSS/JS sin frameworks)
```

## Notas

- Este sistema ya NO usa `whatsapp-web.js` ni requiere escanear ningún código QR — todo pasa por la API oficial de Meta, así que no hay riesgo de que bloqueen un número personal.
- Mientras la app de Meta esté en modo desarrollo, solo puede escribirle a los números que agregues manualmente en el panel (máx. 5). Para quitar ese límite hay que verificar el negocio ante Meta (Business Verification) — no es necesario para que la contadora lo use.
