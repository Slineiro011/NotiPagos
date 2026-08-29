const API = "/api";

// ---------- Navegación por pestañas ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "historial") cargarHistorial();
    if (btn.dataset.tab === "config") cargarConfiguracion();
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

async function cargarPagos() {
  const res = await fetch(`${API}/pagos?filtro=${filtroActual}`);
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

  div.innerHTML = `
    <div class="pago-info">
      <span class="pago-nombre">${pago.nombre}</span>
      <span class="pago-estado ${estado.clase}">${estado.texto}</span>
      <div class="pago-meta">${pago.categoria} · $${formatMoneda(pago.monto)} · vence ${pago.fecha_vencimiento}${pago.recurrencia !== "ninguna" ? ` · se repite: ${pago.recurrencia}` : ""}</div>
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

async function manejarAccion(accion, id, pago) {
  if (accion === "pagado") {
    if (!confirm(`¿Marcar "${pago.nombre}" como pagado?`)) return;
    await fetch(`${API}/pagos/${id}/pagado`, { method: "POST" });
    cargarPagos();
  } else if (accion === "editar") {
    abrirFormulario(pago);
  } else if (accion === "eliminar") {
    if (!confirm(`¿Eliminar "${pago.nombre}" definitivamente?`)) return;
    await fetch(`${API}/pagos/${id}`, { method: "DELETE" });
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
  const res = await fetch(`${API}/pagos/historial`);
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
    div.innerHTML = `
      <div class="pago-info">
        <span class="pago-nombre">${h.nombre}</span>
        <div class="pago-meta">${h.categoria} · $${formatMoneda(h.monto)} · pagado el ${h.fecha_pago}</div>
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
    nombre: document.getElementById("pago-nombre").value,
    categoria: document.getElementById("pago-categoria").value,
    monto: document.getElementById("pago-monto").value,
    fecha_vencimiento: document.getElementById("pago-fecha").value,
    recurrencia: document.getElementById("pago-recurrencia").value,
    dias_aviso: document.getElementById("pago-dias-aviso").value,
    notas: document.getElementById("pago-notas").value,
  };

  if (id) {
    await fetch(`${API}/pagos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
  } else {
    await fetch(`${API}/pagos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
  }
  cargarPagos();
});

// ---------- Configuración ----------
async function cargarConfiguracion() {
  const res = await fetch(`${API}/configuracion`);
  const config = await res.json();
  document.getElementById("input-numeros").value = (config.numeros_whatsapp || "").split(",").filter(Boolean).join("\n");
  document.getElementById("input-hora").value = config.hora_recordatorio || "08:00";
  document.getElementById("whatsapp-estado").innerHTML = "";
}

document.getElementById("btn-guardar-config").addEventListener("click", async () => {
  const numeros = document
    .getElementById("input-numeros")
    .value.split(/[\n,]/)
    .map((n) => n.trim())
    .filter(Boolean)
    .join(",");
  const hora = document.getElementById("input-hora").value;

  await fetch(`${API}/configuracion`, {
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
  const res = await fetch(`${API}/configuracion/whatsapp/prueba`, { method: "POST" });
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

// ---------- Inicio ----------
cargarPagos();
