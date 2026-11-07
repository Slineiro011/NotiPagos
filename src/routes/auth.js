const express = require("express");
const { rateLimit } = require("express-rate-limit");
const usuariosService = require("../services/usuariosService");
const cuentasService = require("../services/cuentasService");
const comprasService = require("../services/comprasService");
const resetPasswordService = require("../services/resetPasswordService");
const emailService = require("../services/emailService");
const { generarToken, requireAuth } = require("../auth");

const URL_BASE = process.env.URL_BASE || "https://notipagos.onrender.com";

// Limites por IP. Solo cuentan los intentos fallidos en el login, para no
// bloquear a una oficina entera que comparte la misma IP.
function limitePorIp({ max, ventanaMinutos, soloFallidos = false }) {
  return rateLimit({
    windowMs: ventanaMinutos * 60 * 1000,
    limit: max,
    skipSuccessfulRequests: soloFallidos,
    standardHeaders: true,
    legacyHeaders: false,
    // server.js confia en el proxy de Render para obtener la IP real.
    validate: { trustProxy: false },
    message: { error: "Demasiados intentos. Espera un momento y vuelve a intentarlo." },
  });
}
const limiteLogin = limitePorIp({ max: 20, ventanaMinutos: 15, soloFallidos: true });
const limiteRegistro = limitePorIp({ max: 10, ventanaMinutos: 60 });
const limiteOlvidePassword = limitePorIp({ max: 10, ventanaMinutos: 60 });

// Recuperaciones por usuario en una hora: a diferencia del limite por IP, no
// se puede evadir, asi que evita que le llenen el correo a una persona.
const MAX_RECUPERACIONES_POR_HORA = 3;

const router = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Registro propio: cualquier persona crea su propia cuenta (queda como jefe
// de su propia empresa, aunque sea de una sola persona), sin depender de que
// un jefe le asigne el usuario. Empieza con el mes de prueba gratis.
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post(
  "/registro",
  limiteRegistro,
  wrap(async (req, res) => {
    const { usuario, password, nombre, telefono, correo } = req.body;
    // El correo es obligatorio solo en la app (desde la 1.11.0): la 1.10.0 no
    // lo manda, y exigirlo aqui le romperia el registro.
    if (!usuario || !password) {
      return res.status(400).json({ error: "usuario y password son obligatorios" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }
    if (correo && !CORREO_VALIDO.test(correo)) {
      return res.status(400).json({ error: "El correo no es valido" });
    }
    const existente = await usuariosService.getByUsuario(usuario);
    if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });
    const correoExistente = await usuariosService.getByCorreo(correo);
    if (correoExistente) return res.status(409).json({ error: "Ya existe una cuenta con ese correo" });
    const telefonoExistente = await usuariosService.getByTelefono(telefono);
    if (telefonoExistente) return res.status(409).json({ error: "Ya existe una cuenta con ese número de WhatsApp" });

    const cuenta = await cuentasService.crear(nombre ? `Empresa de ${nombre}` : "Mi empresa");
    let creado;
    try {
      creado = await usuariosService.crear(usuario, nombre, password, {
        rol: "jefe",
        telefono,
        correo,
        cuentaId: cuenta.id,
      });
    } catch (err) {
      // Sin esto quedaria una cuenta vacia sin ningun usuario.
      await cuentasService.eliminar(cuenta.id);
      // 23505: otro registro simultaneo tomo el mismo correo o telefono.
      if (err.code === "23505") return res.status(409).json({ error: "Ya existe una cuenta con esos datos" });
      throw err;
    }

    const token = generarToken(creado);
    res.status(201).json({
      token,
      nombre: creado.nombre,
      usuario: creado.usuario,
      rol: creado.rol,
      telefono: creado.telefono,
      correo: creado.correo,
    });
  })
);

router.get(
  "/suscripcion",
  requireAuth,
  wrap(async (req, res) => {
    const estado = await cuentasService.estado(req.usuario.cuenta_id);
    if (!estado) return res.status(404).json({ error: "Cuenta no encontrada" });
    res.json(estado);
  })
);

// La app manda el purchaseToken que le entrega Google Play al comprar; el
// servidor lo verifica contra la API de Android Publisher (nunca se confia
// en el estado "activo" que pueda reportar el propio celular) antes de
// activar la suscripcion de la cuenta.
router.post(
  "/verificar-compra",
  requireAuth,
  wrap(async (req, res) => {
    const { plataforma, purchaseToken } = req.body;
    if (plataforma !== "android") {
      return res.status(400).json({ error: "Por ahora solo se verifican compras de Android" });
    }
    if (!purchaseToken) {
      return res.status(400).json({ error: "purchaseToken es obligatorio" });
    }

    // Sin esto, una sola compra (compartiendo el token) desbloquearia
    // cualquier cantidad de cuentas.
    const duena = await cuentasService.getPorCompra(purchaseToken);
    if (duena && duena.id !== req.usuario.cuenta_id) {
      return res.status(409).json({ error: "Esta compra ya está vinculada a otra cuenta" });
    }

    let resultado;
    try {
      resultado = await comprasService.verificarSuscripcionAndroid(purchaseToken);
    } catch (err) {
      console.error("Error verificando compra con Google Play:", err.message);
      return res.status(502).json({ error: "No se pudo verificar la compra con Google Play" });
    }

    if (!resultado.activa) {
      return res.status(400).json({ error: "La suscripcion no esta activa", estado: resultado.estado });
    }

    await cuentasService.activarSuscripcion(req.usuario.cuenta_id, {
      vence: resultado.vence,
      plataforma: "android",
      idCompra: purchaseToken,
    });
    const estado = await cuentasService.estado(req.usuario.cuenta_id);
    res.json({ ok: true, ...estado });
  })
);

router.post(
  "/login",
  limiteLogin,
  wrap(async (req, res) => {
    const { usuario, password } = req.body;
    if (!usuario || !password) {
      return res.status(400).json({ error: "usuario y password son obligatorios" });
    }
    const encontrado = await usuariosService.verificarPassword(usuario, password);
    if (!encontrado) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

    const token = generarToken(encontrado);
    res.json({
      token,
      nombre: encontrado.nombre,
      usuario: encontrado.usuario,
      rol: encontrado.rol,
      telefono: encontrado.telefono,
    });
  })
);

// Autoservicio: cualquier usuario autenticado puede ver/editar su propio
// telefono y cambiar su propia contraseña, sin necesitar el rol jefe.
router.get(
  "/perfil",
  requireAuth,
  wrap(async (req, res) => {
    const fila = await usuariosService.getByUsuario(req.usuario.usuario);
    if (!fila) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol, telefono: fila.telefono, correo: fila.correo });
  })
);

router.put(
  "/perfil",
  requireAuth,
  wrap(async (req, res) => {
    const { nombre, telefono, correo, password, usuario } = req.body;
    let usuarioActual = req.usuario.usuario;

    const nuevoUsuario = typeof usuario === "string" ? usuario.trim() : "";
    if (nuevoUsuario && nuevoUsuario !== usuarioActual) {
      const existente = await usuariosService.getByUsuario(nuevoUsuario);
      if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });
      const renombrado = await usuariosService.cambiarUsuario(usuarioActual, nuevoUsuario);
      if (!renombrado) return res.status(404).json({ error: "Usuario no encontrado" });
      usuarioActual = nuevoUsuario;
    }

    if (typeof correo === "string" && correo.trim() && !CORREO_VALIDO.test(correo.trim())) {
      return res.status(400).json({ error: "El correo no es valido" });
    }
    if (typeof correo === "string" && correo.trim()) {
      const correoExistente = await usuariosService.getByCorreo(correo);
      if (correoExistente && correoExistente.usuario !== usuarioActual) {
        return res.status(409).json({ error: "Ya existe una cuenta con ese correo" });
      }
    }

    const actualizado = await usuariosService.actualizar(usuarioActual, { nombre, telefono, correo, password });
    if (!actualizado) return res.status(404).json({ error: "Usuario no encontrado" });

    // El usuario y/o el nombre pudieron cambiar: se reemite el token para que
    // el cliente no quede con datos de sesion desactualizados.
    const token = generarToken(actualizado);
    res.json({ ...actualizado, token });
  })
);

// Pide el correo y, si existe una cuenta con el, manda un enlace de un solo
// uso (valido 30 min) para poner una contraseña nueva. La respuesta es
// siempre la misma exista o no el correo, para no revelar que correos estan
// registrados.
router.post(
  "/olvide-password",
  limiteOlvidePassword,
  wrap(async (req, res) => {
    const { correo } = req.body;
    if (!correo) return res.status(400).json({ error: "correo es obligatorio" });

    const usuario = await usuariosService.getByCorreo(correo);
    const puedeEnviar =
      usuario && (await resetPasswordService.contarRecientes(usuario.usuario)) < MAX_RECUPERACIONES_POR_HORA;
    if (puedeEnviar) {
      const token = await resetPasswordService.crear(usuario.usuario);
      const url = `${URL_BASE}/restablecer-password.html?token=${token}`;
      emailService
        .enviarCorreo({
          para: usuario.correo,
          asunto: "Recupera tu contraseña de ActivoX",
          html: `<p>Hola ${emailService.escaparHtml(usuario.nombre || usuario.usuario)},</p>
                 <p>Pediste restablecer tu contraseña en ActivoX. Este enlace es valido por ${resetPasswordService.VIGENCIA_MINUTOS} minutos:</p>
                 <p><a href="${url}">${url}</a></p>
                 <p>Si no fuiste tú, ignora este correo: tu contraseña sigue igual.</p>`,
        })
        .catch((err) => console.error("Error enviando correo de recuperacion:", err.message));
    }

    res.json({ ok: true, mensaje: "Si el correo esta registrado, te llegara un enlace para restablecer tu contraseña." });
  })
);

router.post(
  "/restablecer-password",
  wrap(async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "token y password son obligatorios" });
    if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });

    const solicitud = await resetPasswordService.getVigente(token);
    if (!solicitud) return res.status(400).json({ error: "El enlace no es valido o ya expiro. Pide uno nuevo." });

    const actualizado = await usuariosService.actualizar(solicitud.usuario, { password });
    if (!actualizado) return res.status(404).json({ error: "Usuario no encontrado" });

    await resetPasswordService.marcarUsado(token);
    res.json({ ok: true });
  })
);

// Eliminar la propia cuenta desde la app (Apple y Google lo exigen cuando hay
// registro propio). Pide la contraseña para que no se haga por accidente.
// Si quien la borra es el ultimo jefe, se borra la cuenta entera con todos
// sus pagos; si no, solo su usuario (los pagos son de la empresa).
router.delete(
  "/cuenta",
  requireAuth,
  wrap(async (req, res) => {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: "Escribe tu contraseña para confirmar" });
    const verificado = await usuariosService.verificarPassword(req.usuario.usuario, password);
    // 403 y no 401: la app trata 401 como "sesion vencida" y cerraria la sesion.
    if (!verificado) return res.status(403).json({ error: "Contraseña incorrecta" });

    const resultado = await usuariosService.eliminarPropio(verificado);
    res.json({ ok: true, ...resultado });
  })
);

module.exports = router;
