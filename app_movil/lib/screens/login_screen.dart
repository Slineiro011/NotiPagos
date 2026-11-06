import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';
import '../widgets/cargando.dart';
import 'registro_screen.dart';

const String _urlTerminos = 'https://notipagos.onrender.com/terminos.html';
const String _urlPrivacidad = 'https://notipagos.onrender.com/privacidad.html';

class LoginScreen extends StatefulWidget {
  final VoidCallback onLoginExitoso;

  const LoginScreen({super.key, required this.onLoginExitoso});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usuarioCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _cargando = false;
  bool _verPassword = false;
  String? _error;

  @override
  void dispose() {
    _usuarioCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _entrar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      await ApiService.login(_usuarioCtrl.text.trim(), _passwordCtrl.text);
      widget.onLoginExitoso();
    } catch (e) {
      setState(() => _error = mensajeError(e));
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  void _irARegistro() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => RegistroScreen(
          onRegistroExitoso: () {
            Navigator.of(context).pop();
            widget.onLoginExitoso();
          },
          onVolverAlLogin: () => Navigator.of(context).pop(),
        ),
      ),
    );
  }

  Future<void> _abrirEnlace(String url) async {
    final mensajero = ScaffoldMessenger.of(context);
    final abierto = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!abierto) {
      mensajero.showSnackBar(const SnackBar(content: Text('No se pudo abrir el enlace')));
    }
  }

  Future<void> _olvidePassword() async {
    final correoCtrl = TextEditingController();
    final mensajero = ScaffoldMessenger.of(context);
    final enviar = await showDialog<bool>(
      context: context,
      builder: (contexto) => AlertDialog(
        title: const Text('¿Olvidaste tu contraseña?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Escribe el correo con el que creaste tu cuenta. Te mandamos un enlace para poner una nueva contraseña.'),
            const SizedBox(height: 14),
            TextField(
              controller: correoCtrl,
              autofocus: true,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Correo', border: OutlineInputBorder()),
              onSubmitted: (_) => Navigator.pop(contexto, true),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(contexto, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(contexto, true), child: const Text('Enviar')),
        ],
      ),
    );
    final correo = correoCtrl.text.trim();
    correoCtrl.dispose();
    if (enviar != true || correo.isEmpty) return;

    try {
      await ApiService.olvidePassword(correo);
      mensajero.showSnackBar(const SnackBar(
        content: Text('Si el correo está registrado, te llegará un enlace para restablecer tu contraseña.'),
        duration: Duration(seconds: 6),
      ));
    } catch (e) {
      mensajero.showSnackBar(SnackBar(content: Text(mensajeError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    const estiloEnlace = TextStyle(color: Colors.white70, fontSize: 12.5);

    // El fondo azul es igual en tema claro y oscuro, asi que los iconos de la
    // barra de estado siempre van en blanco.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF0A1B4F), Color(0xFF1D4ED8)],
            ),
          ),
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 360),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // El logo trae fondo blanco: va en un recuadro redondeado.
                      ClipRRect(
                        borderRadius: BorderRadius.circular(28),
                        child: Image.asset(
                          'assets/icon/icon.png',
                          width: 130,
                          height: 130,
                          cacheWidth: 390,
                          semanticLabel: 'ActivoX',
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Tus pagos y tareas, siempre a tiempo',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(height: 20),
                      Card(
                        elevation: 4,
                        margin: EdgeInsets.zero,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              TextField(
                                controller: _usuarioCtrl,
                                decoration: const InputDecoration(
                                  labelText: 'Usuario',
                                  prefixIcon: Icon(Icons.person_outline),
                                  border: OutlineInputBorder(),
                                ),
                                textInputAction: TextInputAction.next,
                              ),
                              const SizedBox(height: 14),
                              TextField(
                                controller: _passwordCtrl,
                                decoration: InputDecoration(
                                  labelText: 'Contraseña',
                                  prefixIcon: const Icon(Icons.lock_outline),
                                  border: const OutlineInputBorder(),
                                  suffixIcon: IconButton(
                                    icon: Icon(_verPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                                    tooltip: _verPassword ? 'Ocultar contraseña' : 'Ver contraseña',
                                    onPressed: () => setState(() => _verPassword = !_verPassword),
                                  ),
                                ),
                                obscureText: !_verPassword,
                                onSubmitted: (_) => _entrar(),
                              ),
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton(
                                  onPressed: _cargando ? null : _olvidePassword,
                                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 36)),
                                  child: const Text('¿Olvidaste tu contraseña?', style: TextStyle(fontSize: 12.5)),
                                ),
                              ),
                              if (_error != null) ...[
                                const SizedBox(height: 10),
                                Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                              ],
                              const SizedBox(height: 20),
                              FilledButton(
                                onPressed: _cargando ? null : _entrar,
                                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                                child: _cargando
                                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                                    : const Text('Entrar'),
                              ),
                              if (_cargando) ...[
                                const SizedBox(height: 16),
                                const AvisoServidorLento(),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      OutlinedButton(
                        onPressed: _cargando ? null : _irARegistro,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white70),
                          minimumSize: const Size.fromHeight(46),
                        ),
                        child: const Text('Crear cuenta · 1 mes gratis'),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          TextButton(
                            onPressed: () => _abrirEnlace(_urlTerminos),
                            child: const Text('Términos', style: estiloEnlace),
                          ),
                          const Text('·', style: estiloEnlace),
                          TextButton(
                            onPressed: () => _abrirEnlace(_urlPrivacidad),
                            child: const Text('Privacidad', style: estiloEnlace),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
