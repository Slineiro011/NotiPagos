import AVFoundation
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private let canal = "com.smartlatam.notipagos_app/alarma"
  private var reproductor: AVAudioPlayer?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  /// Con el ciclo de vida UIScene (obligatorio desde iOS 27) el motor de
  /// Flutter se crea despues del arranque, asi que plugins y canal se
  /// registran aqui y no en didFinishLaunching.
  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    if let registrador = engineBridge.pluginRegistry.registrar(forPlugin: "AlarmaNotiPagos") {
      FlutterMethodChannel(name: canal, binaryMessenger: registrador.messenger())
        .setMethodCallHandler { [weak self] llamada, resultado in
          switch llamada.method {
          case "iniciar":
            self?.iniciarAlarma()
            resultado(nil)
          case "detener":
            self?.detenerAlarma()
            resultado(nil)
          default:
            resultado(FlutterMethodNotImplemented)
          }
        }
    }
  }

  /// Con la app abierta, iOS no reproduce el sonido de la notificacion push,
  /// asi que la alarma se hace sonar aqui en bucle hasta que se apague.
  /// Con la app cerrada, el sonido lo pone la propia notificacion push
  /// (alarma_pago.caf, ~29 s, el maximo que permite iOS).
  private func iniciarAlarma() {
    guard let url = Bundle.main.url(forResource: "alarma_pago", withExtension: "caf") else { return }
    do {
      // .playback hace que suene aunque el iPhone este en modo silencio.
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
      try AVAudioSession.sharedInstance().setActive(true)
      reproductor?.stop()
      reproductor = try AVAudioPlayer(contentsOf: url)
      reproductor?.numberOfLoops = -1
      reproductor?.play()
    } catch {
      NSLog("No se pudo reproducir la alarma: \(error)")
    }
  }

  private func detenerAlarma() {
    reproductor?.stop()
    reproductor = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}

class SceneDelegate: FlutterSceneDelegate {}
