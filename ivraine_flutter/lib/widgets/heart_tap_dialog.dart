import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../providers/space_provider.dart';

class HeartTapDialog extends StatefulWidget {
  const HeartTapDialog({Key? key}) : super(key: key);

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const HeartTapDialog(),
    );
  }

  @override
  State<HeartTapDialog> createState() => _HeartTapDialogState();
}

class _HeartTapDialogState extends State<HeartTapDialog> {
  final TextEditingController _noteController = TextEditingController();
  String _selectedQuickNote = 'Thinking of you right now ♡';
  bool _sending = false;

  final List<String> _quickNotes = [
    'Thinking of you right now ♡',
    'Can’t wait to hold you ✨',
    'You are my whole heart ♥',
    'Just wanted to send a little love ♡',
    'Missing your smile today ✨',
    'Proud of you always ♡',
  ];

  Future<void> _sendHeart() async {
    HapticFeedback.mediumImpact();
    setState(() => _sending = true);

    final note = _noteController.text.trim().isNotEmpty
        ? _noteController.text.trim()
        : _selectedQuickNote;

    final provider = Provider.of<SpaceProvider>(context, listen: false);
    await provider.sendHeartTouch(note);

    if (mounted) {
      setState(() => _sending = false);
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Sent your love: "$note" ♡'),
          backgroundColor: AppColors.rose,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
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
              width: 44,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const Center(
            child: Text(
              '♥',
              style: TextStyle(
                fontSize: 48,
                color: AppColors.roseAccent,
                height: 1,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            '“I Miss You” Touch',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: AppTheme.serifFont,
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: isDark ? AppColors.darkText : AppColors.lightText,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Send a gentle tap and sweet love note across the miles.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppColors.darkMuted : AppColors.lightMuted,
            ),
          ),
          const SizedBox(height: 20),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _quickNotes.map((note) {
              final isSelected = _selectedQuickNote == note;
              return ChoiceChip(
                label: Text(note, style: const TextStyle(fontSize: 12)),
                selected: isSelected,
                selectedColor: AppColors.roseSoft,
                backgroundColor: isDark ? AppColors.darkElevated : AppColors.lightBg,
                labelStyle: TextStyle(
                  color: isSelected ? AppColors.roseDark : (isDark ? AppColors.darkText : AppColors.lightText),
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                ),
                onSelected: (sel) {
                  if (sel) {
                    setState(() {
                      _selectedQuickNote = note;
                      _noteController.clear();
                    });
                  }
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _noteController,
            maxLines: 2,
            decoration: InputDecoration(
              hintText: 'Or write a personalized love note...',
              filled: true,
              fillColor: isDark ? AppColors.darkElevated : AppColors.lightBg,
            ),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _sending ? null : _sendHeart,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.roseAccent,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: _sending
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                  )
                : const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Send Heart Touch ♡', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
