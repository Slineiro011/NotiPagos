package com.smartlatam.notipagos_app

import android.content.Intent
import com.google.firebase.messaging.RemoteMessage
import io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingService

/**
 * Extiende el servicio de mensajeria de firebase_messaging para arrancar la
 * alarma nativa (AlarmService) de inmediato al recibir el push, sin depender
 * del isolate de Dart en segundo plano. Esto es lo que permite que la alarma
 * suene de forma confiable incluso con la app completamente cerrada.
 *
 * Se llama a super.onMessageReceived() para no romper el comportamiento
 * normal del plugin (sigue disparando manejarMensajeSegundoPlano en Dart).
 */
class NotiPagosMessagingService : FlutterFirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val datos = remoteMessage.data
        if (datos.containsKey("titulo") || datos.containsKey("cuerpo")) {
            val intent = Intent(this, AlarmService::class.java).apply {
                putExtra(AlarmService.EXTRA_TITULO, datos["titulo"])
                putExtra(AlarmService.EXTRA_CUERPO, datos["cuerpo"])
            }
            startForegroundService(intent)
        }
        super.onMessageReceived(remoteMessage)
    }
}
