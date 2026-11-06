import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../widgets/cargando.dart';

class RegistroScreen extends StatefulWidget {
  final VoidCallback onRegistroExitoso;
  final VoidCallback onVolverAlLogin;

  const RegistroScreen({super.key, required this.onRegistroExitoso, required this.onVolverAlLogin});

  @override
  State<RegistroScreen> createState() => _RegistroScreenState();
}

final RegExp _correoValido = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

class _RegistroScreenState extends State<RegistroScreen> {
  final _nombreCtrl = TextEditingController();
  final _usuarioCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _correoCtrl = TextEditingController();
  final _telefonoCtrl = TextEditingController();
  bool _cargando = false;
  String? _error;

  @override
  void dispose() {
    _nombreCtrl.dispose();
    _usuarioCtrl.dispose();
    _passwordCtrl.dispose();
    _correoCtrl.dispose();
    _telefonoCtrl.dispose();
    super.dispose();
  }

  Future<void> _registrar() async {
    if (_nombreCtrl.text.trim().isEmpty ||
        _usuarioCtrl.text.trim().isEmpty ||
        _passwordCtrl.text.isEmpty ||
        _correoCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Completa nombre, usuario, correo y contraseña.');
      return;
    }
    if (!_correoValido.hasMatch(_correoCtrl.text.trim())) {
      setState(() => _error = 'El correo no es válido.');
      return;
    }
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      await ApiService.registro(
        usuario: _usuarioCtrl.text.trim(),
        password: _passwordCtrl.text,
        nombre: _nombreCtrl.text.trim(),
        correo: _correoCtrl.text.trim(),
        telefono: _telefonoCtrl.text.trim().isEmpty ? null : _telefonoCtrl.text.trim(),
      );
      widget.onRegistroExitoso();
    } catch (e) {
      setState(() => _error = mensajeError(e));
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Crear cuenta')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Crea tu cuenta y usa la app gratis el primer mes.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 15, color: Colors.grey),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _nombreCtrl,
                  decoration: const InputDecoration(labelText: 'Tu nombre', border: OutlineInputBorder()),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _usuarioCtrl,
                  decoration: const InputDecoration(labelText: 'Usuario', border: OutlineInputBorder()),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _passwordCtrl,
                  decoration: const InputDecoration(labelText: 'Contraseña', border: OutlineInputBorder()),
                  obscureText: true,
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _correoCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Correo',
                    border: OutlineInputBorder(),
                    hintText: 'Para recuperar tu contraseña si la olvidas',
                  ),
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _telefonoCtrl,
                  decoration: const InputDecoration(
                    labelText: 'WhatsApp (opcional)',
                    border: OutlineInputBorder(),
                    hintText: 'Para recibir recordatorios por WhatsApp',
                  ),
                  keyboardType: TextInputType.phone,
                  onSubmitted: (_) => _registrar(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _cargando ? null : _registrar,
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                  child: _cargando
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Crear cuenta'),
                ),
                if (_cargando) ...[
                  const SizedBox(height: 16),
                  const AvisoServidorLento(),
                ],
                const SizedBox(height: 12),
                TextButton(
                  onPressed: _cargando ? null : widget.onVolverAlLogin,
                  child: const Text('Ya tengo cuenta, iniciar sesión'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
