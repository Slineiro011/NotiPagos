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

async function getAll(empresa) {
  const params = [];
  let where = "";
  if (empresa) {
    params.push(empresa);
    where = `WHERE LOWER(empresa) = LOWER($${params.length})`;
  }
  const { rows } = await pool.query(`SELECT * FROM pagos ${where} ORDER BY fecha_vencimiento ASC`, params);
  return rows.map(normalizarFila);
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM pagos WHERE id = $1", [id]);
  return normalizarFila(rows[0]);
}

/**
 * Consulta generica de pagos pendientes, con filtro de rango de fechas opcional
 * (hoy/semana/mes/vencidos/pendientes) y filtro opcional por empresa.
 */
async function getPagos({ filtro, empresa } = {}) {
  const condiciones = ["estado = 'pendiente'"];
  const params = [];

  if (filtro === "hoy") {
    params.push(hoy());
    condiciones.push(`fecha_vencimiento = $${params.length}`);
  } else if (filtro === "semana") {
    params.push(hoy(), dayjs().add(7, "day").format("YYYY-MM-DD"));
    condiciones.push(`fecha_vencimiento BETWEEN $${params.length - 1} AND $${params.length}`);
  } else if (filtro === "mes") {
    params.push(hoy(), dayjs().add(30, "day").format("YYYY-MM-DD"));
    condiciones.push(`fecha_vencimiento BETWEEN $${params.length - 1} AND $${params.length}`);
  } else if (filtro === "vencidos") {
    params.push(hoy());
    condiciones.push(`fecha_vencimiento < $${params.length}`);
  }
  // "pendientes" (o sin filtro): sin condicion extra de fecha, solo estado='pendiente'

  if (empresa) {
    params.push(empresa);
    condiciones.push(`LOWER(empresa) = LOWER($${params.length})`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM pagos WHERE ${condiciones.join(" AND ")} ORDER BY fecha_vencimiento ASC`,
    params
  );
  return rows.map(normalizarFila);
}

const getPendientes = (empresa) => getPagos({ filtro: "pendientes", empresa });
const getDeHoy = (empresa) => getPagos({ filtro: "hoy", empresa });
const getDeLaSemana = (empresa) => getPagos({ filtro: "semana", empresa });
const getDelMes = (empresa) => getPagos({ filtro: "mes", empresa });
const getVencidos = (empresa) => getPagos({ filtro: "vencidos", empresa });

async function getEmpresas() {
  const { rows } = await pool.query(
    "SELECT DISTINCT empresa FROM pagos WHERE empresa IS NOT NULL AND empresa <> '' ORDER BY empresa"
  );
  return rows.map((r) => r.empresa);
}

async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO pagos (empresa, nombre, categoria, monto, fecha_vencimiento, recurrencia, dias_aviso, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      data.empresa || "Sin empresa",
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
    `UPDATE pagos SET empresa=$1, nombre=$2, categoria=$3, monto=$4, fecha_vencimiento=$5,
       recurrencia=$6, dias_aviso=$7, notas=$8, estado=$9
     WHERE id=$10 RETURNING *`,
    [
      data.empresa ?? actual.empresa,
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
    `INSERT INTO historial_pagos (pago_id, empresa, nombre, categoria, monto, fecha_vencimiento)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [pago.id, pago.empresa, pago.nombre, pago.categoria, pago.monto, pago.fecha_vencimiento]
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
  getPagos,
  getPendientes,
  getEmpresas,
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
