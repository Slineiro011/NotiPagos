import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/pago.dart';
import '../services/api_service.dart';
import '../services/notificaciones_service.dart';
import '../widgets/cargando.dart';
import '../widgets/pago_card.dart';
import 'pago_form_screen.dart';

class PagosScreen extends StatefulWidget {
  const PagosScreen({super.key});

  @override
  State<PagosScreen> createState() => _PagosScreenState();
}

class _PagosScreenState extends State<PagosScreen> {
  String _filtro = 'mes';
  String? _empresaFiltro;
  String? _usuarioFiltro;
  List<String> _empresas = [];
  List<Map<String, dynamic>> _usuarios = [];
  bool _esJefe = false;
  Future<List<Pago>>? _futurePagos;
  final _busquedaCtrl = TextEditingController();
  String _busqueda = '';

  /// Pagos con una accion esperando el "Deshacer": se ocultan de la lista
  /// mientras tanto para que se vea el efecto de inmediato.
  final Set<int> _ocultos = {};

  final _filtros = const [
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
    _cargarUsuarios();
    NotificacionesService.pagoPorAbrir.addListener(_atenderPagoPorAbrir);
    // Por si la app se abrio tocando un recordatorio antes de que esta
    // pantalla existiera (ej. habia que iniciar sesion primero).
    WidgetsBinding.instance.addPostFrameCallback((_) => _atenderPagoPorAbrir());
  }

  @override
  void dispose() {
    NotificacionesService.pagoPorAbrir.removeListener(_atenderPagoPorAbrir);
    _busquedaCtrl.dispose();
    super.dispose();
  }

  void _cargar() {
    setState(() {
      _futurePagos = ApiService.getPagos(filtro: _filtro, empresa: _empresaFiltro, usuario: _usuarioFiltro);
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

  Future<void> _cargarUsuarios() async {
    final esJefe = await ApiService.esJefe();
    if (!esJefe) return;
    try {
      final usuarios = await ApiService.getUsuarios();
      if (mounted) {
        setState(() {
          _esJefe = true;
          _usuarios = usuarios;
        });
      }
    } catch (_) {
      // silencioso: el filtro de usuario simplemente queda vacio
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

  Future<void> _marcarPagado(Pago pago, {bool pedirConfirmacion = true}) async {
    if (pedirConfirmacion && !await _confirmarPagado(pago)) return;
    await _accionConDeshacer(
      pago,
      mensaje: '"${pago.nombre}" confirmado como pagado',
      accion: () => ApiService.marcarPagado(pago.id),
    );
  }

  Future<bool> _confirmarPagado(Pago pago) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Confirmar como pagado'),
        content: Text('¿Confirmas que "${pago.nombre}" ya se pagó?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirmar')),
        ],
      ),
    );
    return confirmar == true;
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
    await _accionConDeshacer(
      pago,
      mensaje: '"${pago.nombre}" eliminado',
      accion: () => ApiService.eliminarPago(pago.id),
    );
  }

  /// Oculta el pago y espera unos segundos antes de mandar la accion al
  /// servidor; si tocan "Deshacer" en ese tiempo, nunca se envia. Se hace asi
  /// porque confirmar un pago no se puede revertir en el servidor (queda en
  /// el historial y, si es recurrente, ya paso al siguiente periodo).
  Future<void> _accionConDeshacer(
    Pago pago, {
    required String mensaje,
    required Future<void> Function() accion,
  }) async {
    final mensajero = ScaffoldMessenger.of(context);
    setState(() => _ocultos.add(pago.id));
    // Si habia otra accion esperando, cerrar su aviso la ejecuta ya.
    mensajero.hideCurrentSnackBar();
    final cierre = await mensajero
        .showSnackBar(SnackBar(
          content: Text(mensaje),
          duration: const Duration(seconds: 5),
          // Con boton, Flutter deja el aviso abierto indefinidamente si no se indica esto.
          persist: false,
          action: SnackBarAction(label: 'Deshacer', onPressed: () {}),
        ))
        .closed;

    if (cierre == SnackBarClosedReason.action) {
      if (mounted) setState(() => _ocultos.remove(pago.id));
      return;
    }
    try {
      await accion();
    } catch (e) {
      // Un fallo de red antes pasaba en silencio y parecia que habia funcionado.
      mensajero.showSnackBar(SnackBar(content: Text(mensajeError(e))));
    }
    _ocultos.remove(pago.id);
    if (mounted) _cargar();
  }

  /// Muestra el pago del recordatorio que se toco (o que llego con la app
  /// abierta), con la opcion de confirmarlo directamente.
  Future<void> _atenderPagoPorAbrir() async {
    final id = NotificacionesService.pagoPorAbrir.value;
    if (id == null || !mounted) return;
    NotificacionesService.pagoPorAbrir.value = null;

    final Pago pago;
    try {
      pago = await ApiService.getPago(id);
    } catch (e) {
      await NotificacionesService.detenerAlarma();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo abrir el pago: ${mensajeError(e)}')));
      }
      return;
    }
    if (!mounted) return;

    final estado = estadoVisual(pago);
    final eleccion = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (contextoDialogo) => AlertDialog(
        title: const Text('🔔 Recordatorio de pago'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(pago.nombre, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
            const SizedBox(height: 6),
            Text('🏢 ${pago.empresa} · \$${_formatoMoneda.format(pago.monto)}\nVence ${pago.fechaVencimiento}'),
            const SizedBox(height: 8),
            Text(estado.texto, style: TextStyle(color: estado.color, fontWeight: FontWeight.w600)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(contextoDialogo, 'cerrar'),
            child: const Text('🔕 Apagar alarma'),
          ),
          TextButton(onPressed: () => Navigator.pop(contextoDialogo, 'editar'), child: const Text('Ver / editar')),
          if (pago.estado == 'pendiente')
            FilledButton(
              onPressed: () => Navigator.pop(contextoDialogo, 'pagado'),
              child: const Text('Confirmar como pagado'),
            ),
        ],
      ),
    );
    // Cualquier respuesta significa que ya vieron el recordatorio.
    await NotificacionesService.detenerAlarma();
    if (!mounted) return;
    if (eleccion == 'editar') await _abrirFormulario(pago: pago);
    // Este dialogo ya es la confirmacion; no se pregunta dos veces.
    if (eleccion == 'pagado') await _marcarPagado(pago, pedirConfirmacion: false);
  }

  /// Sin tildes y en minusculas, para que "poliza" encuentre "Póliza".
  static String _normalizar(String texto) {
    const conTilde = 'áéíóúüñ';
    const sinTilde = 'aeiouun';
    final minus = texto.toLowerCase();
    final buffer = StringBuffer();
    for (final letra in minus.split('')) {
      final i = conTilde.indexOf(letra);
      buffer.write(i >= 0 ? sinTilde[i] : letra);
    }
    return buffer.toString();
  }

  List<Pago> _filtrarPorBusqueda(List<Pago> pagos) {
    final termino = _normalizar(_busqueda.trim());
    if (termino.isEmpty) return pagos;
    return pagos
        .where((p) => _normalizar('${p.nombre} ${p.empresa} ${p.categoria} ${p.notas}').contains(termino))
        .toList();
  }

  String get _etiquetaFiltro => _filtros.firstWhere((f) => f[0] == _filtro, orElse: () => ['', 'Todos'])[1];

  /// Intercala encabezados de mes ("Noviembre 2026") entre los pagos, para
  /// que no se vea "revuelto" cuando hay pagos de meses muy distintos
  /// mezclados en la misma lista (ej. recurrentes programados a futuro).
  /// Los pagos ya llegan ordenados por fecha_vencimiento desde el servidor.
  List<Object> _agruparPorMes(List<Pago> pagos) {
    final items = <Object>[];
    String? claveActual;
    for (final pago in pagos) {
      final clave = pago.fechaVencimiento.substring(0, 7); // "2026-11"
      if (clave != claveActual) {
        claveActual = clave;
        items.add(etiquetaMes(pago.fechaVencimiento));
      }
      items.add(pago);
    }
    return items;
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
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
            child: TextField(
              controller: _busquedaCtrl,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Buscar por nombre, empresa o categoría',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _busqueda.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        tooltip: 'Limpiar búsqueda',
                        onPressed: () {
                          _busquedaCtrl.clear();
                          setState(() => _busqueda = '');
                        },
                      ),
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _busqueda = v),
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
          if (_esJefe && _usuarios.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
              child: DropdownButtonFormField<String?>(
                initialValue: _usuarioFiltro,
                isDense: true,
                decoration: const InputDecoration(
                  labelText: 'Usuario',
                  border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                ),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Todos los usuarios')),
                  ..._usuarios.map(
                    (u) => DropdownMenuItem(
                      value: u['usuario'] as String,
                      child: Text((u['nombre'] as String?)?.isNotEmpty == true ? u['nombre'] as String : u['usuario'] as String),
                    ),
                  ),
                ],
                onChanged: (v) {
                  _usuarioFiltro = v;
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
                    return const Cargando();
                  }
                  if (snapshot.hasError) {
                    return _mensajeCentrado('No se pudo cargar: ${mensajeError(snapshot.error!)}');
                  }
                  final todos = (snapshot.data ?? []).where((p) => !_ocultos.contains(p.id)).toList();
                  if (todos.isEmpty) {
                    return _mensajeCentrado('No hay pagos para este filtro.');
                  }
                  final pagos = _filtrarPorBusqueda(todos);
                  if (pagos.isEmpty) {
                    return _mensajeCentrado('Ningún pago coincide con "${_busqueda.trim()}".');
                  }
                  final items = _agruparPorMes(pagos);
                  return ListView.builder(
                    padding: const EdgeInsets.only(top: 6, bottom: 80),
                    itemCount: items.length + 1,
                    itemBuilder: (context, i) {
                      if (i == 0) return _ResumenPagos(titulo: _etiquetaFiltro, pagos: pagos);
                      final item = items[i - 1];
                      if (item is String) return EncabezadoMes(item);
                      final pago = item as Pago;
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

  /// Dentro de un ListView para que se pueda jalar hacia abajo y reintentar.
  Widget _mensajeCentrado(String texto) {
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
          child: Text(texto, textAlign: TextAlign.center),
        ),
      ],
    );
  }
}

final _formatoMoneda = NumberFormat.decimalPattern('es_CO');

/// Totales de lo que se esta viendo (filtro + busqueda): cantidad, monto y
/// cuantos estan vencidos.
class _ResumenPagos extends StatelessWidget {
  final String titulo;
  final List<Pago> pagos;

  const _ResumenPagos({required this.titulo, required this.pagos});

  @override
  Widget build(BuildContext context) {
    final total = pagos.fold<double>(0, (suma, p) => suma + p.monto);
    final vencidos = pagos.where((p) => p.estado == 'pendiente' && p.diasRestantes < 0).length;
    final colores = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      color: colores.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(titulo, style: TextStyle(color: colores.onPrimaryContainer, fontSize: 12.5)),
            const SizedBox(height: 2),
            Text(
              '\$${_formatoMoneda.format(total)}',
              style: TextStyle(color: colores.onPrimaryContainer, fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 2),
            Text(
              '${pagos.length} ${pagos.length == 1 ? 'pago' : 'pagos'}'
              '${vencidos > 0 ? ' · $vencidos ${vencidos == 1 ? 'vencido' : 'vencidos'}' : ''}',
              style: TextStyle(
                color: vencidos > 0 ? const Color(0xFFDC2626) : colores.onPrimaryContainer,
                fontSize: 13,
                fontWeight: vencidos > 0 ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
