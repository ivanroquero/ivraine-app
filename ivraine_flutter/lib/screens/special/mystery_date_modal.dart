import 'dart:math';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../services/location_service.dart';
import '../../services/api_service.dart';

class MysteryDateModal extends StatefulWidget {
  const MysteryDateModal({Key? key}) : super(key: key);

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const MysteryDateModal(),
    );
  }

  @override
  State<MysteryDateModal> createState() => _MysteryDateModalState();
}

class _MysteryDateModalState extends State<MysteryDateModal> {
  final List<String> _dateIdeas = [
    'Stargazing picnic with sweet snacks and a cozy blanket ✨',
    'Cook a brand new pasta recipe together with romantic candle light 🍝',
    'Late night dessert and iced coffee drive ☕',
    'Polaroid photo walk around an art gallery or old town 📸',
    'At-home movie marathon with homemade popcorn and cuddles 🎬',
    'Sunset watching by the seaside or baywalk 🌅',
    'Bookstore date: pick each other a book to read 📚',
  ];

  String _currentIdea = 'Tap "Spin Date Idea" to pick an adventure!';
  bool _isLocating = false;
  String? _locationStatus;

  void _spinDate() {
    final rand = Random();
    setState(() {
      _currentIdea = _dateIdeas[rand.nextInt(_dateIdeas.length)];
    });
  }

  Future<void> _shareLocation() async {
    setState(() {
      _isLocating = true;
      _locationStatus = null;
    });

    final provider = Provider.of<SpaceProvider>(context, listen: false);
    final user = provider.info?.member.displayName ?? 'Ivan';

    try {
      final res = await LocationService.shareDateLocation(
        apiService: ApiService(),
        userName: user,
      );

      if (mounted) {
        setState(() {
          _isLocating = false;
          _locationStatus = res != null
              ? 'Shared live pin with your love 📍'
              : 'Location permission needed or disabled.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isLocating = false;
          _locationStatus = 'Could not acquire location.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Text(
            'Mystery Date & Location',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: AppTheme.serifFont,
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: isDark ? AppColors.darkText : AppColors.lightText,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Find your next adventure together or drop a secret pin for your date.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
          ),
          const SizedBox(height: 20),

          // Date idea card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkElevated : AppColors.roseSoft.withOpacity(0.4),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.roseSoft),
            ),
            child: Column(
              children: [
                const Text('✨', style: TextStyle(fontSize: 32)),
                const SizedBox(height: 8),
                Text(
                  _currentIdea,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: AppTheme.serifFont,
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    height: 1.4,
                    color: isDark ? AppColors.darkText : AppColors.roseDark,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          ElevatedButton(
            onPressed: _spinDate,
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.rose),
            child: const Text('Spin Date Idea 🎲'),
          ),
          const SizedBox(height: 12),

          OutlinedButton.icon(
            onPressed: _isLocating ? null : _shareLocation,
            icon: _isLocating
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.rose),
                  )
                : const Icon(Icons.share_location_rounded, size: 18),
            label: const Text('Share Date Location Pin 📍'),
          ),

          if (_locationStatus != null) ...[
            const SizedBox(height: 8),
            Text(
              _locationStatus!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: AppColors.rose, fontWeight: FontWeight.bold),
            ),
          ],
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
