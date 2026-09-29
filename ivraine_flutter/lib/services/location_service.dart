import 'package:geolocator/geolocator.dart';
import 'api_service.dart';

class LocationService {
  static Future<Position?> getCurrentPosition() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        return null;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          return null;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        return null;
      }

      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
        timeLimit: const Duration(seconds: 10),
      );
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> shareDateLocation({
    required ApiService apiService,
    required String userName,
    String deviceId = 'android_app',
  }) async {
    final pos = await getCurrentPosition();
    if (pos == null) return null;

    return await apiService.sendDateLocation(
      latitude: pos.latitude,
      longitude: pos.longitude,
      user: userName,
      deviceId: deviceId,
    );
  }
}
