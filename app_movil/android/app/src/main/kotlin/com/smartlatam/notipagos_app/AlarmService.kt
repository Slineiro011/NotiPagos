package com.smartlatam.notipagos_app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Reproduce el sonido de la alarma con un MediaPlayer propio, en vez de
 * depender del sonido/repeticion de la notificacion del sistema. Esto la hace
 * inmune a que Android la corte cuando llega otra notificacion, se abre el
 * panel de notificaciones o se toca el boton de volumen (cosas que si
 * interrumpen un sonido reproducido a traves de NotificationManager).
 */
class AlarmService : Service() {
    private var mediaPlayer: MediaPlayer? = null

    companion object {
        const val CHANNEL_ID = "alarma_pagos"
        const val NOTIFICATION_ID = 778899
        const val ACTION_STOP = "com.smartlatam.notipagos_app.ACTION_STOP_ALARM"
        const val EXTRA_TITULO = "titulo"
        const val EXTRA_CUERPO = "cuerpo"
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            detenerAlarma()
            return START_NOT_STICKY
        }

        val titulo = intent?.getStringExtra(EXTRA_TITULO) ?: "🔔 Recordatorio de pago"
        val cuerpo = intent?.getStringExtra(EXTRA_CUERPO) ?: "Tienes un pago pendiente."
        iniciarAlarma(titulo, cuerpo)
        return START_STICKY
    }

    private fun crearCanalSiHaceFalta() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        val canal = NotificationChannel(CHANNEL_ID, "Alarma de recordatorios de pagos", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Suena fuerte como una alarma y no para hasta que la apagues. Una por cada pago."
            enableVibration(true)
            setSound(null, null) // el sonido lo maneja el MediaPlayer de este servicio, no el canal
        }
        manager.createNotificationChannel(canal)
    }

    private fun iniciarAlarma(titulo: String, cuerpo: String) {
        crearCanalSiHaceFalta()
        val stopIntent = Intent(this, AlarmService::class.java).apply { action = ACTION_STOP }
        val stopPendiente = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val abrirAppPendiente = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        val notificacion = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle(titulo)
            .setContentText(cuerpo)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(false)
            .setSound(null) // el sonido lo maneja el MediaPlayer de este servicio, no la notificacion
            .apply { abrirAppPendiente?.let { setFullScreenIntent(it, true) } }
            .addAction(0, "🔕 Apagar", stopPendiente)
            .build()

        startForeground(NOTIFICATION_ID, notificacion)
        reproducirSonidoEnBucle()
    }

    private fun reproducirSonidoEnBucle() {
        detenerSonido()
        mediaPlayer = MediaPlayer().apply {
            val afd = resources.openRawResourceFd(R.raw.alarma_pago)
            setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
            afd.close()
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            isLooping = true
            prepare()
            start()
        }
    }

    private fun detenerSonido() {
        mediaPlayer?.apply {
            if (isPlaying) stop()
            release()
        }
        mediaPlayer = null
    }

    private fun detenerAlarma() {
        detenerSonido()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        detenerSonido()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
