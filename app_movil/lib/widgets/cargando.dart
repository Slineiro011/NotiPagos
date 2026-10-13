import 'dart:async';
import 'package:flutter/material.dart';

/// Indicador de carga que, si la espera pasa de unos segundos, avisa que la
/// conexion esta lenta para que no parezca que la app se congelo.
class Cargando extends StatelessWidget {
  const Cargando({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            AvisoServidorLento(),
          ],
        ),
      ),
    );
  }
}

/// No muestra nada los primeros segundos; despues, el aviso de conexion lenta.
class AvisoServidorLento extends StatefulWidget {
  const AvisoServidorLento({super.key});

  @override
  State<AvisoServidorLento> createState() => _AvisoServidorLentoState();
}

class _AvisoServidorLentoState extends State<AvisoServidorLento> {
  bool _visible = false;
  Timer? _temporizador;

  @override
  void initState() {
    super.initState();
    _temporizador = Timer(const Duration(seconds: 5), () {
      if (mounted) setState(() => _visible = true);
    });
  }

  @override
  void dispose() {
    _temporizador?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible) return const SizedBox.shrink();
    return Text(
      'Conectando con el servidor…\nLa conexión está lenta, espera un momento.',
      textAlign: TextAlign.center,
      style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
    );
  }
}
