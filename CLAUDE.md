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

## Toolchain Android
- Requiere Flutter 3.38+ (el código usa `persist` de `SnackBar`, que no existe antes). Eso arrastra Gradle 8.14+, AGP 8.12.3+ y Kotlin 2.2.20+ — si una PC tiene un Flutter más viejo, `flutter upgrade` primero y luego subir esas tres versiones en `android/` (settings.gradle.kts y gradle-wrapper.properties) o la build falla pidiéndolas una por una.
- Ya probado end-to-end en Android (emulador): firebase_core 4 / firebase_messaging 16 / BoM 34.19.0 compilan bien; tocar la notificación de la alarma abre el pago correcto; deshacer, búsqueda, resumen y formato colombiano de montos funcionan.

## Ideas siguientes
Fechas legibles y puntos de miles al escribir el monto; sesión en almacenamiento cifrado; ocultar el campo "servidor" a no-jefes; modo oscuro; filtros y totales en Historial; foto del comprobante y monto real pagado (requieren cambios en el servidor).
