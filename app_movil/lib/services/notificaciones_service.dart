import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_service.dart';

final FlutterLocalNotificationsPlugin _notificacionesLocales = FlutterLocalNotificationsPlugin();

const AndroidNotificationChannel _canal = AndroidNotificationChannel(
  'recordatorios_pagos',
  'Recordatorios de pagos',
  description: 'Avisos de pagos proximos a vencer o vencidos',
  importance: Importance.high,
);

/// Debe ser una funcion de nivel superior (top-level) para que Android pueda
/// invocarla cuando llega un mensaje con la app cerrada o en segundo plano.
@pragma('vm:entry-point')
Future<void> manejarMensajeSegundoPlano(RemoteMessage mensaje) async {
  // FCM ya muestra la notificacion del sistema automaticamente cuando el
  // mensaje trae un bloque "notification" y la app no esta en primer plano,
  // asi que aqui no hace falta hacer nada mas.
}

class NotificacionesService {
  static bool _inicializado = false;

  static Future<void> inicializar() async {
    if (_inicializado) return;
    _inicializado = true;

    await Firebase.initializeApp();

    FirebaseMessaging.onBackgroundMessage(manejarMensajeSegundoPlano);

    await _notificacionesLocales
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_canal);

    await _notificacionesLocales.initialize(
      const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    );

    final mensajeria = FirebaseMessaging.instance;
    await mensajeria.requestPermission(alert: true, badge: true, sound: true);

    // Mensajes recibidos con la app abierta: no se muestran solos, hay que
    // mostrarlos manualmente con una notificacion local.
    FirebaseMessaging.onMessage.listen((mensaje) {
      final notificacion = mensaje.notification;
      if (notificacion == null) return;
      _notificacionesLocales.show(
        mensaje.hashCode,
        notificacion.title,
        notificacion.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _canal.id,
            _canal.name,
            channelDescription: _canal.description,
            importance: Importance.high,
            priority: Priority.high,
            icon: '@mipmap/ic_launcher',
          ),
        ),
      );
    });

    await _registrarToken();
    mensajeria.onTokenRefresh.listen((_) => _registrarToken());
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
