import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'api_service.dart';

const MethodChannel _canalAlarma = MethodChannel('com.smartlatam.notipagos_app/alarma');

Future<void> _iniciarAlarmaNativa({required String titulo, required String cuerpo}) async {
  try {
    await _canalAlarma.invokeMethod('iniciar', {'titulo': titulo, 'cuerpo': cuerpo});
  } catch (_) {
    // Si falla (ej. plataforma no soportada), no interrumpe el resto de la app.
  }
}

/// Debe ser una funcion de nivel superior (top-level) para que Android pueda
/// invocarla cuando llega un mensaje con la app cerrada o en segundo plano.
///
/// La alarma en si ya la dispara NotiPagosMessagingService (codigo nativo de
/// Android), directo al recibir el push, sin esperar a que este isolate de
/// Dart arranque - eso es lo que la hace confiable con la app cerrada. Aqui
/// no hace falta hacer nada mas.
@pragma('vm:entry-point')
Future<void> manejarMensajeSegundoPlano(RemoteMessage mensaje) async {}

class NotificacionesService {
  static bool _inicializado = false;

  static Future<void> inicializar() async {
    if (_inicializado) return;
    _inicializado = true;

    await Firebase.initializeApp();

    FirebaseMessaging.onBackgroundMessage(manejarMensajeSegundoPlano);

    final mensajeria = FirebaseMessaging.instance;
    await mensajeria.requestPermission(alert: true, badge: true, sound: true);

    // Con la app abierta en primer plano, el mensaje de "solo datos" no pasa
    // por NotiPagosMessagingService (ese solo actua en segundo plano), asi
    // que aqui se dispara la alarma nativa manualmente.
    FirebaseMessaging.onMessage.listen((mensaje) {
      final titulo = (mensaje.data['titulo'] as String?) ?? '🔔 Recordatorio de pago';
      final cuerpo = (mensaje.data['cuerpo'] as String?) ?? 'Tienes un pago pendiente.';
      _iniciarAlarmaNativa(titulo: titulo, cuerpo: cuerpo);
    });

    await _registrarToken();
    mensajeria.onTokenRefresh.listen((_) => _registrarToken());
  }

  static Future<void> registrarTokenActual() => _registrarToken();

  /// Dispara la misma alarma nativa que sonaria con un recordatorio real,
  /// para que la persona sepa de antemano como se ve y se escucha.
  static Future<void> probarAlarma() async {
    await _iniciarAlarmaNativa(
      titulo: '🔔 Recordatorio de pago (prueba)',
      cuerpo: 'Asi suena y se ve una alarma real de pago. Toca "Apagar" para silenciarla.',
    );
  }

  static Future<void> _registrarToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await ApiService.registrarDispositivo(token, plataforma: 'android');
      }
    } catch (_) {
      // Si falla el registro del token no se interrumpe el uso de la app;
      // simplemente no llegaran notificaciones push hasta que se reintente.
    }
  }
}
