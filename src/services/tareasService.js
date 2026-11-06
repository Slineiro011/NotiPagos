const dayjs = require("dayjs");
const { pool } = require("../db");
const {
  RECURRENCIAS,
  siguienteFecha,
  proximaFechaVigente,
  esVisibilidadRestringida,
  puedeFiltrarPorUsuario,
} = require("../utils/recordatorios");

const SELECT_TAREAS = `
  SELECT tareas.*, usuarios.nombre AS creado_por_nombre
  FROM tareas
  LEFT JOIN usuarios ON usuarios.usuario = tareas.creado_por
`;

function normalizarFila(row) {
  if (!row) return row;
  return { ...row, fecha_vencimiento: dayjs(row.fecha_vencimiento).format("YYYY-MM-DD") };
}

/**
 * Las tareas que se repiten pasan solas a su siguiente fecha cuando la actual
 * ya paso, aunque no se hayan marcado como hechas. Las que no se repiten se
 * quedan como vencidas.
 */
async function avanzarRepetidasVencidas(cuentaId) {
  const hoy = dayjs().format("YYYY-MM-DD");
  const { rows } = await pool.query(
    `SELECT id, fecha_vencimiento, recurrencia FROM tareas
     WHERE cuenta_id = $1 AND estado = 'pendiente' AND recurrencia <> 'ninguna' AND fecha_vencimiento < $2`,
    [cuentaId, hoy]
  );
  for (const tarea of rows) {
    const proxima = proximaFechaVigente(tarea.fecha_vencimiento, tarea.recurrencia, hoy);
    await pool.query("UPDATE tareas SET fecha_vencimiento = $1 WHERE id = $2", [proxima, tarea.id]);
  }
}

/** Tareas pendientes de una cuenta. usuarioFiltro solo aplica si quien pregunta es jefe. */
async function getPendientes(cuentaId, usuarioActual, usuarioFiltro) {
  await avanzarRepetidasVencidas(cuentaId);
  const condiciones = ["tareas.estado = 'pendiente'", "tareas.cuenta_id = $1"];
  const params = [cuentaId];
  if (esVisibilidadRestringida(usuarioActual)) {
    params.push(usuarioActual.usuario);
    condiciones.push(`creado_por = $${params.length}`);
  } else if (usuarioFiltro && puedeFiltrarPorUsuario(usuarioActual)) {
    params.push(usuarioFiltro);
    condiciones.push(`creado_por = $${params.length}`);
  }
  const { rows } = await pool.query(
    `${SELECT_TAREAS} WHERE ${condiciones.join(" AND ")} ORDER BY fecha_vencimiento ASC`,
    params
  );
  return rows.map(normalizarFila);
}

async function getById(id, usuarioActual, cuentaId) {
  const { rows } = await pool.query(`${SELECT_TAREAS} WHERE tareas.id = $1`, [id]);
  const tarea = normalizarFila(rows[0]);
  if (!tarea) return null;
  if (cuentaId !== undefined && tarea.cuenta_id !== cuentaId) return null;
  if (esVisibilidadRestringida(usuarioActual) && tarea.creado_por !== usuarioActual.usuario) return null;
  return tarea;
}

async function create(data, usuarioActual, cuentaId) {
  const { rows } = await pool.query(
    `INSERT INTO tareas (cuenta_id, nombre, fecha_vencimiento, recurrencia, dias_aviso, notas, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      cuentaId,
      data.nombre,
      data.fecha_vencimiento,
      RECURRENCIAS.includes(data.recurrencia) ? data.recurrencia : "ninguna",
      Number(data.dias_aviso ?? 1),
      data.notas || "",
      usuarioActual?.usuario ?? null,
    ]
  );
  return getById(rows[0].id);
}

async function update(id, data, usuarioActual, cuentaId) {
  const actual = await getById(id, usuarioActual, cuentaId);
  if (!actual) return null;
  await pool.query(
    `UPDATE tareas SET nombre=$1, fecha_vencimiento=$2, recurrencia=$3, dias_aviso=$4, notas=$5, estado=$6 WHERE id=$7`,
    [
      data.nombre ?? actual.nombre,
      data.fecha_vencimiento ?? actual.fecha_vencimiento,
      RECURRENCIAS.includes(data.recurrencia) ? data.recurrencia : actual.recurrencia,
      data.dias_aviso !== undefined ? Number(data.dias_aviso) : actual.dias_aviso,
      data.notas ?? actual.notas,
      data.estado ?? actual.estado,
      id,
    ]
  );
  return getById(id);
}

async function remove(id, usuarioActual, cuentaId) {
  const actual = await getById(id, usuarioActual, cuentaId);
  if (!actual) return false;
  await pool.query("DELETE FROM tareas WHERE id = $1", [id]);
  return true;
}

/** Si la tarea se repite, avanza la fecha; si no, queda marcada como hecha. */
async function marcarHecha(id, usuarioActual, cuentaId) {
  const tarea = await getById(id, usuarioActual, cuentaId);
  if (!tarea) return null;

  const proxima = siguienteFecha(tarea.fecha_vencimiento, tarea.recurrencia);
  if (proxima) {
    await pool.query("UPDATE tareas SET fecha_vencimiento=$1 WHERE id=$2", [proxima, id]);
  } else {
    await pool.query("UPDATE tareas SET estado='hecha' WHERE id=$1", [id]);
  }
  return getById(id);
}

/** Uso interno del programador: pendientes de una cuenta. */
async function getProximos(cuentaId) {
  await avanzarRepetidasVencidas(cuentaId);
  const { rows } = await pool.query(
    "SELECT * FROM tareas WHERE estado = 'pendiente' AND cuenta_id = $1 ORDER BY fecha_vencimiento ASC",
    [cuentaId]
  );
  return rows.map(normalizarFila);
}

async function yaSeAviso(tareaId, fecha) {
  const { rows } = await pool.query(
    "SELECT 1 FROM avisos_tareas_enviados WHERE tarea_id = $1 AND fecha = $2",
    [tareaId, fecha]
  );
  return rows.length > 0;
}

async function registrarAviso(tareaId, fecha) {
  await pool.query(
    "INSERT INTO avisos_tareas_enviados (tarea_id, fecha) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [tareaId, fecha]
  );
}

module.exports = {
  getPendientes,
  getById,
  create,
  update,
  remove,
  marcarHecha,
  getProximos,
  yaSeAviso,
  registrarAviso,
  RECURRENCIAS,
};
