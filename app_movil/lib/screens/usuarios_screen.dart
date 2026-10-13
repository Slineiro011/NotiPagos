import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../widgets/cargando.dart';

class UsuariosScreen extends StatefulWidget {
  const UsuariosScreen({super.key});

  @override
  State<UsuariosScreen> createState() => _UsuariosScreenState();
}

class _UsuariosScreenState extends State<UsuariosScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  String _usuarioActual = '';

  @override
  void initState() {
    super.initState();
    _future = ApiService.getUsuarios();
    ApiService.getUsuarioActual().then((u) {
      if (mounted) setState(() => _usuarioActual = u);
    });
  }

  void _recargar() {
    setState(() => _future = ApiService.getUsuarios());
  }

  Future<void> _abrirFormulario({Map<String, dynamic>? usuario}) async {
    final guardado = await showDialog<bool>(
      context: context,
      builder: (_) => _UsuarioFormDialog(usuario: usuario),
    );
    if (guardado == true) _recargar();
  }

  Future<void> _eliminar(Map<String, dynamic> usuario) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Eliminar usuario'),
        content: Text('¿Eliminar el acceso de "${usuario['nombre'] ?? usuario['usuario']}"? Sus pagos ya creados no se borran.'),
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
    try {
      await ApiService.eliminarUsuario(usuario['usuario'] as String);
      _recargar();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: ${mensajeError(e)}')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Cargando();
          }
          if (snapshot.hasError) {
            return Center(child: Text('No se pudo cargar: ${mensajeError(snapshot.error!)}', textAlign: TextAlign.center));
          }
          final usuarios = snapshot.data ?? [];
          if (usuarios.isEmpty) {
            return const Center(child: Text('No hay usuarios registrados.'));
          }
          return ListView.builder(
            padding: const EdgeInsets.only(top: 8, bottom: 80),
            itemCount: usuarios.length,
            itemBuilder: (context, i) {
              final u = usuarios[i];
              final esJefe = u['rol'] == 'jefe';
              final esYo = u['usuario'] == _usuarioActual;
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              (u['nombre'] as String?)?.isNotEmpty == true ? u['nombre'] as String : u['usuario'] as String,
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15.5),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: esJefe ? const Color(0xFFFEF3C7) : const Color(0xFFE0E7FF),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              esJefe ? 'Jefe' : 'Usuario',
                              style: TextStyle(
                                color: esJefe ? const Color(0xFFD97706) : const Color(0xFF2563EB),
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Usuario: ${u['usuario']}${(u['telefono'] as String?)?.isNotEmpty == true ? ' · WhatsApp: ${u['telefono']}' : ' · sin WhatsApp vinculado'}',
                        style: TextStyle(color: Colors.grey.shade600, fontSize: 12.5),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton.icon(
                            onPressed: () => _abrirFormulario(usuario: u),
                            icon: const Icon(Icons.edit_outlined, size: 18),
                            label: const Text('Editar'),
                          ),
                          if (!esYo)
                            TextButton.icon(
                              onPressed: () => _eliminar(u),
                              icon: const Icon(Icons.delete_outline, size: 18, color: Color(0xFFDC2626)),
                              label: const Text('Eliminar', style: TextStyle(color: Color(0xFFDC2626))),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _abrirFormulario(),
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('Nuevo usuario'),
      ),
    );
  }
}

class _UsuarioFormDialog extends StatefulWidget {
  final Map<String, dynamic>? usuario;

  const _UsuarioFormDialog({this.usuario});

  @override
  State<_UsuarioFormDialog> createState() => _UsuarioFormDialogState();
}

class _UsuarioFormDialogState extends State<_UsuarioFormDialog> {
  final _usuarioCtrl = TextEditingController();
  final _nombreCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _telefonoCtrl = TextEditingController();
  String _rol = 'usuario';
  bool _guardando = false;
  String? _error;

  bool get _esEdicion => widget.usuario != null;

  @override
  void initState() {
    super.initState();
    final u = widget.usuario;
    if (u != null) {
      _usuarioCtrl.text = u['usuario'] as String? ?? '';
      _nombreCtrl.text = u['nombre'] as String? ?? '';
      _telefonoCtrl.text = u['telefono'] as String? ?? '';
      _rol = u['rol'] as String? ?? 'usuario';
    }
  }

  @override
  void dispose() {
    _usuarioCtrl.dispose();
    _nombreCtrl.dispose();
    _passwordCtrl.dispose();
    _telefonoCtrl.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    final usuario = _usuarioCtrl.text.trim();
    final nombre = _nombreCtrl.text.trim();
    final telefono = _telefonoCtrl.text.trim();
    final password = _passwordCtrl.text;

    if (usuario.isEmpty || nombre.isEmpty) {
      setState(() => _error = 'Usuario y nombre son obligatorios');
      return;
    }
    if (!_esEdicion && password.isEmpty) {
      setState(() => _error = 'La contraseña es obligatoria para un usuario nuevo');
      return;
    }

    setState(() {
      _guardando = true;
      _error = null;
    });
    try {
      if (_esEdicion) {
        await ApiService.actualizarUsuario(
          widget.usuario!['usuario'] as String,
          nombre: nombre,
          rol: _rol,
          telefono: telefono.isEmpty ? null : telefono,
          password: password.isEmpty ? null : password,
        );
      } else {
        await ApiService.crearUsuario(
          usuario: usuario,
          password: password,
          nombre: nombre,
          rol: _rol,
          telefono: telefono.isEmpty ? null : telefono,
        );
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() => _error = mensajeError(e));
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(_esEdicion ? 'Editar usuario' : 'Nuevo usuario'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _usuarioCtrl,
              enabled: !_esEdicion,
              decoration: const InputDecoration(labelText: 'Usuario (para iniciar sesión)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _nombreCtrl,
              decoration: const InputDecoration(labelText: 'Nombre completo', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _passwordCtrl,
              obscureText: true,
              decoration: InputDecoration(
                labelText: _esEdicion ? 'Nueva contraseña' : 'Contraseña',
                helperText: _esEdicion ? 'Déjala vacía para no cambiarla' : null,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _telefonoCtrl,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Teléfono de WhatsApp (opcional)',
                hintText: '573001234567',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _rol,
              decoration: const InputDecoration(labelText: 'Rol', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'usuario', child: Text('Usuario')),
                DropdownMenuItem(value: 'jefe', child: Text('Jefe')),
              ],
              onChanged: (v) => setState(() => _rol = v ?? 'usuario'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _guardando ? null : () => Navigator.pop(context, false), child: const Text('Cancelar')),
        FilledButton(
          onPressed: _guardando ? null : _guardar,
          child: _guardando
              ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Guardar'),
        ),
      ],
    );
  }
}
