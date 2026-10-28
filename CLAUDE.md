# Notix — contexto para Claude

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
- `npm audit`: quedan 2 moderadas sin arreglo porque `exceljs` no tiene una versión más nueva que actualice su dependencia de `uuid` (bajarlo rompería el export a Excel). El resto (incluida la crítica) ya se arregló.

## Marca: Notix (antes NotiPagos)
- Nombre visible en la app: "Notix" (Android `android:label`, iOS `CFBundleDisplayName`, `MaterialApp.title`, texto de versión en Configuración).
- Los identificadores internos NO cambiaron a propósito: `com.smartlatam.notipagos_app` (Android), `com.smartlatam.notipagosApp` (iOS), nombres de clases y del canal nativo. Cambiarlos rompería las actualizaciones en las tiendas y la configuración de Firebase.
- Íconos: `assets/icon/icon.png` es el logo completo (iOS e ícono clásico de Android). `assets/icon/icon_foreground.png` es el mismo logo al 87% centrado, para el ícono adaptable de Android (el plugin ya aplica un inset de 16%; así nada queda recortado por la máscara circular). Regenerar con `dart run flutter_launcher_icons`.
- Falta: cambiar el nombre en Play Console / App Store Connect; la web (`public/`) sigue diciendo NotiPagos. Sugerido al jefe: una versión del ícono sin la palabra "NOTIX" (se ve pequeña), pendiente de su decisión.

## Ideas siguientes
Fechas legibles y puntos de miles al escribir el monto; filtros y totales en Historial; foto del comprobante y monto real pagado (requieren cambios en el servidor).
