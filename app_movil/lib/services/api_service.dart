import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/pago.dart';

const String _urlPorDefecto = 'https://notipagos.onrender.com/api';
const String _clavePrefUrl = 'api_base_url';
const String _clavePrefToken = 'auth_token';

/// Se llama cuando el servidor responde 401 (sesion invalida/expirada), para
/// que la app pueda volver a mostrar la pantalla de login.
class ApiService {
  static String? _cacheBaseUrl;
  static String? _cacheToken;
  static VoidCallback? onNoAutenticado;

  static Future<String> getBaseUrl() async {
    if (_cacheBaseUrl != null) return _cacheBaseUrl!;
    final prefs = await SharedPreferences.getInstance();
    _cacheBaseUrl = prefs.getString(_clavePrefUrl) ?? _urlPorDefecto;
    return _cacheBaseUrl!;
  }

  static Future<void> setBaseUrl(String url) async {
    final limpia = url.trim().replaceAll(RegExp(r'/+$'), '');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_clavePrefUrl, limpia);
    _cacheBaseUrl = limpia;
  }

  static Future<String?> getToken() async {
    if (_cacheToken != null) return _cacheToken;
    final prefs = await SharedPreferences.getInstance();
    _cacheToken = prefs.getString(_clavePrefToken);
    return _cacheToken;
  }

  static Future<void> _setToken(String? token) async {
    final prefs = await SharedPreferences.getInstance();
    if (token == null) {
      await prefs.remove(_clavePrefToken);
    } else {
      await prefs.setString(_clavePrefToken, token);
    }
    _cacheToken = token;
  }

  static Future<void> cerrarSesion() => _setToken(null);

  static Future<void> login(String usuario, String password) async {
    final res = await http.post(
      await _uri('/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'usuario': usuario, 'password': password}),
    );
    final data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw Exception(data['error'] ?? 'No se pudo iniciar sesión');
    }
    await _setToken(data['token'] as String);
  }

  static Future<Uri> _uri(String path, [Map<String, String>? query]) async {
    final base = await getBaseUrl();
    return Uri.parse('$base$path').replace(queryParameters: query);
  }

  static Future<Map<String, String>> _headers() async {
    final token = await getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static void _verificar(http.Response res) {
    if (res.statusCode == 401) {
      _setToken(null);
      onNoAutenticado?.call();
      throw Exception('Sesión expirada, vuelve a iniciar sesión.');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Error del servidor (${res.statusCode}): ${res.body}');
    }
  }

  // ---------- Pagos ----------

  static Future<List<Pago>> getPagos({String filtro = 'pendientes', String? empresa}) async {
    final query = {'filtro': filtro, if (empresa != null && empresa.isNotEmpty) 'empresa': empresa};
    final res = await http.get(await _uri('/pagos', query), headers: await _headers());
    _verificar(res);
    final lista = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return lista.map((e) => Pago.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<String>> getEmpresas() async {
    final res = await http.get(await _uri('/pagos/empresas/lista'), headers: await _headers());
    _verificar(res);
    final lista = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return lista.map((e) => e.toString()).toList();
  }

  static Future<List<Map<String, dynamic>>> getHistorial() async {
    final res = await http.get(await _uri('/pagos/historial'), headers: await _headers());
    _verificar(res);
    final lista = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return lista.cast<Map<String, dynamic>>();
  }

  static Future<Pago> crearPago(Pago pago) async {
    final res = await http.post(await _uri('/pagos'), headers: await _headers(), body: jsonEncode(pago.toJson()));
    _verificar(res);
    return Pago.fromJson(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
  }

  static Future<Pago> actualizarPago(int id, Pago pago) async {
    final res = await http.put(await _uri('/pagos/$id'), headers: await _headers(), body: jsonEncode(pago.toJson()));
    _verificar(res);
    return Pago.fromJson(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
  }

  static Future<void> marcarPagado(int id) async {
    final res = await http.post(await _uri('/pagos/$id/pagado'), headers: await _headers());
    _verificar(res);
  }

  static Future<void> eliminarPago(int id) async {
    final res = await http.delete(await _uri('/pagos/$id'), headers: await _headers());
    _verificar(res);
  }

  // ---------- Configuracion ----------

  static Future<Map<String, dynamic>> getConfiguracion() async {
    final res = await http.get(await _uri('/configuracion'), headers: await _headers());
    _verificar(res);
    return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
  }

  static Future<void> guardarConfiguracion({String? numerosWhatsapp, String? horaRecordatorio}) async {
    final body = <String, dynamic>{};
    if (numerosWhatsapp != null) body['numeros_whatsapp'] = numerosWhatsapp;
    if (horaRecordatorio != null) body['hora_recordatorio'] = horaRecordatorio;
    final res = await http.put(await _uri('/configuracion'), headers: await _headers(), body: jsonEncode(body));
    _verificar(res);
  }

  // ---------- Dispositivos (para push notifications) ----------

  static Future<void> registrarDispositivo(String token, {String plataforma = 'android'}) async {
    final res = await http.post(
      await _uri('/dispositivos'),
      headers: await _headers(),
      body: jsonEncode({'token': token, 'plataforma': plataforma}),
    );
    _verificar(res);
  }
}
