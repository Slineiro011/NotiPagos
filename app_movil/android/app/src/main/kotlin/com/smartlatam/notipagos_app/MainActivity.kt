package com.smartlatam.notipagos_app

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CANAL = "com.smartlatam.notipagos_app/alarma"
    private var canal: MethodChannel? = null

    // Evita re-avisar el mismo pago dos veces (ej. onNewIntent y onResume
    // disparandose seguidos para el mismo evento de alarma).
    private var pagoIdYaNotificado: String? = null

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
                    pagoIdYaNotificado = null
                    result.success(null)
                }
                // Pago del recordatorio con el que se abrio la app (si se abrio
                // tocando la notificacion de la alarma). Se consume una sola vez.
                "pagoInicial" -> {
                    val pagoId = intent?.getStringExtra(AlarmService.EXTRA_PAGO_ID)
                    intent?.removeExtra(AlarmService.EXTRA_PAGO_ID)
                    if (pagoId != null) pagoIdYaNotificado = pagoId
                    result.success(pagoId)
                }
                // Respaldo de pagoInicial para cuando la app se abrio de otra
                // forma (ej. icono) mientras una alarma seguia sonando: Dart lo
                // pregunta ya con el canal listo, sin depender de onResume (que
                // puede dispararse antes de que Flutter/Firebase terminen de
                // inicializar y perder la llamada).
                "alarmaActivaPagoId" -> {
                    val pagoId = AlarmService.pagoIdActivo(this)
                    if (pagoId != null) pagoIdYaNotificado = pagoId
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
        pagoIdYaNotificado = pagoId
        canal?.invokeMethod("abrirPago", pagoId)
    }

    // Cubre abrir la app por el icono (o los recientes) mientras una alarma
    // ya esta sonando en segundo plano: ahi no llega un Intent nuevo con el
    // dato del pago (ni pagoInicial ni onNewIntent se disparan), asi que se
    // revisa aparte si AlarmService dejo una alarma activa.
    override fun onResume() {
        super.onResume()
        val activo = AlarmService.pagoIdActivo(this)
        if (activo != null && activo != pagoIdYaNotificado) {
            pagoIdYaNotificado = activo
            canal?.invokeMethod("abrirPago", activo)
        }
    }
}
