const API = "/api";
const CLAVE_TOKEN = "notipagos_token";
const CLAVE_SESION = "notipagos_sesion";

// ---------- Autenticación ----------
function getToken() {
  return localStorage.getItem(CLAVE_TOKEN);
}

function setToken(token) {
  if (token) localStorage.setItem(CLAVE_TOKEN, token);
  else localStorage.removeItem(CLAVE_TOKEN);
}

function getSesion() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SESION) || "null");
  } catch {
    return null;
  }
}

function setSesion(sesion) {
  if (sesion) localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
  else localStorage.removeItem(CLAVE_SESION);
}

function esJefe() {
  return getSesion()?.rol === "jefe";
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) {
    mostrarLogin("Tu sesión expiró, vuelve a entrar.");
    throw new Error("No autenticado");
  }
  return res;
}

function mostrarLogin(mensaje) {
  setToken(null);
  setSesion(null);
  document.getElementById("app-contenido").hidden = true;
  document.getElementById("pantalla-login").style.display = "flex";
  document.getElementById("login-error").textContent = mensaje || "";
}

function mostrarApp() {
  document.getElementById("pantalla-login").style.display = "none";
  document.getElementById("app-contenido").hidden = false;
  const sesion = getSesion();
  const etiqueta = document.getElementById("sesion-usuario");
  if (etiqueta && sesion) {
    etiqueta.textContent = `${sesion.nombre}${sesion.rol === "jefe" ? " (jefe)" : ""}`;
  }
  document.querySelectorAll(".solo-jefe").forEach((el) => (el.style.display = esJefe() ? "" : "none"));
  document.querySelectorAll(".solo-usuario").forEach((el) => (el.style.display = esJefe() ? "none" : ""));
  cargarPagos();
  cargarEmpresas();
  cargarUsuariosFiltro();
}

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuario = document.getElementById("login-usuario").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || "No se pudo iniciar sesión";
      return;
    }
    setToken(data.token);
    setSesion({ usuario: data.usuario, nombre: data.nombre, rol: data.rol });
    mostrarApp();
  } catch {
    errorEl.textContent = "No se pudo conectar con el servidor";
  }
});

document.getElementById("btn-salir").addEventListener("click", () => mostrarLogin());

// ---------- Navegación por pestañas ----------
document.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn[data-tab]").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "historial") cargarHistorial();
    if (btn.dataset.tab === "config") cargarConfiguracion();
    if (btn.dataset.tab === "usuarios") cargarUsuarios();
  });
});

// ---------- Utilidades ----------
function formatMoneda(valor) {
  return Number(valor || 0).toLocaleString("es-CO", { minimumFractionDigits: 0 });
}

function diasRestantes(fecha) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fecha + "T00:00:00");
  return Math.round((venc - hoy) / 86400000);
}

function estadoVisual(pago) {
  if (pago.estado === "pagado") return { texto: "Pagado", clase: "estado-pagado" };
  const dias = diasRestantes(pago.fecha_vencimiento);
  if (dias < 0) return { texto: `Vencido hace ${Math.abs(dias)}d`, clase: "estado-vencido" };
  if (dias === 0) return { texto: "Vence hoy", clase: "estado-hoy" };
  if (dias <= (pago.dias_aviso ?? 3)) return { texto: `Vence en ${dias}d`, clase: "estado-pronto" };
  return { texto: `Vence en ${dias}d`, clase: "estado-normal" };
}

// ---------- Listado de pagos ----------
let filtroActual = "pendientes";
let empresaActual = "";
let usuarioFiltroActual = "";

async function cargarEmpresas() {
  const res = await apiFetch("/pagos/empresas/lista");
  const empresas = await res.json();

  const selectFiltro = document.getElementById("filtro-empresa");
  const valorPrevio = selectFiltro.value;
  selectFiltro.innerHTML = `<option value="">Todas las empresas</option>`;
  for (const emp of empresas) {
    const opt = document.createElement("option");
    opt.value = emp;
    opt.textContent = emp;
    selectFiltro.appendChild(opt);
  }
  selectFiltro.value = valorPrevio;

  const datalist = document.getElementById("lista-empresas");
  datalist.innerHTML = empresas.map((emp) => `<option value="${emp}"></option>`).join("");
}

async function cargarUsuariosFiltro() {
  if (!esJefe()) return;
  const res = await apiFetch("/usuarios");
  if (!res.ok) return;
  const usuarios = await res.json();

  const selectFiltro = document.getElementById("filtro-usuario");
  const valorPrevio = selectFiltro.value;
  selectFiltro.innerHTML = `<option value="">Todos los usuarios</option>`;
  for (const u of usuarios) {
    const opt = document.createElement("option");
    opt.value = u.usuario;
    opt.textContent = u.nombre || u.usuario;
    selectFiltro.appendChild(opt);
  }
  selectFiltro.value = valorPrevio;
}

async function cargarPagos() {
  const params = new URLSearchParams({ filtro: filtroActual });
  if (empresaActual) params.set("empresa", empresaActual);
  if (usuarioFiltroActual) params.set("usuario", usuarioFiltroActual);
  const res = await apiFetch(`/pagos?${params.toString()}`);
  const pagos = await res.json();
  const contenedor = document.getElementById("lista-pagos");
  contenedor.innerHTML = "";

  if (!pagos.length) {
    contenedor.innerHTML = `<div class="vacio">No hay pagos para este filtro.</div>`;
    return;
  }

  for (const pago of pagos) {
    contenedor.appendChild(crearTarjetaPago(pago));
  }
}

function crearTarjetaPago(pago) {
  const div = document.createElement("div");
  div.className = "pago-card";
  const estado = estadoVisual(pago);
  const creador = pago.creado_por_nombre || pago.creado_por;

  div.innerHTML = `
    <div class="pago-info">
      <span class="pago-nombre">${pago.nombre}</span>
      <span class="pago-estado ${estado.clase}">${estado.texto}</span>
      <div class="pago-meta">🏢 ${pago.empresa} · ${pago.categoria} · $${formatMoneda(pago.monto)} · vence ${pago.fecha_vencimiento}${pago.recurrencia !== "ninguna" ? ` · se repite: ${pago.recurrencia}` : ""}${creador ? ` · 👤 ${creador}` : ""}</div>
    </div>
    <div class="pago-acciones">
      ${pago.estado === "pendiente" ? `<button class="btn-pagado" data-accion="pagado" data-id="${pago.id}">✔ Pagado</button>` : ""}
      <button data-accion="editar" data-id="${pago.id}">Editar</button>
      <button class="btn-eliminar" data-accion="eliminar" data-id="${pago.id}">Eliminar</button>
    </div>
  `;

  div.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => manejarAccion(btn.dataset.accion, Number(btn.dataset.id), pago));
  });

  return div;
}

document.getElementById("filtro-empresa").addEventListener("change", (e) => {
  empresaActual = e.target.value;
  cargarPagos();
});

document.getElementById("filtro-usuario").addEventListener("change", (e) => {
  usuarioFiltroActual = e.target.value;
  cargarPagos();
});

document.getElementById("btn-exportar-excel").addEventListener("click", async (e) => {
  const boton = e.currentTarget;
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Generando…";
  try {
    const params = new URLSearchParams();
    if (empresaActual) params.set("empresa", empresaActual);
    if (usuarioFiltroActual) params.set("usuario", usuarioFiltroActual);
    const res = await apiFetch(`/pagos/exportar/excel?${params.toString()}`);
    if (!res.ok) throw new Error(`Error del servidor (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `pagos_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("No se pudo generar el Excel: " + err.message);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});

async function manejarAccion(accion, id, pago) {
  if (accion === "pagado") {
    if (!confirm(`¿Marcar "${pago.nombre}" como pagado?`)) return;
    await apiFetch(`/pagos/${id}/pagado`, { method: "POST" });
    cargarPagos();
  } else if (accion === "editar") {
    abrirFormulario(pago);
  } else if (accion === "eliminar") {
    if (!confirm(`¿Eliminar "${pago.nombre}" definitivamente?`)) return;
    await apiFetch(`/pagos/${id}`, { method: "DELETE" });
    cargarPagos();
  }
}

document.querySelectorAll(".filtro-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filtro-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filtroActual = btn.dataset.filtro;
    cargarPagos();
  });
});

// ---------- Historial ----------
async function cargarHistorial() {
  const res = await apiFetch("/pagos/historial");
  const historial = await res.json();
  const contenedor = document.getElementById("lista-historial");
  contenedor.innerHTML = "";

  if (!historial.length) {
    contenedor.innerHTML = `<div class="vacio">Aún no hay pagos registrados en el historial.</div>`;
    return;
  }

  for (const h of historial) {
    const div = document.createElement("div");
    div.className = "pago-card";
    const creador = h.creado_por_nombre || h.creado_por;
    div.innerHTML = `
      <div class="pago-info">
        <span class="pago-nombre">${h.nombre}</span>
        <div class="pago-meta">🏢 ${h.empresa} · ${h.categoria} · $${formatMoneda(h.monto)} · pagado el ${h.fecha_pago}${creador ? ` · 👤 ${creador}` : ""}</div>
      </div>
    `;
    contenedor.appendChild(div);
  }
}

// ---------- Formulario de pago ----------
const dialog = document.getElementById("dialog-pago");
const form = document.getElementById("form-pago");

document.getElementById("btn-nuevo").addEventListener("click", () => abrirFormulario());
document.getElementById("btn-cancelar").addEventListener("click", () => dialog.close());

function abrirFormulario(pago) {
  document.getElementById("form-titulo").textContent = pago ? "Editar pago" : "Nuevo pago";
  document.getElementById("pago-id").value = pago?.id || "";
  document.getElementById("pago-empresa").value = pago?.empresa || empresaActual || "";
  document.getElementById("pago-nombre").value = pago?.nombre || "";
  document.getElementById("pago-categoria").value = pago?.categoria || "SOAT";
  document.getElementById("pago-monto").value = pago?.monto || "";
  document.getElementById("pago-fecha").value = pago?.fecha_vencimiento || "";
  document.getElementById("pago-recurrencia").value = pago?.recurrencia || "ninguna";
  document.getElementById("pago-dias-aviso").value = pago?.dias_aviso ?? 3;
  document.getElementById("pago-notas").value = pago?.notas || "";
  dialog.showModal();
}

form.addEventListener("submit", async (e) => {
  const id = document.getElementById("pago-id").value;
  const datos = {
    empresa: document.getElementById("pago-empresa").value,
    nombre: document.getElementById("pago-nombre").value,
    categoria: document.getElementById("pago-categoria").value,
    monto: document.getElementById("pago-monto").value,
    fecha_vencimiento: document.getElementById("pago-fecha").value,
    recurrencia: document.getElementById("pago-recurrencia").value,
    dias_aviso: document.getElementById("pago-dias-aviso").value,
    notas: document.getElementById("pago-notas").value,
  };

  if (id) {
    await apiFetch(`/pagos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
  } else {
    await apiFetch("/pagos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
  }
  cargarPagos();
  cargarEmpresas();
});

// ---------- Configuración ----------
async function cargarConfiguracion() {
  const perfilRes = await apiFetch("/auth/perfil");
  const perfil = await perfilRes.json();
  document.getElementById("perfil-nombre").value = perfil.nombre || "";
  document.getElementById("perfil-usuario-input").value = perfil.usuario || "";
  document.getElementById("perfil-telefono").value = perfil.telefono || "";
  document.getElementById("perfil-nombre-guardado").textContent = "";
  document.getElementById("perfil-usuario-guardado").textContent = "";
  document.getElementById("perfil-telefono-guardado").textContent = "";
  document.getElementById("perfil-password-guardado").textContent = "";
  document.getElementById("perfil-password").value = "";

  if (!esJefe()) return;

  const res = await apiFetch("/configuracion");
  const config = await res.json();
  document.getElementById("input-numeros").value = (config.numeros_whatsapp || "").split(",").filter(Boolean).join("\n");
  document.getElementById("input-hora").value = config.hora_recordatorio || "08:00";
  document.getElementById("whatsapp-estado").innerHTML = "";
}

/** Aplica los cambios de perfil (nombre, usuario, telefono o password) y
 * actualiza la sesion local con el token/datos que devuelve el servidor,
 * ya que el usuario o el nombre pudieron haber cambiado. */
async function guardarPerfil(cambios) {
  const res = await apiFetch("/auth/perfil", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambios),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "No se pudo guardar");
  setToken(data.token);
  setSesion({ usuario: data.usuario, nombre: data.nombre, rol: data.rol });
  const etiqueta = document.getElementById("sesion-usuario");
  if (etiqueta) etiqueta.textContent = `${data.nombre}${data.rol === "jefe" ? " (jefe)" : ""}`;
  return data;
}

document.getElementById("btn-guardar-nombre").addEventListener("click", async () => {
  const nombre = document.getElementById("perfil-nombre").value.trim();
  if (!nombre) return alert("El nombre no puede quedar vacío.");
  try {
    await guardarPerfil({ nombre });
    const aviso = document.getElementById("perfil-nombre-guardado");
    aviso.textContent = "Guardado ✔";
    setTimeout(() => (aviso.textContent = ""), 2500);
  } catch (err) {
    alert("No se pudo guardar el nombre: " + err.message);
  }
});

document.getElementById("btn-guardar-usuario").addEventListener("click", async () => {
  const usuario = document.getElementById("perfil-usuario-input").value.trim();
  if (!usuario) return alert("El usuario no puede quedar vacío.");
  if (!confirm(`¿Cambiar tu usuario de inicio de sesión a "${usuario}"? La próxima vez que entres deberás usar este nuevo nombre de usuario.`)) return;
  try {
    await guardarPerfil({ usuario });
    const aviso = document.getElementById("perfil-usuario-guardado");
    aviso.textContent = "Guardado ✔";
    setTimeout(() => (aviso.textContent = ""), 2500);
  } catch (err) {
    alert("No se pudo guardar el usuario: " + err.message);
  }
});

document.getElementById("btn-guardar-telefono").addEventListener("click", async () => {
  const telefono = document.getElementById("perfil-telefono").value.trim();
  try {
    await guardarPerfil({ telefono });
    const aviso = document.getElementById("perfil-telefono-guardado");
    aviso.textContent = "Guardado ✔";
    setTimeout(() => (aviso.textContent = ""), 2500);
  } catch (err) {
    alert("No se pudo guardar el número: " + err.message);
  }
});

document.getElementById("btn-guardar-password").addEventListener("click", async () => {
  const password = document.getElementById("perfil-password").value;
  if (!password) {
    alert("Escribe la nueva contraseña primero.");
    return;
  }
  try {
    await guardarPerfil({ password });
    document.getElementById("perfil-password").value = "";
    const aviso = document.getElementById("perfil-password-guardado");
    aviso.textContent = "Contraseña actualizada ✔";
    setTimeout(() => (aviso.textContent = ""), 2500);
  } catch (err) {
    alert("No se pudo cambiar la contraseña: " + err.message);
  }
});

document.getElementById("btn-guardar-config").addEventListener("click", async () => {
  const numeros = document
    .getElementById("input-numeros")
    .value.split(/[\n,]/)
    .map((n) => n.trim())
    .filter(Boolean)
    .join(",");
  const hora = document.getElementById("input-hora").value;

  await apiFetch("/configuracion", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numeros_whatsapp: numeros, hora_recordatorio: hora }),
  });

  const aviso = document.getElementById("config-guardado");
  aviso.textContent = "Guardado ✔";
  setTimeout(() => (aviso.textContent = ""), 2000);
});

document.getElementById("btn-probar-whatsapp").addEventListener("click", async () => {
  const div = document.getElementById("whatsapp-estado");
  div.textContent = "Enviando...";
  const res = await apiFetch("/configuracion/whatsapp/prueba", { method: "POST" });
  const data = await res.json();
  if (data.error) {
    div.innerHTML = `<span style="color: var(--danger)">❌ ${data.error}</span>`;
    return;
  }
  const fallos = (data.resultados || []).filter((r) => !r.ok);
  if (fallos.length) {
    div.innerHTML = `<span style="color: var(--danger)">❌ ${fallos.map((f) => f.numero + ": " + f.error).join(" · ")}</span>`;
  } else {
    div.innerHTML = `<span style="color: var(--ok)">✅ Mensaje de prueba enviado correctamente</span>`;
  }
});

// ---------- Usuarios (solo jefe) ----------
async function cargarUsuarios() {
  const res = await apiFetch("/usuarios");
  const usuarios = await res.json();
  const contenedor = document.getElementById("lista-usuarios");
  contenedor.innerHTML = "";

  if (!usuarios.length) {
    contenedor.innerHTML = `<div class="vacio">No hay usuarios registrados.</div>`;
    return;
  }

  const sesionActual = getSesion();
  for (const u of usuarios) {
    const div = document.createElement("div");
    div.className = "pago-card";
    div.innerHTML = `
      <div class="pago-info">
        <span class="pago-nombre">${u.nombre || u.usuario}</span>
        <span class="pago-estado ${u.rol === "jefe" ? "estado-pronto" : "estado-normal"}">${u.rol === "jefe" ? "Jefe" : "Usuario"}</span>
        <div class="pago-meta">Usuario: ${u.usuario}${u.telefono ? ` · WhatsApp: ${u.telefono}` : " · sin WhatsApp vinculado"}</div>
      </div>
      <div class="pago-acciones">
        <button data-accion="editar-usuario">Editar</button>
        ${u.usuario === sesionActual?.usuario ? "" : `<button class="btn-eliminar" data-accion="eliminar-usuario">Eliminar</button>`}
      </div>
    `;
    div.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => manejarAccionUsuario(btn.dataset.accion, u));
    });
    contenedor.appendChild(div);
  }
}

async function manejarAccionUsuario(accion, usuario) {
  if (accion === "editar-usuario") {
    abrirFormularioUsuario(usuario);
  } else if (accion === "eliminar-usuario") {
    if (!confirm(`¿Eliminar el acceso de "${usuario.nombre || usuario.usuario}"? Sus pagos ya creados no se borran.`)) return;
    await apiFetch(`/usuarios/${encodeURIComponent(usuario.usuario)}`, { method: "DELETE" });
    cargarUsuarios();
  }
}

const dialogUsuario = document.getElementById("dialog-usuario");
const formUsuario = document.getElementById("form-usuario");

document.getElementById("btn-nuevo-usuario").addEventListener("click", () => abrirFormularioUsuario());
document.getElementById("btn-cancelar-usuario").addEventListener("click", () => dialogUsuario.close());

function abrirFormularioUsuario(usuario) {
  document.getElementById("usuario-form-titulo").textContent = usuario ? "Editar usuario" : "Nuevo usuario";
  document.getElementById("usuario-original").value = usuario?.usuario || "";
  const inputUsuario = document.getElementById("usuario-usuario");
  inputUsuario.value = usuario?.usuario || "";
  inputUsuario.disabled = !!usuario;
  document.getElementById("usuario-nombre").value = usuario?.nombre || "";
  document.getElementById("usuario-password").value = "";
  document.getElementById("usuario-password").required = !usuario;
  document.getElementById("usuario-password-nota").textContent = usuario ? "(déjala vacía para no cambiarla)" : "";
  document.getElementById("usuario-rol").value = usuario?.rol || "usuario";
  document.getElementById("usuario-telefono").value = usuario?.telefono || "";
  dialogUsuario.showModal();
}

formUsuario.addEventListener("submit", async (e) => {
  const usuarioOriginal = document.getElementById("usuario-original").value;
  const datos = {
    usuario: document.getElementById("usuario-usuario").value.trim(),
    nombre: document.getElementById("usuario-nombre").value.trim(),
    rol: document.getElementById("usuario-rol").value,
    telefono: document.getElementById("usuario-telefono").value.trim(),
  };
  const password = document.getElementById("usuario-password").value;

  try {
    let res;
    if (usuarioOriginal) {
      const cambios = { ...datos };
      if (password) cambios.password = password;
      res = await apiFetch(`/usuarios/${encodeURIComponent(usuarioOriginal)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
    } else {
      res = await apiFetch("/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...datos, password }),
      });
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Error del servidor (${res.status})`);
    }
    cargarUsuarios();
  } catch (err) {
    alert("Error al guardar el usuario: " + err.message);
  }
});

// ---------- Inicio ----------
if (getToken()) {
  mostrarApp();
} else {
  mostrarLogin();
}
