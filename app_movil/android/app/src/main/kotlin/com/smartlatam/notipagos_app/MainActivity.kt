package com.smartlatam.notipagos_app

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CANAL = "com.smartlatam.notipagos_app/alarma"
    private var canal: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        canal = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CANAL)
        canal?.setMethodCallHandler { call, result ->
            when (call.method) {
                "iniciar" -> {
                    val intent = Intent(this, AlarmService::class.java).apply {
                        putExtra(AlarmService.EXTRA_TITULO, call.argument<String>("titulo"))
                        putExtra(AlarmService.EXTRA_CUERPO, call.argument<String>("cuerpo"))
                        putExtra(AlarmService.EXTRA_PAGO_ID, call.argument<String>("pagoId"))
                    }
                    startForegroundService(intent)
                    result.success(null)
                }
                "detener" -> {
                    val intent = Intent(this, AlarmService::class.java).apply { action = AlarmService.ACTION_STOP }
                    startService(intent)
                    result.success(null)
                }
                // Pago del recordatorio con el que se abrio la app (si se abrio
                // tocando la notificacion de la alarma). Se consume una sola vez.
                "pagoInicial" -> {
                    val pagoId = intent?.getStringExtra(AlarmService.EXTRA_PAGO_ID)
                    intent?.removeExtra(AlarmService.EXTRA_PAGO_ID)
                    result.success(pagoId)
                }
                else -> result.notImplemented()
            }
        }
    }

    // Con la app ya abierta, tocar la notificacion llega aqui.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val pagoId = intent.getStringExtra(AlarmService.EXTRA_PAGO_ID) ?: return
        intent.removeExtra(AlarmService.EXTRA_PAGO_ID)
        canal?.invokeMethod("abrirPago", pagoId)
    }
}
