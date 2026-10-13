const ExcelJS = require("exceljs");
const dayjs = require("dayjs");

function formatMoneda(valor) {
  return Number(valor || 0);
}

function agregarHojaPendientes(workbook, pendientes) {
  const hoja = workbook.addWorksheet("Pendientes");
  hoja.columns = [
    { header: "Empresa", key: "empresa", width: 24 },
    { header: "Pago", key: "nombre", width: 28 },
    { header: "Categoría", key: "categoria", width: 16 },
    { header: "Monto", key: "monto", width: 14, style: { numFmt: "#,##0" } },
    { header: "Vence", key: "fecha_vencimiento", width: 14 },
    { header: "Estado", key: "estado_legible", width: 16 },
    { header: "Creado por", key: "creado_por_nombre", width: 20 },
    { header: "Notas", key: "notas", width: 30 },
  ];
  hoja.getRow(1).font = { bold: true };

  const hoy = dayjs().startOf("day");
  for (const pago of pendientes) {
    const dias = dayjs(pago.fecha_vencimiento).startOf("day").diff(hoy, "day");
    const estadoLegible = dias < 0 ? `Vencido hace ${Math.abs(dias)} día(s)` : dias === 0 ? "Vence hoy" : `Vence en ${dias} día(s)`;
    hoja.addRow({
      empresa: pago.empresa,
      nombre: pago.nombre,
      categoria: pago.categoria,
      monto: formatMoneda(pago.monto),
      fecha_vencimiento: pago.fecha_vencimiento,
      estado_legible: estadoLegible,
      creado_por_nombre: pago.creado_por_nombre || pago.creado_por || "",
      notas: pago.notas || "",
    });
  }

  const totalRow = hoja.addRow({
    empresa: "",
    nombre: "Total pendiente",
    monto: pendientes.reduce((acc, p) => acc + formatMoneda(p.monto), 0),
  });
  totalRow.font = { bold: true };

  return hoja;
}

function agregarHojaPagados(workbook, pagados) {
  const hoja = workbook.addWorksheet("Pagados");
  hoja.columns = [
    { header: "Empresa", key: "empresa", width: 24 },
    { header: "Pago", key: "nombre", width: 28 },
    { header: "Categoría", key: "categoria", width: 16 },
    { header: "Monto", key: "monto", width: 14, style: { numFmt: "#,##0" } },
    { header: "Vencía", key: "fecha_vencimiento", width: 14 },
    { header: "Pagado el", key: "fecha_pago", width: 14 },
    { header: "Creado por", key: "creado_por_nombre", width: 20 },
  ];
  hoja.getRow(1).font = { bold: true };

  for (const pago of pagados) {
    hoja.addRow({
      empresa: pago.empresa,
      nombre: pago.nombre,
      categoria: pago.categoria,
      monto: formatMoneda(pago.monto),
      fecha_vencimiento: pago.fecha_vencimiento,
      fecha_pago: pago.fecha_pago,
      creado_por_nombre: pago.creado_por_nombre || pago.creado_por || "",
    });
  }

  const totalRow = hoja.addRow({
    empresa: "",
    nombre: "Total pagado",
    monto: pagados.reduce((acc, p) => acc + formatMoneda(p.monto), 0),
  });
  totalRow.font = { bold: true };

  return hoja;
}

/** Arma un libro de Excel con una hoja de pagos pendientes y otra de pagados (historial). */
async function generarExcelPagos({ pendientes, pagados }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NotiPagos";
  workbook.created = new Date();

  agregarHojaPendientes(workbook, pendientes);
  agregarHojaPagados(workbook, pagados);

  return workbook.xlsx.writeBuffer();
}

module.exports = { generarExcelPagos };
