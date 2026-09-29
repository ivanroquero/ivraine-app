import 'package:flutter/foundation.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';

enum AuthStatus { initial, loading, authenticated, unauthenticated, error }

class AuthProvider extends ChangeNotifier {
  final ApiService _apiService;
  AuthStatus _status = AuthStatus.initial;
  String? _errorMessage;
  String? _userEmail;

  AuthProvider(this._apiService);

  AuthStatus get status => _status;
  bool get isAuthenticated => _status == AuthStatus.authenticated;
  String? get errorMessage => _errorMessage;
  String? get userEmail => _userEmail;

  Future<void> tryAutoLogin() async {
    _status = AuthStatus.loading;
    notifyListeners();

    try {
      final session = await AuthService.getSession();
      final accessToken = session['accessToken'];
      final email = session['email'];

      if (accessToken != null && accessToken.isNotEmpty) {
        _apiService.setTokens(accessToken, session['refreshToken']);
        _userEmail = email;

        // Verify token with backend
        try {
          await _apiService.getBook();
          _status = AuthStatus.authenticated;
          notifyListeners();
          return;
        } catch (_) {
          // Token expired or invalid
          await AuthService.clearSession();
          _apiService.setTokens(null);
        }
      }
    } catch (_) {}

    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _status = AuthStatus.loading;
    _errorMessage = null;
    notifyListeners();

    try {
      final data = await _apiService.loginWithPassword(email, password);
      final accessToken = data['access_token'] as String;
      final refreshToken = data['refresh_token'] as String?;

      _userEmail = email;
      _apiService.setTokens(accessToken, refreshToken);

      await AuthService.saveSession(
        accessToken: accessToken,
        refreshToken: refreshToken,
        email: email,
      );

      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } catch (e) {
      _status = AuthStatus.error;
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> requestPasswordReset(String email) async {
    try {
      await _apiService.requestPasswordReset(email);
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await AuthService.clearSession();
    _apiService.setTokens(null);
    _userEmail = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }
}
