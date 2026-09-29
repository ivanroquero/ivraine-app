import 'package:shared_preferences/shared_preferences.dart';

class AuthService {
  static const String keyAccessToken = 'ivraine_auth_token';
  static const String keyRefreshToken = 'ivraine_refresh_token';
  static const String keyUserEmail = 'ivraine_user_email';

  static Future<void> saveSession({
    required String accessToken,
    required String? refreshToken,
    required String email,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyAccessToken, accessToken);
    if (refreshToken != null) {
      await prefs.setString(keyRefreshToken, refreshToken);
    }
    await prefs.setString(keyUserEmail, email);
  }

  static Future<Map<String, String?>> getSession() async {
    final prefs = await SharedPreferences.getInstance();
    return {
      'accessToken': prefs.getString(keyAccessToken),
      'refreshToken': prefs.getString(keyRefreshToken),
      'email': prefs.getString(keyUserEmail),
    };
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(keyAccessToken);
    await prefs.remove(keyRefreshToken);
    await prefs.remove(keyUserEmail);
  }
}
