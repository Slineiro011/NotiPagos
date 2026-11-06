import 'package:flutter/material.dart';
import '../models/tarea.dart';
import '../services/api_service.dart';
import '../services/notificaciones_service.dart';
import '../widgets/cargando.dart';
import 'tarea_form_screen.dart';

class TareasScreen extends StatefulWidget {
  const TareasScreen({super.key});

  @override
  State<TareasScreen> createState() => _TareasScreenState();
}

class _TareasScreenState extends State<TareasScreen> {
  Future<List<Tarea>>? _futureTareas;
  final Set<int> _ocultas = {};

  @override
  void initState() {
    super.initState();
    _cargar();
    NotificacionesService.tareaPorAbrir.addListener(_atenderTareaPorAbrir);
    WidgetsBinding.instance.addPostFrameCallback((_) => _atenderTareaPorAbrir());
  }

  @override
  void dispose() {
    NotificacionesService.tareaPorAbrir.removeListener(_atenderTareaPorAbrir);
    super.dispose();
  }

  void _cargar() {
    setState(() {
      _futureTareas = ApiService.getTareas();
    });
  }

  Future<void> _abrirFormulario({Tarea? tarea}) async {
    final guardado = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => TareaFormScreen(tarea: tarea)),
    );
    if (guardado == true) _cargar();
  }

  Future<void> _marcarHecha(Tarea tarea) async {
    await _accionConDeshacer(
      tarea,
      mensaje: '"${tarea.nombre}" marcada como hecha',
      accion: () => ApiService.marcarTareaHecha(tarea.id),
    );
  }

  Future<void> _eliminar(Tarea tarea) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Eliminar tarea'),
        content: Text('¿Eliminar "${tarea.nombre}" definitivamente?'),
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
      tarea,
      mensaje: '"${tarea.nombre}" eliminada',
      accion: () => ApiService.eliminarTarea(tarea.id),
    );
  }

  Future<void> _accionConDeshacer(
    Tarea tarea, {
    required String mensaje,
    required Future<void> Function() accion,
  }) async {
    final mensajero = ScaffoldMessenger.of(context);
    setState(() => _ocultas.add(tarea.id));
    mensajero.hideCurrentSnackBar();
    final cierre = await mensajero
        .showSnackBar(SnackBar(
          content: Text(mensaje),
          duration: const Duration(seconds: 5),
          persist: false,
          action: SnackBarAction(label: 'Deshacer', onPressed: () {}),
        ))
        .closed;

    if (cierre == SnackBarClosedReason.action) {
      if (mounted) setState(() => _ocultas.remove(tarea.id));
      return;
    }
    try {
      await accion();
    } catch (e) {
      mensajero.showSnackBar(SnackBar(content: Text(mensajeError(e))));
    }
    _ocultas.remove(tarea.id);
    if (mounted) _cargar();
  }

  Future<void> _atenderTareaPorAbrir() async {
    final id = NotificacionesService.tareaPorAbrir.value;
    if (id == null || !mounted) return;
    NotificacionesService.tareaPorAbrir.value = null;

    final Tarea tarea;
    try {
      tarea = await ApiService.getTarea(id);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo abrir la tarea: ${mensajeError(e)}')));
      }
      return;
    }
    if (!mounted) return;

    final eleccion = await showDialog<String>(
      context: context,
      builder: (contextoDialogo) => AlertDialog(
        title: const Text('📌 Recordatorio'),
        content: Text(tarea.nombre),
        actions: [
          TextButton(onPressed: () => Navigator.pop(contextoDialogo, 'cerrar'), child: const Text('Cerrar')),
          TextButton(onPressed: () => Navigator.pop(contextoDialogo, 'editar'), child: const Text('Ver / editar')),
          FilledButton(onPressed: () => Navigator.pop(contextoDialogo, 'hecha'), child: const Text('Marcar como hecha')),
        ],
      ),
    );
    if (!mounted) return;
    if (eleccion == 'editar') await _abrirFormulario(tarea: tarea);
    if (eleccion == 'hecha') await _marcarHecha(tarea);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          _cargar();
          await _futureTareas;
        },
        child: FutureBuilder<List<Tarea>>(
          future: _futureTareas,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Cargando();
            }
            if (snapshot.hasError) {
              return _mensajeCentrado('No se pudo cargar: ${mensajeError(snapshot.error!)}');
            }
            final tareas = (snapshot.data ?? []).where((t) => !_ocultas.contains(t.id)).toList();
            if (tareas.isEmpty) {
              return _mensajeCentrado('No tienes tareas pendientes.');
            }
            return ListView.builder(
              padding: const EdgeInsets.only(top: 6, bottom: 80),
              itemCount: tareas.length,
              itemBuilder: (context, i) {
                final tarea = tareas[i];
                final vencida = tarea.diasRestantes < 0;
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: ListTile(
                    onTap: () => _abrirFormulario(tarea: tarea),
                    leading: IconButton(
                      icon: const Icon(Icons.check_circle_outline),
                      tooltip: 'Marcar como hecha',
                      onPressed: () => _marcarHecha(tarea),
                    ),
                    title: Text(tarea.nombre),
                    subtitle: Text(
                      'Vence ${tarea.fechaVencimiento}'
                      '${tarea.recurrencia != 'ninguna' ? ' · se repite' : ''}'
                      '${vencida ? ' · vencida' : ''}',
                      style: vencida ? const TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.w600) : null,
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline),
                      tooltip: 'Eliminar',
                      onPressed: () => _eliminar(tarea),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _abrirFormulario(),
        icon: const Icon(Icons.add),
        label: const Text('Nueva tarea'),
      ),
    );
  }

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
