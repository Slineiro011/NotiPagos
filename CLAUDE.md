# NotiPagos — contexto para Claude

Responder siempre en español.

## Estructura
- `server.js`, `src/`: backend Node + Express en Render (plan pago, el servidor no se duerme). Postgres en Neon. Push con firebase-admin (`src/push.js`).
- `app_movil/`: app Flutter para Android e iOS (mismo código Dart en `lib/`).
- `public/`: web.

## Alarma de recordatorios (lo más delicado)
- El servidor manda un push de "solo datos" con `titulo`, `cuerpo` y `pagoId`, más un bloque `apns` (alerta visible, sonido `alarma_pago.caf`, nivel time-sensitive) para iPhone.
- Android: `NotiPagosMessagingService` arranca `AlarmService` (sonido en bucle hasta "Apagar"). Tocar la notificación abre la app en ese pago (`pagoId` via `MainActivity`: `pagoInicial` / `onNewIntent` → canal `abrirPago`).
- iOS: con la app cerrada suena el aviso del sistema (~30 s máx.); con la app abierta suena en bucle desde `AppDelegate.swift`.
- En Dart, `NotificacionesService.pagoPorAbrir` centraliza "abrir este pago"; lo atiende `PagosScreen` con un diálogo para confirmarlo.
- Canal nativo: `com.smartlatam.notipagos_app/alarma` (`iniciar`, `detener`, `pagoInicial`, `abrirPago`).

## iOS
- Bundle ID `com.smartlatam.notipagosApp`. Usa ciclo de vida UIScene (obligatorio desde iOS 27); los plugins se registran en `didInitializeImplicitFlutterEngine`.
- `firebase_messaging` debe ser >= 16.7.0: versiones anteriores no se inicializan con UIScene y el iPhone nunca obtiene token de notificaciones.
- En Xcode 27 el simulador se abre con la app DeviceHub.
- Pendiente: cuenta Apple Developer, clave APNs en Firebase, TestFlight.

## Pendiente de probar en Android (no se pudo compilar en la Mac)
- Actualización a firebase_core 4 / firebase_messaging 16 y Firebase BoM 34.19.0.
- Tocar la notificación de la alarma abre el pago (cambios en `AlarmService.kt`, `MainActivity.kt`, `NotiPagosMessagingService.kt`).
- Deshacer, búsqueda, resumen, montos con formato colombiano: código Dart compartido, probado solo en iOS.

## Ideas siguientes
Fechas legibles y puntos de miles al escribir el monto; sesión en almacenamiento cifrado; ocultar el campo "servidor" a no-jefes; modo oscuro; filtros y totales en Historial; foto del comprobante y monto real pagado (requieren cambios en el servidor).
