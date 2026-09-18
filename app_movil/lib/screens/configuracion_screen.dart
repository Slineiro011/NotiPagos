import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/notificaciones_service.dart';

class ConfiguracionScreen extends StatefulWidget {
  final VoidCallback onSalir;

  const ConfiguracionScreen({super.key, required this.onSalir});

  @override
  State<ConfiguracionScreen> createState() => _ConfiguracionScreenState();
}

class _ConfiguracionScreenState extends State<ConfiguracionScreen> {
  final _numerosCtrl = TextEditingController();
  final _urlCtrl = TextEditingController();
  final _nombreCtrl = TextEditingController();
  final _usuarioCtrl = TextEditingController();
  final _telefonoCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  TimeOfDay _hora = const TimeOfDay(hour: 8, minute: 0);
  bool _cargando = true;
  bool _guardando = false;
  bool _guardandoNombre = false;
  bool _guardandoUsuario = false;
  bool _guardandoTelefono = false;
  bool _guardandoPassword = false;
  bool _esJefe = false;
  String _nombre = '';

  @override
  void initState() {
    super.initState();
    _cargarTodo();
  }

  @override
  void dispose() {
    _numerosCtrl.dispose();
    _urlCtrl.dispose();
    _nombreCtrl.dispose();
    _usuarioCtrl.dispose();
    _telefonoCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _cargarTodo() async {
    _urlCtrl.text = await ApiService.getBaseUrl();
    _nombre = await ApiService.getNombre();
    _esJefe = await ApiService.esJefe();

    try {
      final perfil = await ApiService.getPerfil();
      _nombreCtrl.text = (perfil['nombre'] as String?) ?? '';
      _usuarioCtrl.text = (perfil['usuario'] as String?) ?? '';
      _telefonoCtrl.text = (perfil['telefono'] as String?) ?? '';
    } catch (_) {
      // si falla, el campo queda vacio y se puede reintentar guardando
    }

    if (_esJefe) {
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
    }
    if (mounted) setState(() => _cargando = false);
  }

  Future<void> _guardarNombre() async {
    final nombre = _nombreCtrl.text.trim();
    if (nombre.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('El nombre no puede quedar vacío')));
      return;
    }
    setState(() => _guardandoNombre = true);
    try {
      await ApiService.actualizarPerfil(nombre: nombre);
      _nombre = nombre;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nombre guardado ✔')));
        setState(() {});
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error al guardar: $e')));
      }
    } finally {
      if (mounted) setState(() => _guardandoNombre = false);
    }
  }

  Future<void> _guardarUsuario() async {
    final usuario = _usuarioCtrl.text.trim();
    if (usuario.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('El usuario no puede quedar vacío')));
      return;
    }
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cambiar usuario'),
        content: Text('¿Cambiar tu usuario de inicio de sesión a "$usuario"? La próxima vez que entres deberás usar este nuevo nombre de usuario.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirmar')),
        ],
      ),
    );
    if (confirmar != true) return;

    setState(() => _guardandoUsuario = true);
    try {
      await ApiService.actualizarPerfil(usuario: usuario);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Usuario actualizado ✔')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error al guardar: $e')));
      }
    } finally {
      if (mounted) setState(() => _guardandoUsuario = false);
    }
  }

  Future<void> _guardarTelefono() async {
    setState(() => _guardandoTelefono = true);
    try {
      await ApiService.actualizarPerfil(telefono: _telefonoCtrl.text.trim());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Número guardado ✔')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error al guardar: $e')));
      }
    } finally {
      if (mounted) setState(() => _guardandoTelefono = false);
    }
  }

  Future<void> _guardarPassword() async {
    if (_passwordCtrl.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Escribe la nueva contraseña primero')));
      return;
    }
    setState(() => _guardandoPassword = true);
    try {
      await ApiService.actualizarPerfil(password: _passwordCtrl.text);
      _passwordCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Contraseña actualizada ✔')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error al cambiar la contraseña: $e')));
      }
    } finally {
      if (mounted) setState(() => _guardandoPassword = false);
    }
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
          if (_nombre.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Sesión: $_nombre${_esJefe ? " (jefe)" : ""}',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
              ),
            ),
          _tarjeta(
            titulo: 'Mi cuenta',
            hijo: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Nombre', style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 10),
                TextField(
                  controller: _nombreCtrl,
                  decoration: const InputDecoration(border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: _guardandoNombre ? null : _guardarNombre,
                  child: _guardandoNombre
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Guardar nombre'),
                ),
                const SizedBox(height: 20),
                const Text('Usuario (para iniciar sesión)', style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 10),
                TextField(
                  controller: _usuarioCtrl,
                  decoration: const InputDecoration(border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: _guardandoUsuario ? null : _guardarUsuario,
                  child: _guardandoUsuario
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Guardar usuario'),
                ),
                const SizedBox(height: 20),
                const Text('Tu número de WhatsApp', style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                const Text(
                  'Para recibir tus recordatorios y usar el bot. Incluye el código de país sin "+" (ej: 573001234567).',
                  style: TextStyle(color: Colors.grey, fontSize: 12.5),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _telefonoCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(border: OutlineInputBorder(), hintText: '573001234567'),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: _guardandoTelefono ? null : _guardarTelefono,
                  child: _guardandoTelefono
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Guardar número'),
                ),
                const SizedBox(height: 20),
                const Text('Cambiar contraseña', style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 10),
                TextField(
                  controller: _passwordCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'Nueva contraseña'),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: _guardandoPassword ? null : _guardarPassword,
                  child: _guardandoPassword
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Cambiar contraseña'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _tarjeta(
            titulo: 'Alarma de recordatorios',
            hijo: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Los recordatorios de pago suenan fuerte, como una alarma, y no paran hasta que los apagues (aunque el celular este en silencio). Pruébala para saber cómo se ve y se escucha cuando suene de verdad.',
                  style: TextStyle(color: Colors.grey, fontSize: 12.5),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () => NotificacionesService.probarAlarma(),
                  icon: const Icon(Icons.notifications_active),
                  label: const Text('Probar alarma'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (!_esJefe)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Los números globales y la hora de los recordatorios los administra el jefe.',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 12.5),
              ),
            ),
          if (_esJefe)
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
          if (_esJefe) ...[
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
          ],
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
              'NotiPagos v1.7.0+13 · Desarrollado por SlinMask Labs',
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
