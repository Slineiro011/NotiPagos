import 'package:flutter/material.dart';
import '../services/api_service.dart';

class ConfiguracionScreen extends StatefulWidget {
  final VoidCallback onSalir;

  const ConfiguracionScreen({super.key, required this.onSalir});

  @override
  State<ConfiguracionScreen> createState() => _ConfiguracionScreenState();
}

class _ConfiguracionScreenState extends State<ConfiguracionScreen> {
  final _numerosCtrl = TextEditingController();
  final _urlCtrl = TextEditingController();
  TimeOfDay _hora = const TimeOfDay(hour: 8, minute: 0);
  bool _cargando = true;
  bool _guardando = false;

  @override
  void initState() {
    super.initState();
    _cargarTodo();
  }

  @override
  void dispose() {
    _numerosCtrl.dispose();
    _urlCtrl.dispose();
    super.dispose();
  }

  Future<void> _cargarTodo() async {
    _urlCtrl.text = await ApiService.getBaseUrl();
    try {
      final config = await ApiService.getConfiguracion();
      _numerosCtrl.text = (config['numeros_whatsapp'] ?? '').toString().split(',').where((e) => e.isNotEmpty).join('\n');
      final horaTexto = (config['hora_recordatorio'] ?? '08:00').toString();
      final partes = horaTexto.split(':');
      if (partes.length == 2) {
        _hora = TimeOfDay(hour: int.tryParse(partes[0]) ?? 8, minute: int.tryParse(partes[1]) ?? 0);
      }
    } catch (_) {
      // si falla, se queda con los valores por defecto
    }
    if (mounted) setState(() => _cargando = false);
  }

  Future<void> _elegirHora() async {
    final seleccionada = await showTimePicker(context: context, initialTime: _hora);
    if (seleccionada != null) setState(() => _hora = seleccionada);
  }

  Future<void> _guardar() async {
    setState(() => _guardando = true);
    try {
      final numeros = _numerosCtrl.text
          .split(RegExp(r'[\n,]'))
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .join(',');
      final horaTexto = '${_hora.hour.toString().padLeft(2, '0')}:${_hora.minute.toString().padLeft(2, '0')}';
      await ApiService.guardarConfiguracion(numerosWhatsapp: numeros, horaRecordatorio: horaTexto);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Configuración guardada ✔')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error al guardar: $e')));
      }
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<void> _guardarUrl() async {
    await ApiService.setBaseUrl(_urlCtrl.text);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Servidor actualizado ✔')));
      setState(() => _cargando = true);
    }
    await _cargarTodo();
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _tarjeta(
            titulo: 'Números que reciben notificaciones',
            hijo: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Un número por línea. Incluye el código de país sin "+" (ej: 573001234567).',
                  style: TextStyle(color: Colors.grey, fontSize: 12.5),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _numerosCtrl,
                  maxLines: 4,
                  decoration: const InputDecoration(border: OutlineInputBorder(), hintText: '573001234567'),
                ),
                const SizedBox(height: 16),
                const Text('Hora del recordatorio diario', style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _elegirHora,
                  icon: const Icon(Icons.access_time),
                  label: Text(_hora.format(context)),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _guardando ? null : _guardar,
                  child: _guardando
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Guardar configuración'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _tarjeta(
            titulo: 'Servidor',
            hijo: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Dirección del backend al que se conecta la app. No la cambies a menos que sepas lo que haces.',
                  style: TextStyle(color: Colors.grey, fontSize: 12.5),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _urlCtrl,
                  decoration: const InputDecoration(border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                OutlinedButton(onPressed: _guardarUrl, child: const Text('Guardar servidor')),
              ],
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: widget.onSalir,
            icon: const Icon(Icons.logout, color: Colors.red),
            label: const Text('Cerrar sesión', style: TextStyle(color: Colors.red)),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(46),
              side: const BorderSide(color: Colors.red),
            ),
          ),
          const SizedBox(height: 24),
          Center(
            child: Text(
              'NotiPagos · Desarrollado por SlinMask Labs',
              style: TextStyle(color: Colors.grey.shade500, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tarjeta({required String titulo, required Widget hijo}) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(titulo, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 10),
            hijo,
          ],
        ),
      ),
    );
  }
}
