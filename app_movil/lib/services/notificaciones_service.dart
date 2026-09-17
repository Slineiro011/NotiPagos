import 'dart:typed_data';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_service.dart';

final FlutterLocalNotificationsPlugin _notificacionesLocales = FlutterLocalNotificationsPlugin();

// Canal nuevo (no reutilizar el id "recordatorios_pagos" viejo): en Android, el
// sonido y la importancia de un canal quedan fijos desde el celular la primera
// vez que se crea, asi que cambiar estos valores en el codigo no afecta a
// quienes ya tenian la app instalada a menos que el id del canal sea distinto.
const AndroidNotificationChannel _canalAlarma = AndroidNotificationChannel(
  'alarma_pagos',
  'Alarma de recordatorios de pagos',
  description: 'Suena fuerte como una alarma y no para hasta que la apagues. Una por cada pago.',
  importance: Importance.max,
  playSound: true,
  sound: RawResourceAndroidNotificationSound('alarma_pago'),
  audioAttributesUsage: AudioAttributesUsage.alarm,
  enableVibration: true,
);

/// Notification.FLAG_INSISTENT: repite el sonido/vibracion hasta que la
/// notificacion se cancele o se abra (no existe como parametro dedicado en
/// flutter_local_notifications, se agrega como flag "crudo" de Android).
final Int32List _flagsAlarma = Int32List.fromList([4]);

NotificationDetails _detallesAlarma(int id) {
  return NotificationDetails(
    android: AndroidNotificationDetails(
      _canalAlarma.id,
      _canalAlarma.name,
      channelDescription: _canalAlarma.description,
      importance: Importance.max,
      priority: Priority.max,
      category: AndroidNotificationCategory.alarm,
      fullScreenIntent: true,
      ongoing: true,
      autoCancel: false,
      playSound: true,
      sound: const RawResourceAndroidNotificationSound('alarma_pago'),
      audioAttributesUsage: AudioAttributesUsage.alarm,
      enableVibration: true,
      vibrationPattern: Int64List.fromList([0, 1000, 500, 1000, 500, 1000]),
      additionalFlags: _flagsAlarma,
      icon: '@mipmap/ic_launcher',
      actions: const <AndroidNotificationAction>[
        AndroidNotificationAction('apagar_alarma', '🔕 Apagar', cancelNotification: true, showsUserInterface: false),
      ],
    ),
  );
}

Future<void> _crearCanalYPlugin() async {
  await _notificacionesLocales
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(_canalAlarma);

  await _notificacionesLocales.initialize(
    const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    onDidReceiveNotificationResponse: _alManejarRespuesta,
    onDidReceiveBackgroundNotificationResponse: _alManejarRespuesta,
  );
}

/// Debe ser una funcion de nivel superior (top-level) para que Android pueda
/// invocarla al tocar una accion de la notificacion con la app cerrada.
@pragma('vm:entry-point')
void _alManejarRespuesta(NotificationResponse respuesta) {
  // "cancelNotification: true" en la accion ya apaga el sonido/la notificacion
  // del lado de Android; aqui no hace falta hacer nada mas.
}

Future<void> _mostrarAlarma(Map<String, dynamic> datos, {int? idFijo}) async {
  final titulo = (datos['titulo'] as String?) ?? '🔔 Recordatorio de pago';
  final cuerpo = (datos['cuerpo'] as String?) ?? 'Tienes un pago pendiente.';
  // Usar el id del pago como id de notificacion evita duplicar la alarma si
  // el mismo pago se vuelve a avisar antes de apagar la anterior.
  final idPago = int.tryParse((datos['pagoId'] ?? '').toString());
  final id = idFijo ?? idPago ?? datos.hashCode;
  await _notificacionesLocales.show(id, titulo, cuerpo, _detallesAlarma(id));
}

/// Debe ser una funcion de nivel superior (top-level) para que Android pueda
/// invocarla cuando llega un mensaje con la app cerrada o en segundo plano.
@pragma('vm:entry-point')
Future<void> manejarMensajeSegundoPlano(RemoteMessage mensaje) async {
  // Aqui se ejecuta en un isolate nuevo (sin el main() normal), asi que hay
  // que volver a inicializar Firebase y el plugin de notificaciones locales
  // antes de poder mostrar la alarma.
  await Firebase.initializeApp();
  await _crearCanalYPlugin();
  await _mostrarAlarma(mensaje.data);
}

class NotificacionesService {
  static bool _inicializado = false;

  static Future<void> inicializar() async {
    if (_inicializado) return;
    _inicializado = true;

    await Firebase.initializeApp();

    FirebaseMessaging.onBackgroundMessage(manejarMensajeSegundoPlano);

    await _crearCanalYPlugin();

    final mensajeria = FirebaseMessaging.instance;
    await mensajeria.requestPermission(alert: true, badge: true, sound: true);

    // El servidor manda los recordatorios como mensaje de "solo datos" (sin
    // bloque "notification"), para que SIEMPRE pasen por aqui y no por el
    // aviso automatico del sistema, que no permite sonido en bucle ni
    // pantalla completa.
    FirebaseMessaging.onMessage.listen((mensaje) => _mostrarAlarma(mensaje.data));

    await _registrarToken();
    mensajeria.onTokenRefresh.listen((_) => _registrarToken());
  }

  static Future<void> registrarTokenActual() => _registrarToken();

  /// Dispara la misma alarma que sonaria con un recordatorio real, para que
  /// la persona sepa de antemano como se ve y se escucha.
  static Future<void> probarAlarma() async {
    await _mostrarAlarma(
      const {
        'titulo': '🔔 Recordatorio de pago (prueba)',
        'cuerpo': 'Asi suena y se ve una alarma real de pago. Toca "Apagar" para silenciarla.',
      },
      idFijo: 999999,
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
