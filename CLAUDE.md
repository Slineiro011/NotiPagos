# ActivoX — contexto para Claude

Responder siempre en español.

## Estructura
- `server.js`, `src/`: backend Node + Express en Render (plan pago, el servidor no se duerme). Postgres en Neon. Push con firebase-admin (`src/push.js`).
- `app_movil/`: app Flutter para Android e iOS (mismo código Dart en `lib/`).
- `public/`: web.

## Alarma de recordatorios (lo más delicado)
- El servidor manda un push de "solo datos" con `titulo`, `cuerpo` y `pagoId`, más un bloque `apns` (alerta visible, sonido `alarma_pago.caf`, nivel time-sensitive) para iPhone.
- Android: `NotiPagosMessagingService` arranca `AlarmService` (sonido en bucle hasta "Apagar"). `AlarmService` guarda en SharedPreferences qué `pagoId` está sonando (`pagoIdActivo`), para que `MainActivity` lo detecte sin importar cómo se abrió la app: `pagoInicial`/`onNewIntent` (se abrió tocando la notificación) o `alarmaActivaPagoId` + `onResume` (se abrió por el ícono, recientes, etc., con la alarma ya sonando en segundo plano).
- iOS: con la app cerrada suena el aviso del sistema (~30 s máx.); con la app abierta suena en bucle desde `AppDelegate.swift`.
- En Dart, `NotificacionesService.pagoPorAbrir` centraliza "abrir este pago"; lo atiende `PagosScreen` con un diálogo ("🔔 Recordatorio de pago") que no se puede cerrar sin apagar la alarma — cualquiera de sus botones (incluido "🔕 Apagar alarma") la apaga.
- Canal nativo: `com.smartlatam.notipagos_app/alarma` (`iniciar`, `detener`, `pagoInicial`, `abrirPago`, `alarmaActivaPagoId`).

## iOS
- Bundle ID `com.smartlatam.notipagosApp`. Usa ciclo de vida UIScene (obligatorio desde iOS 27); los plugins se registran en `didInitializeImplicitFlutterEngine`.
- `firebase_messaging` debe ser >= 16.7.0: versiones anteriores no se inicializan con UIScene y el iPhone nunca obtiene token de notificaciones.
- En Xcode 27 el simulador se abre con la app DeviceHub (`/Applications/Xcode.app/Contents/Applications/DeviceHub.app`); ya no existe "Simulator.app".
- Usa CocoaPods además de Swift Package Manager: `flutter_secure_storage` lo necesita (por eso existen `ios/Podfile` y `Podfile.lock`). Abrir siempre `ios/Runner.xcworkspace`, no el `.xcodeproj`.
- Compila en release sin firmar (`flutter build ios --no-codesign --release`) con la versión 1.9.0+20 (probado en la Mac, 2026-10-28).
- Cuenta Apple Developer: pagada el 2026-10-28 (factura #MD25190374), **esperando aprobación de Apple**. Al aprobarse: iniciar sesión en Xcode → poner el Team ID (DEVELOPMENT_TEAM) en el proyecto → crear clave APNs (.p8) y subirla a Firebase → Cloud Messaging → app iOS → crear la app en App Store Connect → TestFlight.
- Para la revisión de Apple hará falta un usuario de demostración con pagos de ejemplo (la app exige login) y la URL de privacidad (`public/privacidad.html`).

## Toolchain Android
- Requiere Flutter 3.38+ (el código usa `persist` de `SnackBar`, que no existe antes). Eso arrastra Gradle 9.8.1+, AGP 9.4.1+ y Kotlin 2.4.21+ — si una PC tiene un Flutter más viejo, `flutter upgrade` primero y luego subir esas tres versiones en `android/` (settings.gradle.kts y gradle-wrapper.properties) o la build falla pidiéndolas una por una. Con AGP 9+ el `kotlinOptions { jvmTarget = ... }` dentro de `android {}` ya no compila; va como `kotlin { compilerOptions { jvmTarget.set(...) } }` al final de `app/build.gradle.kts`.
- Si el SDK de Flutter vive en una ruta con espacios (ej. `C:\Development flutter\flutter`), el build falla con `Building native assets failed` / `"C:\Development" no se reconoce como un comando` (algunos paquetes, ej. `flutter_secure_storage`, arrastran `objective_c`/`jni`/hooks que invocan `flutter.bat` recursivamente y no escapan la ruta). Workaround: crear un junction sin espacios y compilar a través de él — `cmd /c mklink /J C:\flutter-sdk "C:\Development flutter\flutter"`, luego anteponer `C:\flutter-sdk\bin` al PATH antes de `flutter build`.
- Ya probado end-to-end en Android (emulador): firebase_core 4 / firebase_messaging 16 / BoM 34.19.0 compilan bien; tocar la notificación de la alarma abre el pago correcto; deshacer, búsqueda, resumen y formato colombiano de montos funcionan.

## Otras notas
- Sesión: el token va cifrado en `flutter_secure_storage` (Keystore/Keychain), no en SharedPreferences; hay migración automática para sesiones viejas. Nombre/rol/usuario (no sensibles) siguen en SharedPreferences.
- Tema: `TemaService` (claro/oscuro/sistema), selector en Configuración → "Apariencia", persistido en SharedPreferences.
- El campo "Servidor" en Configuración ya está oculto a quien no es jefe.
- `npm audit`: quedan 12 moderadas sin arreglo (antes 2): la cadena `archiver`/`glob`/`minimatch`/`uuid` de `exceljs` (bajarlo rompería el export a Excel) y, desde que se agregó `googleapis`, la misma familia de paquetes (`gaxios`/`gcp-metadata`/`google-gax`/`rimraf`) vía `@google-cloud/firestore-api`, una dependencia transitiva que ni se usa (solo se usa `androidpublisher` del paquete). Se intentó acotar con `overrides` en `package.json` sin éxito (npm sigue resolviendo la version vieja); no son explotables desde esta app (nada recibe rutas de archivo controladas por el usuario), así que se dejan igual que las de exceljs.

## Marca: ActivoX (antes Notix, antes NotiPagos)
- Nombre visible en la app: "ActivoX" (Android `android:label`, iOS `CFBundleDisplayName`, `MaterialApp.title`, texto de versión en Configuración, `public/eliminar-cuenta.html`).
- Los identificadores internos NO cambiaron a propósito: `com.smartlatam.notipagos_app` (Android), `com.smartlatam.notipagosApp` (iOS), nombres de clases y del canal nativo. Cambiarlos rompería las actualizaciones en las tiendas y la configuración de Firebase.
- Íconos: `assets/icon/icon.png` es el logo completo (iOS e ícono clásico de Android). `assets/icon/icon_foreground.png` es el mismo logo sin el texto "ACTIVOX", al 87% centrado, para el ícono adaptable de Android (el plugin ya aplica un inset de 16%; así nada queda recortado por la máscara circular). Regenerar con `dart run flutter_launcher_icons`.
- Falta: cambiar el nombre/ícono en Play Console (ficha de la tienda) y App Store Connect cuando se cree la app ahí; `public/index.html` sigue diciendo "Pagos de la empresa" (genérico, no menciona marca).

## Cuentas, mes gratis y suscripción (en curso, 2026-11-03)
- El jefe pidió que cualquier persona pueda usar la app sola (sin depender de una empresa que le asigne usuario), con 1 mes gratis y luego $5/mes.
- Antes de esto el sistema era de una sola empresa compartida: `usuarios` no tenía dueño y todos los pagos eran una sola bolsa global. Se agregó la tabla `cuentas` (cada una con su propio `prueba_inicio`, `suscripcion_activa`, `suscripcion_vence`) y una columna `cuenta_id` en `usuarios`, `pagos`, `historial_pagos` y `configuracion`, con migración automática (la empresa real que ya usaba el sistema quedó en su propia cuenta, **ya marcada con suscripción activa** para que este cambio nunca la bloquee). Toda la lógica (rutas, `paymentsService`, `settingsService`, el bot de WhatsApp en `conversacion.js`, el programador en `scheduler.js`) quedó filtrada por `cuenta_id` — antes no existía ningún aislamiento entre empresas.
- `POST /api/auth/registro`: registro propio, la persona queda de jefe de su propia cuenta nueva.
- `GET /api/auth/suscripcion`: estado (en prueba / cuándo vence / activa). Al pasar el mes sin suscripción, **todo `/api/pagos`** (pagos, historial, exportar) responde 402 — bloqueo total, a propósito.
- `scheduler.js` ahora recorre todas las cuentas cada minuto (cada una con su propia hora de recordatorio en vez de una sola global); `src/routes/cron.js` (el disparador externo para cuando Render duerme) usa `scheduler.revisarTodasLasCuentas()`, no una sola revisión global.
- Suscripción: `in_app_purchase` en la app (`lib/services/suscripcion_service.dart`, producto `activox_suscripcion_mensual`) + `POST /api/auth/verificar-compra`, que verifica el `purchaseToken` contra la API de Android Publisher (`src/services/comprasService.js`, usa `googleapis`) antes de activar la cuenta — nunca se confía en lo que reporte el celular. Falta por hacer: **crear el producto de suscripción ($5/mes) en Play Console** (Monetiza → Productos → Suscripciones, con ese mismo ID) y **crear la cuenta de servicio de Google Cloud con acceso a la Android Publisher API**, subir su JSON como `google-play-service-account.json` (mismo patrón que `firebase-service-account.json`: Secret File en Render o archivo local en la raíz, gitignored) y vincularla en Play Console → Configuración → Acceso a la API.
- Verificación de compra en iOS queda pendiente (App Store Server API); por ahora `POST /api/auth/verificar-compra` rechaza `plataforma: "ios"`.
- Pantallas nuevas en la app: `registro_screen.dart` (desde el login, "¿No tienes cuenta? Regístrate") y `suscripcion_screen.dart` (pantalla de bloqueo, no se puede cerrar sin suscribirse o cerrar sesión; `AuthGate` en `main.dart` decide si mostrarla consultando `/api/auth/suscripcion` al abrir la app, además de reaccionar en caliente si cualquier llamada responde 402).
- **No se ha desplegado todavía**: falta `git push` (dispara el deploy en Render y corre la migración contra Neon en producción) y crear el producto/cuenta de servicio en Play Console antes de que la compra funcione de verdad.

## Ideas siguientes
Fechas legibles y puntos de miles al escribir el monto; filtros y totales en Historial; foto del comprobante y monto real pagado (requieren cambios en el servidor).
