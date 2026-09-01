import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/pago.dart';

const String _urlPorDefecto = 'https://notipagos.onrender.com/api';
const String _clavePrefUrl = 'api_base_url';

class ApiService {
  static String? _cacheBaseUrl;

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

  static Future<Uri> _uri(String path, [Map<String, String>? query]) async {
    final base = await getBaseUrl();
    return Uri.parse('$base$path').replace(queryParameters: query);
  }

  static Map<String, String> get _headersJson => {'Content-Type': 'application/json'};

  static void _verificar(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Error del servidor (${res.statusCode}): ${res.body}');
    }
  }

  // ---------- Pagos ----------

  static Future<List<Pago>> getPagos({String filtro = 'pendientes', String? empresa}) async {
    final query = {'filtro': filtro, if (empresa != null && empresa.isNotEmpty) 'empresa': empresa};
    final res = await http.get(await _uri('/pagos', query));
    _verificar(res);
    final lista = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return lista.map((e) => Pago.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<String>> getEmpresas() async {
    final res = await http.get(await _uri('/pagos/empresas/lista'));
    _verificar(res);
    final lista = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return lista.map((e) => e.toString()).toList();
  }

  static Future<List<Map<String, dynamic>>> getHistorial() async {
    final res = await http.get(await _uri('/pagos/historial'));
    _verificar(res);
    final lista = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return lista.cast<Map<String, dynamic>>();
  }

  static Future<Pago> crearPago(Pago pago) async {
    final res = await http.post(await _uri('/pagos'), headers: _headersJson, body: jsonEncode(pago.toJson()));
    _verificar(res);
    return Pago.fromJson(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
  }

  static Future<Pago> actualizarPago(int id, Pago pago) async {
    final res = await http.put(await _uri('/pagos/$id'), headers: _headersJson, body: jsonEncode(pago.toJson()));
    _verificar(res);
    return Pago.fromJson(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
  }

  static Future<void> marcarPagado(int id) async {
    final res = await http.post(await _uri('/pagos/$id/pagado'));
    _verificar(res);
  }

  static Future<void> eliminarPago(int id) async {
    final res = await http.delete(await _uri('/pagos/$id'));
    _verificar(res);
  }

  // ---------- Configuracion ----------

  static Future<Map<String, dynamic>> getConfiguracion() async {
    final res = await http.get(await _uri('/configuracion'));
    _verificar(res);
    return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
  }

  static Future<void> guardarConfiguracion({String? numerosWhatsapp, String? horaRecordatorio}) async {
    final body = <String, dynamic>{};
    if (numerosWhatsapp != null) body['numeros_whatsapp'] = numerosWhatsapp;
    if (horaRecordatorio != null) body['hora_recordatorio'] = horaRecordatorio;
    final res = await http.put(await _uri('/configuracion'), headers: _headersJson, body: jsonEncode(body));
    _verificar(res);
  }

  // ---------- Dispositivos (para push notifications) ----------

  static Future<void> registrarDispositivo(String token, {String plataforma = 'android'}) async {
    final res = await http.post(
      await _uri('/dispositivos'),
      headers: _headersJson,
      body: jsonEncode({'token': token, 'plataforma': plataforma}),
    );
    _verificar(res);
  }
}
