import 'package:shared_preferences/shared_preferences.dart';

class ApiConfig {
  // Default values pointing to local dev backend or production Railway backend
  static const String defaultApiUrl = 'http://10.0.2.2:3001';
  static const String defaultSupabaseUrl = 'https://YOUR_PROJECT_REF.supabase.co';
  static const String defaultSupabaseAnonKey = 'YOUR_SUPABASE_PUBLISHABLE_KEY';

  static String _apiUrl = defaultApiUrl;
  static String _supabaseUrl = defaultSupabaseUrl;
  static String _supabaseAnonKey = defaultSupabaseAnonKey;

  static String get apiUrl => _apiUrl;
  static String get supabaseUrl => _supabaseUrl;
  static String get supabaseAnonKey => _supabaseAnonKey;

  static const String keyApiUrl = 'ivraine_api_url';
  static const String keySupabaseUrl = 'ivraine_supabase_url';
  static const String keySupabaseKey = 'ivraine_supabase_key';

  static Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _apiUrl = prefs.getString(keyApiUrl) ?? defaultApiUrl;
    _supabaseUrl = prefs.getString(keySupabaseUrl) ?? defaultSupabaseUrl;
    _supabaseAnonKey = prefs.getString(keySupabaseKey) ?? defaultSupabaseAnonKey;
  }

  static Future<void> save({
    required String apiUrl,
    required String supabaseUrl,
    required String supabaseAnonKey,
  }) async {
    _apiUrl = apiUrl.trim().replaceAll(RegExp(r'/+$'), '');
    _supabaseUrl = supabaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    _supabaseAnonKey = supabaseAnonKey.trim();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyApiUrl, _apiUrl);
    await prefs.setString(keySupabaseUrl, _supabaseUrl);
    await prefs.setString(keySupabaseKey, _supabaseAnonKey);
  }

  /// Clean API endpoint base ensuring /api suffix where appropriate
  static String get baseEndpoint {
    var url = _apiUrl.replaceAll(RegExp(r'/+$'), '');
    if (!url.endsWith('/api')) {
      url = '$url/api';
    }
    return url;
  }
}
