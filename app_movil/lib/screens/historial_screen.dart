import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';

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
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return Center(child: Text('No se pudo cargar: ${snapshot.error}'));
            }
            final historial = snapshot.data ?? [];
            if (historial.isEmpty) {
              return const Center(child: Text('Aún no hay pagos registrados en el historial.'));
            }
            return ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: historial.length,
              itemBuilder: (context, i) {
                final h = historial[i];
                final monto = (h['monto'] is num) ? (h['monto'] as num).toDouble() : 0.0;
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
                          '🏢 ${h['empresa']} · ${h['categoria']} · \$${_formatoMoneda.format(monto)} · pagado el ${h['fecha_pago']}',
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
