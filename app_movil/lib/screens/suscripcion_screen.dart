import 'package:flutter/material.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../services/api_service.dart';
import '../services/suscripcion_service.dart';

/// Pantalla de bloqueo: se muestra cuando termino el mes de prueba y la
/// cuenta no tiene una suscripcion activa. No se puede cerrar sin suscribirse
/// o cerrar sesion (vuelve al login, no deja pasar a ver pagos).
class SuscripcionScreen extends StatefulWidget {
  final VoidCallback onSuscripcionActivada;
  final VoidCallback onCerrarSesion;

  const SuscripcionScreen({super.key, required this.onSuscripcionActivada, required this.onCerrarSesion});

  @override
  State<SuscripcionScreen> createState() => _SuscripcionScreenState();
}

class _SuscripcionScreenState extends State<SuscripcionScreen> {
  ProductDetails? _producto;
  bool _cargando = true;
  bool _comprando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    SuscripcionService.escuchar(
      onVerificada: () {
        if (!mounted) return;
        setState(() => _comprando = false);
        widget.onSuscripcionActivada();
      },
      onError: (mensaje) {
        if (!mounted) return;
        setState(() {
          _comprando = false;
          _error = mensaje;
        });
      },
    );
    _cargarProducto();
  }

  @override
  void dispose() {
    SuscripcionService.detener();
    super.dispose();
  }

  Future<void> _cargarProducto() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      if (!SuscripcionService.compraDisponibleEnEstaPlataforma) {
        setState(() => _error = 'La suscripción desde iPhone estará disponible muy pronto. '
            'Mientras tanto puedes suscribirte desde un celular Android con la misma cuenta.');
        return;
      }
      if (!await SuscripcionService.disponible()) {
        setState(() => _error = 'La tienda no está disponible en este dispositivo.');
        return;
      }
      final producto = await SuscripcionService.obtenerProducto();
      if (producto == null) {
        setState(() => _error = 'No se pudo cargar el precio de la suscripción. Intenta de nuevo más tarde.');
        return;
      }
      setState(() => _producto = producto);
    } catch (e) {
      setState(() => _error = mensajeError(e));
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _suscribirse() async {
    if (_producto == null) return;
    setState(() {
      _comprando = true;
      _error = null;
    });
    try {
      await SuscripcionService.comprar(_producto!);
    } catch (e) {
      setState(() {
        _comprando = false;
        _error = mensajeError(e);
      });
    }
  }

  Future<void> _restaurar() async {
    setState(() {
      _comprando = true;
      _error = null;
    });
    try {
      await SuscripcionService.restaurar();
      // Si no habia nada que restaurar la tienda no avisa: se suelta el boton
      // despues de un momento con un mensaje.
      await Future.delayed(const Duration(seconds: 8));
      if (mounted && _comprando) {
        setState(() {
          _comprando = false;
          _error = 'No se encontró ninguna suscripción activa en esta cuenta de la tienda.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _comprando = false;
          _error = mensajeError(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 380),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('🔒', style: TextStyle(fontSize: 48)),
                    const SizedBox(height: 16),
                    const Text(
                      'Tu mes de prueba gratis terminó',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Suscríbete para seguir viendo tus pagos, el historial y recibir los recordatorios.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 14, color: Colors.grey),
                    ),
                    const SizedBox(height: 28),
                    if (_cargando)
                      const CircularProgressIndicator()
                    else if (_producto != null)
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            children: [
                              Text(
                                _producto!.price,
                                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                              ),
                              const Text('por mes', style: TextStyle(color: Colors.grey)),
                            ],
                          ),
                        ),
                      ),
                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red, fontSize: 13)),
                    ],
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: (_cargando || _comprando || _producto == null) ? null : _suscribirse,
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                      child: _comprando
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Suscribirme'),
                    ),
                    const SizedBox(height: 10),
                    if (SuscripcionService.compraDisponibleEnEstaPlataforma)
                      TextButton(
                        onPressed: (_cargando || _comprando) ? null : _restaurar,
                        child: const Text('Restaurar compra'),
                      ),
                    TextButton(
                      onPressed: (_cargando || _comprando) ? null : _cargarProducto,
                      child: const Text('Reintentar'),
                    ),
                    TextButton(
                      onPressed: _comprando ? null : widget.onCerrarSesion,
                      child: const Text('Cerrar sesión'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
