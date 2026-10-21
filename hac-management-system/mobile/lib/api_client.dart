import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiFailure implements Exception {
  const ApiFailure(this.code, this.message, this.status);
  final String code;
  final String message;
  final int status;
  @override
  String toString() => message;
}

/// Session credentials stay in memory. Production transport requires HTTPS.
/// Uses the same cookie-session endpoints and authoritative rules as the PWA.
class HacApiClient {
  HacApiClient(String origin) : base = Uri.parse(origin) {
    final local = ['localhost', '127.0.0.1', '10.0.2.2'].contains(base.host);
    if (!base.hasAuthority || (base.scheme != 'https' && !(local && base.scheme == 'http'))) {
      throw const ApiFailure('HTTPS_REQUIRED', 'Configure an HTTPS HAC_API_URL. HTTP is allowed only for a local emulator.', 0);
    }
  }
  final Uri base;
  final http.Client _client = http.Client();
  String? _sessionCookie;

  Future<dynamic> request(String path, {String method = 'GET', Map<String, dynamic>? body}) async {
    if (path.startsWith('/') || path.contains('..') || path.contains('://')) {
      throw const ApiFailure('INVALID_PATH', 'API path is invalid.', 0);
    }
    final request = http.Request(method, base.resolve('/api/v1/$path'))
      ..followRedirects = false
      ..headers.addAll({
        'Accept': 'application/json',
        'Origin': base.origin,
        if (body != null) 'Content-Type': 'application/json',
        if (_sessionCookie != null) 'Cookie': _sessionCookie!,
      });
    if (body != null) request.body = jsonEncode(body);
    final response = await http.Response.fromStream(await _client.send(request).timeout(const Duration(seconds: 30)));
    final cookie = response.headers['set-cookie'];
    if (cookie != null) _sessionCookie = cookie.split(';').first;
    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = decoded['error'] as Map<String, dynamic>?;
      if (response.statusCode == 401) _sessionCookie = null;
      throw ApiFailure(error?['code']?.toString() ?? 'REQUEST_FAILED', error?['message']?.toString() ?? 'Request failed.', response.statusCode);
    }
    return decoded['data'];
  }

  Future<Map<String, dynamic>> login(String email, String password) async =>
      Map<String, dynamic>.from(await request('auth/login', method: 'POST', body: {'email': email.trim(), 'password': password}) as Map);
  Future<void> logout() async {
    try { await request('auth/logout', method: 'POST'); } finally { _sessionCookie = null; }
  }
  void dispose() { _sessionCookie = null; _client.close(); }
}
