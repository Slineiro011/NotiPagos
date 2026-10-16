import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String _clavePrefTema = 'tema_modo';

/// Centraliza el modo de tema (claro/oscuro/sistema) para que MaterialApp
/// se reconstruya al cambiarlo, sin pasar por un StatefulWidget en main.dart.
class TemaService {
  static final ValueNotifier<ThemeMode> modo = ValueNotifier(ThemeMode.system);

  static Future<void> cargar() async {
    final prefs = await SharedPreferences.getInstance();
    final guardado = prefs.getString(_clavePrefTema);
    modo.value = switch (guardado) {
      'claro' => ThemeMode.light,
      'oscuro' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  static Future<void> cambiar(ThemeMode nuevo) async {
    modo.value = nuevo;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_clavePrefTema, switch (nuevo) {
      ThemeMode.light => 'claro',
      ThemeMode.dark => 'oscuro',
      ThemeMode.system => 'sistema',
    });
  }
}
