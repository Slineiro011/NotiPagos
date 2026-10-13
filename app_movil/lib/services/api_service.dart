import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/pago.dart';

const String _urlPorDefecto = 'https://notipagos.onrender.com/api';
const String _clavePrefUrl = 'api_base_url';
const String _clavePrefToken = 'auth_token';
const String _clavePrefNombre = 'auth_nombre';
const String _clavePrefRol = 'auth_rol';
const String _clavePrefUsuario = 'auth_usuario';

/// Texto listo para mostrarle al usuario a partir de cualquier error.
String mensajeError(Object error) => error.toString().replaceFirst('Exception: ', '');

/// Cliente HTTP con tiempo limite y errores de red en lenguaje claro.
class _ClienteNotiPagos extends http.BaseClient {
  final http.Client _interno = http.Client();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    try {
      return await _interno.send(request).timeout(const Duration(seconds: 30));
    } on TimeoutException {
      throw Exception('El servidor tardó demasiado en responder. Intenta de nuevo.');
    } on http.ClientException {
      throw Exception('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
    }
  }
}

final _cliente = _ClienteNotiPagos();

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

  static Future<void> cerrarSesion() async {
    await _setToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_clavePrefNombre);
    await prefs.remove(_clavePrefRol);
    await prefs.remove(_clavePrefUsuario);
  }

  static Future<void> login(String usuario, String password) async {
    final res = await _cliente.post(
      await _uri('/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'usuario': usuario, 'password': password}),
    );
    if (res.statusCode != 200) throw Exception(_mensajeDe(res, 'No se pudo iniciar sesión'));
    final data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    await _setToken(data['token'] as String);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_clavePrefNombre, (data['nombre'] ?? data['usuario'] ?? '') as String);
    await prefs.setString(_clavePrefRol, (data['rol'] ?? 'usuario') as String);
    await prefs.setString(_clavePrefUsuario, (data['usuario'] ?? usuario) as String);
  }

  static Future<String> getNombre() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_clavePrefNombre) ?? '';
  }

  static Future<String> getRol() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_clavePrefRol) ?? 'usuario';
  }

  static Future<String> getUsuarioActual() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_clavePrefUsuario) ?? '';
  }

  static Future<bool> esJefe() async => (await getRol()) == 'jefe';

  static Future<Map<String, dynamic>> getPerfil() async {
    final res = await _cliente.get(await _uri('/auth/perfil'), headers: await _headers());
    _verificar(res);
    return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
  }

  /// Actualiza nombre, usuario, telefono y/o contraseña propios. El servidor
  /// devuelve un token nuevo (el usuario o el nombre pudieron cambiar), asi
  /// que se guarda la sesion local con esos datos actualizados.
  static Future<void> actualizarPerfil({String? nombre, String? usuario, String? telefono, String? password}) async {
    final cambios = <String, dynamic>{};
    if (nombre != null) cambios['nombre'] = nombre;
    if (usuario != null) cambios['usuario'] = usuario;
    if (telefono != null) cambios['telefono'] = telefono;
    if (password != null && password.isNotEmpty) cambios['password'] = password;
    final res = await _cliente.put(
      await _uri('/auth/perfil'),
      headers: await _headers(),
      body: jsonEncode(cambios),
    );
    _verificar(res);
    final data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    await _setToken(data['token'] as String);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_clavePrefNombre, (data['nombre'] ?? '') as String);
    await prefs.setString(_clavePrefRol, (data['rol'] ?? 'usuario') as String);
    await prefs.setString(_clavePrefUsuario, (data['usuario'] ?? '') as String);
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
      throw Exception(_mensajeDe(res, 'No se pudo completar la operación'));
    }
  }

  /// Usa el campo "error" que manda el servidor; si no viene (o la respuesta
  /// no es JSON), un mensaje generico segun el tipo de fallo.
  static String _mensajeDe(http.Response res, String porDefecto) {
    try {
      final data = jsonDecode(utf8.decode(res.bodyBytes));
      if (data is Map && data['error'] is String) return data['error'] as String;
    } catch (_) {}
    if (res.statusCode >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en un momento.';
    return porDefecto;
  }

  // ---------- Pagos ----------

  static Future<List<Pago>> getPagos({String filtro = 'pendientes', String? empresa, String? usuario}) async {
    final query = {
      'filtro': filtro,
      if (empresa != null && empresa.isNotEmpty) 'empresa': empresa,
      if (usuario != null && usuario.isNotEmpty) 'usuario': usuario,
    };
    final res = await _cliente.get(await _uri('/pagos', query), headers: await _headers());
    _verificar(res);
    final lista = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return lista.map((e) => Pago.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<Map<String, dynamic>>> getUsuarios() async {
    final res = await _cliente.get(await _uri('/usuarios'), headers: await _headers());
    _verificar(res);
    final lista = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return lista.cast<Map<String, dynamic>>();
  }

  static Future<void> crearUsuario({
    required String usuario,
    required String password,
    required String nombre,
    required String rol,
    String? telefono,
  }) async {
    final res = await _cliente.post(
      await _uri('/usuarios'),
      headers: await _headers(),
      body: jsonEncode({'usuario': usuario, 'password': password, 'nombre': nombre, 'rol': rol, 'telefono': telefono}),
    );
    if (res.statusCode == 401) return _verificar(res);
    if (res.statusCode < 200 || res.statusCode >= 300) throw Exception(_mensajeDe(res, 'No se pudo crear el usuario'));
  }

  static Future<void> actualizarUsuario(
    String usuarioOriginal, {
    required String nombre,
    required String rol,
    String? telefono,
    String? password,
  }) async {
    final cambios = <String, dynamic>{'nombre': nombre, 'rol': rol, 'telefono': telefono};
    if (password != null && password.isNotEmpty) cambios['password'] = password;
    final res = await _cliente.put(
      await _uri('/usuarios/${Uri.encodeComponent(usuarioOriginal)}'),
      headers: await _headers(),
      body: jsonEncode(cambios),
    );
    if (res.statusCode == 401) return _verificar(res);
    if (res.statusCode < 200 || res.statusCode >= 300) throw Exception(_mensajeDe(res, 'No se pudo actualizar el usuario'));
  }

  static Future<void> eliminarUsuario(String usuario) async {
    final res = await _cliente.delete(await _uri('/usuarios/${Uri.encodeComponent(usuario)}'), headers: await _headers());
    if (res.statusCode == 401) return _verificar(res);
    if (res.statusCode < 200 || res.statusCode >= 300) throw Exception(_mensajeDe(res, 'No se pudo eliminar el usuario'));
  }

  static Future<List<String>> getEmpresas() async {
    final res = await _cliente.get(await _uri('/pagos/empresas/lista'), headers: await _headers());
    _verificar(res);
    final lista = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return lista.map((e) => e.toString()).toList();
  }

  static Future<List<Map<String, dynamic>>> getHistorial() async {
    final res = await _cliente.get(await _uri('/pagos/historial'), headers: await _headers());
    _verificar(res);
    final lista = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return lista.cast<Map<String, dynamic>>();
  }

  static Future<Pago> crearPago(Pago pago) async {
    final res = await _cliente.post(await _uri('/pagos'), headers: await _headers(), body: jsonEncode(pago.toJson()));
    _verificar(res);
    return Pago.fromJson(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
  }

  static Future<Pago> actualizarPago(int id, Pago pago) async {
    final res = await _cliente.put(await _uri('/pagos/$id'), headers: await _headers(), body: jsonEncode(pago.toJson()));
    _verificar(res);
    return Pago.fromJson(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
  }

  static Future<void> marcarPagado(int id) async {
    final res = await _cliente.post(await _uri('/pagos/$id/pagado'), headers: await _headers());
    _verificar(res);
  }

  static Future<void> eliminarPago(int id) async {
    final res = await _cliente.delete(await _uri('/pagos/$id'), headers: await _headers());
    _verificar(res);
  }

  // ---------- Configuracion ----------

  static Future<Map<String, dynamic>> getConfiguracion() async {
    final res = await _cliente.get(await _uri('/configuracion'), headers: await _headers());
    _verificar(res);
    return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
  }

  static Future<void> guardarConfiguracion({String? numerosWhatsapp, String? horaRecordatorio}) async {
    final body = <String, dynamic>{};
    if (numerosWhatsapp != null) body['numeros_whatsapp'] = numerosWhatsapp;
    if (horaRecordatorio != null) body['hora_recordatorio'] = horaRecordatorio;
    final res = await _cliente.put(await _uri('/configuracion'), headers: await _headers(), body: jsonEncode(body));
    _verificar(res);
  }

  // ---------- Dispositivos (para push notifications) ----------

  static Future<void> registrarDispositivo(String token, {String plataforma = 'android'}) async {
    final res = await _cliente.post(
      await _uri('/dispositivos'),
      headers: await _headers(),
      body: jsonEncode({'token': token, 'plataforma': plataforma}),
    );
    _verificar(res);
  }
}
