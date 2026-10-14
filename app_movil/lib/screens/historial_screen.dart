import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../widgets/cargando.dart';
import '../widgets/pago_card.dart' show EncabezadoMes, etiquetaMes;

final _formatoMoneda = NumberFormat.decimalPattern('es_CO');

class HistorialScreen extends StatefulWidget {
  const HistorialScreen({super.key});

  @override
  State<HistorialScreen> createState() => _HistorialScreenState();
}

class _HistorialScreenState extends State<HistorialScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = ApiService.getHistorial();
  }

  Future<void> _recargar() async {
    setState(() => _future = ApiService.getHistorial());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _recargar,
        child: FutureBuilder<List<Map<String, dynamic>>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Cargando();
            }
            if (snapshot.hasError) {
              return Center(child: Text('No se pudo cargar: ${mensajeError(snapshot.error!)}', textAlign: TextAlign.center));
            }
            final historial = snapshot.data ?? [];
            if (historial.isEmpty) {
              return const Center(child: Text('Aún no hay pagos registrados en el historial.'));
            }
            // Agrupados por mes de pago (ya vienen ordenados por fecha_pago
            // desde el servidor), para que no se vea "revuelto".
            final items = <Object>[];
            String? claveActual;
            for (final h in historial) {
              final fechaPago = h['fecha_pago'] as String?;
              final clave = fechaPago?.substring(0, 7);
              if (clave != null && clave != claveActual) {
                claveActual = clave;
                items.add(etiquetaMes(fechaPago!));
              }
              items.add(h);
            }

            return ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: items.length,
              itemBuilder: (context, i) {
                final item = items[i];
                if (item is String) return EncabezadoMes(item);
                final h = item as Map<String, dynamic>;
                final monto = (h['monto'] is num) ? (h['monto'] as num).toDouble() : 0.0;
                final creador = (h['creado_por_nombre'] ?? h['creado_por']) as String?;
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${h['nombre']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text(
                          '🏢 ${h['empresa']} · ${h['categoria']} · \$${_formatoMoneda.format(monto)} · pagado el ${(h['fecha_pago'] as String).substring(0, 10)}'
                          '${creador != null ? ' · 👤 $creador' : ''}',
                          style: TextStyle(color: Colors.grey.shade600, fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
