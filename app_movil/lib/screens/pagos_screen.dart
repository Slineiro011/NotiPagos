import 'package:flutter/material.dart';
import '../models/pago.dart';
import '../services/api_service.dart';
import '../widgets/pago_card.dart';
import 'pago_form_screen.dart';

class PagosScreen extends StatefulWidget {
  const PagosScreen({super.key});

  @override
  State<PagosScreen> createState() => _PagosScreenState();
}

class _PagosScreenState extends State<PagosScreen> {
  String _filtro = 'pendientes';
  String? _empresaFiltro;
  List<String> _empresas = [];
  Future<List<Pago>>? _futurePagos;

  final _filtros = const [
    ['pendientes', 'Pendientes'],
    ['hoy', 'Hoy'],
    ['semana', 'Esta semana'],
    ['mes', 'Este mes'],
    ['vencidos', 'Vencidos'],
    ['', 'Todos'],
  ];

  @override
  void initState() {
    super.initState();
    _cargar();
    _cargarEmpresas();
  }

  void _cargar() {
    setState(() {
      _futurePagos = ApiService.getPagos(filtro: _filtro, empresa: _empresaFiltro);
    });
  }

  Future<void> _cargarEmpresas() async {
    try {
      final empresas = await ApiService.getEmpresas();
      if (mounted) setState(() => _empresas = empresas);
    } catch (_) {
      // silencioso: el filtro de empresa simplemente queda vacio
    }
  }

  Future<void> _abrirFormulario({Pago? pago}) async {
    final guardado = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => PagoFormScreen(pago: pago, empresasConocidas: _empresas)),
    );
    if (guardado == true) {
      _cargar();
      _cargarEmpresas();
    }
  }

  Future<void> _marcarPagado(Pago pago) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Marcar como pagado'),
        content: Text('¿Confirmas que "${pago.nombre}" ya se pagó?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirmar')),
        ],
      ),
    );
    if (confirmar != true) return;
    await ApiService.marcarPagado(pago.id);
    _cargar();
  }

  Future<void> _eliminar(Pago pago) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Eliminar pago'),
        content: Text('¿Eliminar "${pago.nombre}" definitivamente?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmar != true) return;
    await ApiService.eliminarPago(pago.id);
    _cargar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
            child: SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _filtros.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (context, i) {
                  final valor = _filtros[i][0];
                  final etiqueta = _filtros[i][1];
                  final activo = valor == _filtro;
                  return ChoiceChip(
                    label: Text(etiqueta),
                    selected: activo,
                    onSelected: (_) {
                      _filtro = valor;
                      _cargar();
                    },
                  );
                },
              ),
            ),
          ),
          if (_empresas.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
              child: DropdownButtonFormField<String?>(
                initialValue: _empresaFiltro,
                isDense: true,
                decoration: const InputDecoration(
                  labelText: 'Empresa',
                  border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                ),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Todas las empresas')),
                  ..._empresas.map((e) => DropdownMenuItem(value: e, child: Text(e))),
                ],
                onChanged: (v) {
                  _empresaFiltro = v;
                  _cargar();
                },
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                _cargar();
                await _futurePagos;
              },
              child: FutureBuilder<List<Pago>>(
                future: _futurePagos,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text('No se pudo cargar: ${snapshot.error}', textAlign: TextAlign.center),
                      ),
                    );
                  }
                  final pagos = snapshot.data ?? [];
                  if (pagos.isEmpty) {
                    return const Center(child: Text('No hay pagos para este filtro.'));
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.only(top: 6, bottom: 80),
                    itemCount: pagos.length,
                    itemBuilder: (context, i) {
                      final pago = pagos[i];
                      return PagoCard(
                        pago: pago,
                        onTap: () => _abrirFormulario(pago: pago),
                        onMarcarPagado: pago.estado == 'pendiente' ? () => _marcarPagado(pago) : null,
                        onEliminar: () => _eliminar(pago),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _abrirFormulario(),
        icon: const Icon(Icons.add),
        label: const Text('Nuevo pago'),
      ),
    );
  }
}
