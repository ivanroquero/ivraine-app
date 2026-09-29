import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../models/entry.dart';
import '../../widgets/wax_seal_widget.dart';
import '../../widgets/voice_note_player.dart';

class LetterReaderDialog extends StatefulWidget {
  final Entry letter;

  const LetterReaderDialog({Key? key, required this.letter}) : super(key: key);

  static void show(BuildContext context, Entry letter) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => LetterReaderDialog(letter: letter),
    );
  }

  @override
  State<LetterReaderDialog> createState() => _LetterReaderDialogState();
}

class _LetterReaderDialogState extends State<LetterReaderDialog> {
  late bool _isOpened;
  bool _unsealing = false;

  @override
  void initState() {
    super.initState();
    _isOpened = widget.letter.completed;
  }

  Future<void> _handleUnseal() async {
    if (widget.letter.isLocked) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('This letter is locked until ${widget.letter.lockUntil} 🔒'),
          backgroundColor: AppColors.goldDark,
        ),
      );
      return;
    }

    HapticFeedback.heavyImpact();
    setState(() => _unsealing = true);

    final provider = Provider.of<SpaceProvider>(context, listen: false);
    await provider.unsealLetter(widget.letter);

    if (mounted) {
      setState(() {
        _isOpened = true;
        _unsealing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final letter = widget.letter;
    final isLocked = letter.isLocked;

    final title = letter.title.toLowerCase().startsWith('open when')
        ? letter.title.substring(9).trim()
        : letter.title;

    final openedLabel = letter.openedBy != null && letter.openedAt != null
        ? 'Opened by ${letter.openedBy} on ${letter.openedAt} ♡'
        : 'Opened with love ♡';

    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF201B24) : const Color(0xFFFFFDF9),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.roseSoft,
          width: 1.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Drag handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'A LETTER FOR YOU',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2,
                  color: AppColors.rose,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, size: 22),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),

          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 12),
                  // If not opened yet, show wax seal unsealing stage
                  if (!_isOpened) ...[
                    const SizedBox(height: 32),
                    Center(
                      child: WaxSealWidget(
                        state: isLocked ? WaxSealState.locked : WaxSealState.intact,
                        size: 72,
                        onTap: _handleUnseal,
                      ),
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      'OPEN WHEN...',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.5,
                        color: AppColors.rose,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      title,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: AppTheme.serifFont,
                        fontSize: 26,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkText : AppColors.lightText,
                      ),
                    ),
                    const SizedBox(height: 20),
                    if (isLocked) ...[
                      Text(
                        '🔒 This letter is sealed until ${letter.lockUntil}.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.goldDark,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Patience, my love. It will open on the special day.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
                      ),
                    ] else ...[
                      ElevatedButton(
                        onPressed: _unsealing ? null : _handleUnseal,
                        child: _unsealing
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              )
                            : const Text('Break Seal & Read Letter ♡'),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Tap the wax seal or button to unseal this letter.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 11, color: AppColors.lightMuted),
                      ),
                    ],
                  ] else ...[
                    // Opened Letter Content
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppColors.roseSoft,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: AppColors.rose.withOpacity(0.3),
                            style: BorderStyle.solid,
                          ),
                        ),
                        child: Text(
                          openedLabel,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: AppColors.roseDark,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'OPEN WHEN...',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.5,
                        color: AppColors.rose,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      title,
                      style: TextStyle(
                        fontFamily: AppTheme.serifFont,
                        fontSize: 26,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkText : AppColors.lightText,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Divider(height: 1),
                    const SizedBox(height: 16),

                    if (letter.voiceUrl.isNotEmpty) ...[
                      VoiceNotePlayer(audioUrl: letter.voiceUrl, title: 'Accompanying Voice Memo'),
                      const SizedBox(height: 16),
                    ],

                    Text(
                      letter.body,
                      style: TextStyle(
                        fontFamily: AppTheme.serifFont,
                        fontSize: 17,
                        height: 1.8,
                        letterSpacing: 0.2,
                        color: isDark ? AppColors.darkText : const Color(0xFF2C222E),
                      ),
                    ),
                    const SizedBox(height: 32),
                    Text(
                      'Forever & Always Yours,\nWith all my love ♡',
                      style: TextStyle(
                        fontFamily: AppTheme.serifFont,
                        fontStyle: FontStyle.italic,
                        fontSize: 20,
                        color: AppColors.rose,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 40),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
