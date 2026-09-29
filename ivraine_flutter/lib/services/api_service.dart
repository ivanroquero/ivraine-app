import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../models/entry.dart';
import '../models/book_response.dart';
import '../models/app_config.dart';

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, [this.statusCode = 500]);

  @override
  String toString() => message;
}

class ApiService {
  String? _accessToken;
  String? _refreshToken;

  void setTokens(String? access, [String? refresh]) {
    _accessToken = access;
    _refreshToken = refresh;
  }

  String? get accessToken => _accessToken;
  String? get refreshToken => _refreshToken;

  Map<String, String> _headers({String? contentType = 'application/json'}) {
    final headers = <String, String>{};
    if (contentType != null) {
      headers['Content-Type'] = contentType;
    }
    if (_accessToken != null && _accessToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_accessToken';
    }
    return headers;
  }

  // --- Supabase Authentication ---

  Future<Map<String, dynamic>> loginWithPassword(String email, String password) async {
    final supabaseUrl = ApiConfig.supabaseUrl.replaceAll(RegExp(r'/+$'), '');
    final anonKey = ApiConfig.supabaseAnonKey;

    final uri = Uri.parse('$supabaseUrl/auth/v1/token?grant_type=password');
    final response = await http.post(
      uri,
      headers: {
        'apikey': anonKey,
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'email': email.trim(),
        'password': password,
      }),
    );

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 200 && response.statusCode < 300) {
      _accessToken = data['access_token'] as String?;
      _refreshToken = data['refresh_token'] as String?;
      return data;
    } else {
      final msg = data['error_description'] ?? data['msg'] ?? data['error'] ?? 'Sign in failed.';
      throw ApiException(msg.toString(), response.statusCode);
    }
  }

  Future<void> requestPasswordReset(String email) async {
    final supabaseUrl = ApiConfig.supabaseUrl.replaceAll(RegExp(r'/+$'), '');
    final anonKey = ApiConfig.supabaseAnonKey;

    final uri = Uri.parse('$supabaseUrl/auth/v1/recover');
    final response = await http.post(
      uri,
      headers: {
        'apikey': anonKey,
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'email': email.trim()}),
    );

    if (response.statusCode >= 400) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      throw ApiException(data['msg']?.toString() ?? 'Password recovery request failed.', response.statusCode);
    }
  }

  // --- Railway Backend Endpoints ---

  Future<BookResponse> getBook() async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/book');
    final response = await http.get(uri, headers: _headers());

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return BookResponse.fromJson(data);
    } else {
      final data = jsonDecode(response.body) as Map<String, dynamic>? ?? {};
      throw ApiException(data['error']?.toString() ?? 'Could not load space info.', response.statusCode);
    }
  }

  Future<String?> sendHeartbeat() async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/active');
    final response = await http.post(uri, headers: _headers(), body: jsonEncode({}));

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return data['last_active_at']?.toString();
    }
    return null;
  }

  Future<Map<String, dynamic>> getEntries({int offset = 0}) async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/entries?offset=$offset');
    final response = await http.get(uri, headers: _headers());

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final rawList = data['entries'] as List? ?? [];
      final entries = rawList.map((e) => Entry.fromJson(e as Map<String, dynamic>)).toList();
      return {
        'entries': entries,
        'nextOffset': data['nextOffset'],
      };
    } else {
      final data = jsonDecode(response.body) as Map<String, dynamic>? ?? {};
      throw ApiException(data['error']?.toString() ?? 'Failed to load entries.', response.statusCode);
    }
  }

  Future<Entry> createEntry(Map<String, dynamic> payload) async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/entries');
    final response = await http.post(
      uri,
      headers: _headers(),
      body: jsonEncode(payload),
    );

    if (response.statusCode == 201 || response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return Entry.fromJson(data);
    } else {
      final data = jsonDecode(response.body) as Map<String, dynamic>? ?? {};
      throw ApiException(data['error']?.toString() ?? 'Failed to create entry.', response.statusCode);
    }
  }

  Future<Entry> updateEntry(String id, String updatedAt, Map<String, dynamic> patchData) async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/entries/$id');
    final body = {
      ...patchData,
      'updated_at': updatedAt,
    };

    final response = await http.patch(
      uri,
      headers: _headers(),
      body: jsonEncode(body),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return Entry.fromJson(data);
    } else {
      final data = jsonDecode(response.body) as Map<String, dynamic>? ?? {};
      throw ApiException(data['error']?.toString() ?? 'Entry update conflicted or failed.', response.statusCode);
    }
  }

  Future<bool> deleteEntry(String id) async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/entries/$id');
    final response = await http.delete(uri, headers: _headers());

    if (response.statusCode == 200) {
      return true;
    } else {
      final data = jsonDecode(response.body) as Map<String, dynamic>? ?? {};
      throw ApiException(data['error']?.toString() ?? 'Failed to delete entry.', response.statusCode);
    }
  }

  Future<String> uploadPhoto(Uint8List bytes, String filename) async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/photos');
    final ext = filename.toLowerCase().endsWith('.png')
        ? 'image/png'
        : filename.toLowerCase().endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';

    final response = await http.post(
      uri,
      headers: _headers(contentType: ext),
      body: bytes,
    );

    if (response.statusCode == 201 || response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return data['path'] as String;
    } else {
      final data = jsonDecode(response.body) as Map<String, dynamic>? ?? {};
      throw ApiException(data['error']?.toString() ?? 'Photo upload failed.', response.statusCode);
    }
  }

  Future<Map<String, String>> uploadVoice(Uint8List bytes, String filename) async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/voice');
    final ext = filename.toLowerCase().endsWith('.m4a')
        ? 'audio/m4a'
        : filename.toLowerCase().endsWith('.mp3')
            ? 'audio/mpeg'
            : filename.toLowerCase().endsWith('.wav')
                ? 'audio/wav'
                : 'audio/webm';

    final response = await http.post(
      uri,
      headers: _headers(contentType: ext),
      body: bytes,
    );

    if (response.statusCode == 201 || response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return {
        'path': data['path']?.toString() ?? '',
        'url': data['url']?.toString() ?? '',
      };
    } else {
      final data = jsonDecode(response.body) as Map<String, dynamic>? ?? {};
      throw ApiException(data['error']?.toString() ?? 'Voice upload failed.', response.statusCode);
    }
  }

  Future<void> trackActivity({
    required String section,
    required String action,
    String details = '',
    String user = 'Visitor',
    int dodgeCount = 0,
    String deviceId = 'android_app',
    double? latitude,
    double? longitude,
  }) async {
    try {
      final uri = Uri.parse('${ApiConfig.baseEndpoint}/track');
      await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'section': section,
          'action': action,
          'details': details,
          'user': user,
          'dodgeCount': dodgeCount,
          'deviceId': deviceId,
          'latitude': latitude,
          'longitude': longitude,
        }),
      );
    } catch (_) {}
  }

  Future<Map<String, dynamic>?> sendDateLocation({
    required double latitude,
    required double longitude,
    required String user,
    String deviceId = 'android_app',
  }) async {
    try {
      final uri = Uri.parse('${ApiConfig.baseEndpoint}/date-location');
      final res = await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'latitude': latitude,
          'longitude': longitude,
          'user': user,
          'deviceId': deviceId,
          'source': 'Private Space',
        }),
      );
      if (res.statusCode == 201 || res.statusCode == 200) {
        return jsonDecode(res.body) as Map<String, dynamic>;
      }
    } catch (_) {}
    return null;
  }

  Future<AppConfig> getAppConfig() async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/config');
    final response = await http.get(uri);
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return AppConfig.fromJson(data['config'] as Map<String, dynamic>? ?? {});
    }
    return AppConfig.fromJson({});
  }

  Future<List<QuizAnswerSubmission>> getMonthsarySubmissions() async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/monthsary/answers');
    final response = await http.get(uri);
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final list = data['submissions'] as List? ?? [];
      return list.map((s) => QuizAnswerSubmission.fromJson(s as Map<String, dynamic>)).toList();
    }
    return [];
  }

  Future<void> submitMonthsaryAnswers({
    required List<Map<String, dynamic>> answers,
    required String user,
    String deviceId = 'android_app',
  }) async {
    final uri = Uri.parse('${ApiConfig.baseEndpoint}/monthsary/answers');
    await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'answers': answers,
        'user': user,
        'deviceId': deviceId,
        'timestamp': DateTime.now().toIso8601String(),
      }),
    );
  }
}
