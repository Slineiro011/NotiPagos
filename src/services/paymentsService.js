const dayjs = require("dayjs");
const { pool } = require("../db");

const MESES_POR_RECURRENCIA = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

const RECURRENCIAS = ["ninguna", ...Object.keys(MESES_POR_RECURRENCIA)];

function hoy() {
  return dayjs().format("YYYY-MM-DD");
}

function normalizarFila(row) {
  if (!row) return row;
  return {
    ...row,
    monto: Number(row.monto),
    fecha_vencimiento: dayjs(row.fecha_vencimiento).format("YYYY-MM-DD"),
  };
}

async function getAll() {
  const { rows } = await pool.query("SELECT * FROM pagos ORDER BY fecha_vencimiento ASC");
  return rows.map(normalizarFila);
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM pagos WHERE id = $1", [id]);
  return normalizarFila(rows[0]);
}

async function getPendientes() {
  const { rows } = await pool.query(
    "SELECT * FROM pagos WHERE estado = 'pendiente' ORDER BY fecha_vencimiento ASC"
  );
  return rows.map(normalizarFila);
}

async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO pagos (nombre, categoria, monto, fecha_vencimiento, recurrencia, dias_aviso, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      data.nombre,
      data.categoria || "Otro",
      Number(data.monto) || 0,
      data.fecha_vencimiento,
      data.recurrencia || "ninguna",
      Number(data.dias_aviso ?? 3),
      data.notas || "",
    ]
  );
  return normalizarFila(rows[0]);
}

async function update(id, data) {
  const actual = await getById(id);
  if (!actual) return null;
  const { rows } = await pool.query(
    `UPDATE pagos SET nombre=$1, categoria=$2, monto=$3, fecha_vencimiento=$4,
       recurrencia=$5, dias_aviso=$6, notas=$7, estado=$8
     WHERE id=$9 RETURNING *`,
    [
      data.nombre ?? actual.nombre,
      data.categoria ?? actual.categoria,
      data.monto !== undefined ? Number(data.monto) : actual.monto,
      data.fecha_vencimiento ?? actual.fecha_vencimiento,
      data.recurrencia ?? actual.recurrencia,
      data.dias_aviso !== undefined ? Number(data.dias_aviso) : actual.dias_aviso,
      data.notas ?? actual.notas,
      data.estado ?? actual.estado,
      id,
    ]
  );
  return normalizarFila(rows[0]);
}

async function remove(id) {
  await pool.query("DELETE FROM pagos WHERE id = $1", [id]);
}

function siguienteFecha(fecha, recurrencia) {
  const meses = MESES_POR_RECURRENCIA[recurrencia];
  if (!meses) return null;
  return dayjs(fecha).add(meses, "month").format("YYYY-MM-DD");
}

async function marcarPagado(id) {
  const pago = await getById(id);
  if (!pago) return null;

  await pool.query(
    `INSERT INTO historial_pagos (pago_id, nombre, categoria, monto, fecha_vencimiento)
     VALUES ($1, $2, $3, $4, $5)`,
    [pago.id, pago.nombre, pago.categoria, pago.monto, pago.fecha_vencimiento]
  );

  const proxima = siguienteFecha(pago.fecha_vencimiento, pago.recurrencia);
  if (proxima) {
    await pool.query("UPDATE pagos SET estado='pendiente', fecha_vencimiento=$1 WHERE id=$2", [proxima, id]);
  } else {
    await pool.query("UPDATE pagos SET estado='pagado' WHERE id=$1", [id]);
  }

  return getById(id);
}

async function getHistorial(limit = 100) {
  const { rows } = await pool.query(
    "SELECT * FROM historial_pagos ORDER BY fecha_pago DESC LIMIT $1",
    [limit]
  );
  return rows.map((r) => ({ ...r, monto: Number(r.monto) }));
}

/** Pagos pendientes con vencimiento entre hoy y `dias` dias adelante (incluye vencidos). */
async function getProximos(dias) {
  const limite = dayjs().add(dias, "day").format("YYYY-MM-DD");
  const { rows } = await pool.query(
    `SELECT * FROM pagos WHERE estado = 'pendiente' AND fecha_vencimiento <= $1
     ORDER BY fecha_vencimiento ASC`,
    [limite]
  );
  return rows.map(normalizarFila);
}

async function getVencidos() {
  const { rows } = await pool.query(
    `SELECT * FROM pagos WHERE estado = 'pendiente' AND fecha_vencimiento < $1
     ORDER BY fecha_vencimiento ASC`,
    [hoy()]
  );
  return rows.map(normalizarFila);
}

async function getDeHoy() {
  const { rows } = await pool.query(
    "SELECT * FROM pagos WHERE estado='pendiente' AND fecha_vencimiento = $1",
    [hoy()]
  );
  return rows.map(normalizarFila);
}

async function getDeLaSemana() {
  const inicio = hoy();
  const fin = dayjs().add(7, "day").format("YYYY-MM-DD");
  const { rows } = await pool.query(
    `SELECT * FROM pagos WHERE estado='pendiente' AND fecha_vencimiento BETWEEN $1 AND $2
     ORDER BY fecha_vencimiento ASC`,
    [inicio, fin]
  );
  return rows.map(normalizarFila);
}

async function getDelMes() {
  const inicio = hoy();
  const fin = dayjs().add(30, "day").format("YYYY-MM-DD");
  const { rows } = await pool.query(
    `SELECT * FROM pagos WHERE estado='pendiente' AND fecha_vencimiento BETWEEN $1 AND $2
     ORDER BY fecha_vencimiento ASC`,
    [inicio, fin]
  );
  return rows.map(normalizarFila);
}

async function yaSeAviso(pagoId, fecha) {
  const { rows } = await pool.query(
    "SELECT 1 FROM avisos_enviados WHERE pago_id = $1 AND fecha = $2",
    [pagoId, fecha]
  );
  return rows.length > 0;
}

async function registrarAviso(pagoId, fecha) {
  await pool.query(
    "INSERT INTO avisos_enviados (pago_id, fecha) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [pagoId, fecha]
  );
}

module.exports = {
  getAll,
  getById,
  getPendientes,
  create,
  update,
  remove,
  marcarPagado,
  getHistorial,
  getProximos,
  getVencidos,
  getDeHoy,
  getDeLaSemana,
  getDelMes,
  yaSeAviso,
  registrarAviso,
  RECURRENCIAS,
};
