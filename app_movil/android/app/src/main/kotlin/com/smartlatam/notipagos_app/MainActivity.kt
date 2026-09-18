package com.smartlatam.notipagos_app

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CANAL = "com.smartlatam.notipagos_app/alarma"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CANAL).setMethodCallHandler { call, result ->
            when (call.method) {
                "iniciar" -> {
                    val intent = Intent(this, AlarmService::class.java).apply {
                        putExtra(AlarmService.EXTRA_TITULO, call.argument<String>("titulo"))
                        putExtra(AlarmService.EXTRA_CUERPO, call.argument<String>("cuerpo"))
                    }
                    startForegroundService(intent)
                    result.success(null)
                }
                "detener" -> {
                    val intent = Intent(this, AlarmService::class.java).apply { action = AlarmService.ACTION_STOP }
                    startService(intent)
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }
}
