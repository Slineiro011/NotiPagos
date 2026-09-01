import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/pago.dart';

final _formatoMoneda = NumberFormat.decimalPattern('es_CO');

class EstadoVisual {
  final String texto;
  final Color color;
  final Color fondo;

  EstadoVisual(this.texto, this.color, this.fondo);
}

EstadoVisual estadoVisual(Pago pago) {
  if (pago.estado == 'pagado') {
    return EstadoVisual('Pagado', const Color(0xFF16A34A), const Color(0xFFDCFCE7));
  }
  final dias = pago.diasRestantes;
  if (dias < 0) {
    return EstadoVisual('Vencido hace ${dias.abs()}d', const Color(0xFFDC2626), const Color(0xFFFECACA));
  }
  if (dias == 0) {
    return EstadoVisual('Vence hoy', const Color(0xFFDC2626), const Color(0xFFFEE2E2));
  }
  if (dias <= pago.diasAviso) {
    return EstadoVisual('Vence en ${dias}d', const Color(0xFFD97706), const Color(0xFFFEF3C7));
  }
  return EstadoVisual('Vence en ${dias}d', const Color(0xFF2563EB), const Color(0xFFE0E7FF));
}

class PagoCard extends StatelessWidget {
  final Pago pago;
  final VoidCallback onTap;
  final VoidCallback? onMarcarPagado;
  final VoidCallback onEliminar;

  const PagoCard({
    super.key,
    required this.pago,
    required this.onTap,
    required this.onMarcarPagado,
    required this.onEliminar,
  });

  @override
  Widget build(BuildContext context) {
    final estado = estadoVisual(pago);
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      pago.nombre,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15.5),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: estado.fondo, borderRadius: BorderRadius.circular(999)),
                    child: Text(
                      estado.texto,
                      style: TextStyle(color: estado.color, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                '🏢 ${pago.empresa} · ${pago.categoria} · \$${_formatoMoneda.format(pago.monto)} · vence ${pago.fechaVencimiento}'
                '${pago.recurrencia != 'ninguna' ? ' · se repite: ${pago.recurrencia}' : ''}',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 12.5),
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (onMarcarPagado != null)
                    TextButton.icon(
                      onPressed: onMarcarPagado,
                      icon: const Icon(Icons.check_circle_outline, size: 18, color: Color(0xFF16A34A)),
                      label: const Text('Pagado', style: TextStyle(color: Color(0xFF16A34A))),
                    ),
                  TextButton.icon(
                    onPressed: onEliminar,
                    icon: const Icon(Icons.delete_outline, size: 18, color: Color(0xFFDC2626)),
                    label: const Text('Eliminar', style: TextStyle(color: Color(0xFFDC2626))),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
