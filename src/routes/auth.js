const express = require("express");
const usuariosService = require("../services/usuariosService");
const cuentasService = require("../services/cuentasService");
const comprasService = require("../services/comprasService");
const { generarToken, requireAuth } = require("../auth");

const router = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Registro propio: cualquier persona crea su propia cuenta (queda como jefe
// de su propia empresa, aunque sea de una sola persona), sin depender de que
// un jefe le asigne el usuario. Empieza con el mes de prueba gratis.
router.post(
  "/registro",
  wrap(async (req, res) => {
    const { usuario, password, nombre, telefono } = req.body;
    if (!usuario || !password) {
      return res.status(400).json({ error: "usuario y password son obligatorios" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }
    const existente = await usuariosService.getByUsuario(usuario);
    if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });

    const cuenta = await cuentasService.crear(nombre ? `Empresa de ${nombre}` : "Mi empresa");
    const creado = await usuariosService.crear(usuario, nombre, password, {
      rol: "jefe",
      telefono,
      cuentaId: cuenta.id,
    });

    const token = generarToken(creado);
    res.status(201).json({
      token,
      nombre: creado.nombre,
      usuario: creado.usuario,
      rol: creado.rol,
      telefono: creado.telefono,
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
    res.json({ usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol, telefono: fila.telefono });
  })
);

router.put(
  "/perfil",
  requireAuth,
  wrap(async (req, res) => {
    const { nombre, telefono, password, usuario } = req.body;
    let usuarioActual = req.usuario.usuario;

    const nuevoUsuario = typeof usuario === "string" ? usuario.trim() : "";
    if (nuevoUsuario && nuevoUsuario !== usuarioActual) {
      const existente = await usuariosService.getByUsuario(nuevoUsuario);
      if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });
      const renombrado = await usuariosService.cambiarUsuario(usuarioActual, nuevoUsuario);
      if (!renombrado) return res.status(404).json({ error: "Usuario no encontrado" });
      usuarioActual = nuevoUsuario;
    }

    const actualizado = await usuariosService.actualizar(usuarioActual, { nombre, telefono, password });
    if (!actualizado) return res.status(404).json({ error: "Usuario no encontrado" });

    // El usuario y/o el nombre pudieron cambiar: se reemite el token para que
    // el cliente no quede con datos de sesion desactualizados.
    const token = generarToken(actualizado);
    res.json({ ...actualizado, token });
  })
);

module.exports = router;
