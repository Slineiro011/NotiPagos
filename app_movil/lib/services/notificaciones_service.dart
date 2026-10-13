import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'api_service.dart';

const MethodChannel _canalAlarma = MethodChannel('com.smartlatam.notipagos_app/alarma');

/// Permite mostrar el dialogo de la alarma en iOS desde fuera de un widget.
final GlobalKey<NavigatorState> navegadorGlobal = GlobalKey<NavigatorState>();

Future<void> _iniciarAlarmaNativa({required String titulo, required String cuerpo, int? pagoId}) async {
  try {
    await _canalAlarma.invokeMethod('iniciar', {
      'titulo': titulo,
      'cuerpo': cuerpo,
      if (pagoId != null) 'pagoId': '$pagoId',
    });
  } catch (_) {
    // Si falla (ej. plataforma no soportada), no interrumpe el resto de la app.
    return;
  }
  if (pagoId != null) {
    // Con un pago real se abre su ficha (PagosScreen), que tambien apaga la alarma.
    NotificacionesService.pagoPorAbrir.value = pagoId;
  } else if (Platform.isIOS) {
    // Prueba de alarma: en Android el boton "Apagar" viene en la notificacion
    // del AlarmService; en iOS no hay notificacion persistente con la app
    // abierta, asi que se muestra un dialogo para apagarla.
    _mostrarDialogoAlarma(titulo: titulo, cuerpo: cuerpo);
  }
}

int? _pagoIdDe(Object? valor) => valor == null ? null : int.tryParse('$valor');

void _mostrarDialogoAlarma({required String titulo, required String cuerpo}) {
  final contexto = navegadorGlobal.currentContext;
  if (contexto == null) return;
  showDialog<void>(
    context: contexto,
    barrierDismissible: false,
    builder: (contextoDialogo) => AlertDialog(
      title: Text(titulo),
      content: Text(cuerpo),
      actions: [
        FilledButton(
          onPressed: () {
            _canalAlarma.invokeMethod('detener').catchError((_) {});
            Navigator.of(contextoDialogo).pop();
          },
          child: const Text('🔕 Apagar'),
        ),
      ],
    ),
  );
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

  /// Pago que hay que mostrarle al usuario porque toco su recordatorio (o
  /// llego con la app abierta). Lo atiende PagosScreen y lo vuelve a null.
  static final ValueNotifier<int?> pagoPorAbrir = ValueNotifier<int?>(null);

  static Future<void> detenerAlarma() async {
    try {
      await _canalAlarma.invokeMethod('detener');
    } catch (_) {}
  }

  static Future<void> inicializar() async {
    if (_inicializado) return;
    _inicializado = true;

    await Firebase.initializeApp();

    FirebaseMessaging.onBackgroundMessage(manejarMensajeSegundoPlano);

    final mensajeria = FirebaseMessaging.instance;
    await mensajeria.requestPermission(alert: true, badge: true, sound: true);

    // Con la app abierta en primer plano, el mensaje de "solo datos" no pasa
    // por NotiPagosMessagingService (ese solo actua en segundo plano), asi
    // que aqui se dispara la alarma nativa manualmente. En iOS tampoco se
    // muestra el aviso del sistema con la app abierta; suena el AppDelegate.
    FirebaseMessaging.onMessage.listen((mensaje) {
      final titulo = (mensaje.data['titulo'] as String?) ?? '🔔 Recordatorio de pago';
      final cuerpo = (mensaje.data['cuerpo'] as String?) ?? 'Tienes un pago pendiente.';
      _iniciarAlarmaNativa(titulo: titulo, cuerpo: cuerpo, pagoId: _pagoIdDe(mensaje.data['pagoId']));
    });

    // iOS: el usuario toco el aviso del sistema (con la app en segundo plano
    // o cerrada). En Android el aviso lo pinta el AlarmService nativo, que
    // avisa por el canal (abajo).
    FirebaseMessaging.onMessageOpenedApp.listen((mensaje) {
      pagoPorAbrir.value = _pagoIdDe(mensaje.data['pagoId']);
    });
    // Con limite: en algunos casos (ej. simulador) esta llamada nunca responde.
    final mensajeInicial = await mensajeria
        .getInitialMessage()
        .timeout(const Duration(seconds: 5), onTimeout: () => null);
    if (mensajeInicial != null) pagoPorAbrir.value = _pagoIdDe(mensajeInicial.data['pagoId']);

    if (Platform.isAndroid) {
      _canalAlarma.setMethodCallHandler((llamada) async {
        if (llamada.method == 'abrirPago') pagoPorAbrir.value = _pagoIdDe(llamada.arguments);
      });
      try {
        // La app se abrio tocando la notificacion de la alarma.
        pagoPorAbrir.value ??= _pagoIdDe(await _canalAlarma.invokeMethod<String>('pagoInicial'));
      } catch (_) {}
    }

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
      // En iOS, FCM no entrega token hasta que Apple asigna el token APNs,
      // que puede tardar unos segundos tras aceptar los permisos.
      if (Platform.isIOS) {
        for (var i = 0; i < 10 && await FirebaseMessaging.instance.getAPNSToken() == null; i++) {
          await Future.delayed(const Duration(seconds: 1));
        }
      }
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await ApiService.registrarDispositivo(token, plataforma: Platform.isIOS ? 'ios' : 'android');
      }
    } catch (_) {
      // Si falla el registro del token no se interrumpe el uso de la app;
      // simplemente no llegaran notificaciones push hasta que se reintente.
    }
  }
}
