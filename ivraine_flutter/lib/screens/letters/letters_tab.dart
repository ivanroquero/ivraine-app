import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../models/entry.dart';
import '../../widgets/wax_seal_widget.dart';
import 'letter_reader_dialog.dart';
import 'letter_editor_screen.dart';

class LettersTab extends StatefulWidget {
  const LettersTab({Key? key}) : super(key: key);

  @override
  State<LettersTab> createState() => _LettersTabState();
}

class _LettersTabState extends State<LettersTab> {
  String _filter = 'all'; // 'all' | 'sealed' | 'opened'

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<SpaceProvider>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final allLetters = provider.getFilteredEntries('note');

    final letters = allLetters.where((e) {
      if (_filter == 'sealed') return !e.completed;
      if (_filter == 'opened') return e.completed;
      return true;
    }).toList();

    return RefreshIndicator(
      color: AppColors.rose,
      onRefresh: provider.refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Romantic Header
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: isDark
                    ? [const Color(0xFF2A2030), const Color(0xFF201A26)]
                    : [const Color(0xFFFCF4F6), const Color(0xFFF7EFF2)],
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.roseSoft,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'A LITTLE LOVE, FOR LATER',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.8,
                    color: AppColors.rose,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Open When Letters',
                  style: TextStyle(
                    fontFamily: AppTheme.serifFont,
                    fontSize: 24,
                    color: isDark ? AppColors.darkText : AppColors.lightText,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Words to find you when you need them most. Sealed with love.',
                  style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Filter Segment
          Row(
            children: [
              _buildFilterChip('All (${allLetters.length})', 'all'),
              const SizedBox(width: 8),
              _buildFilterChip(
                'Sealed (${allLetters.where((e) => !e.completed).length})',
                'sealed',
              ),
              const SizedBox(width: 8),
              _buildFilterChip(
                'Opened (${allLetters.where((e) => e.completed).length})',
                'opened',
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (letters.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 20),
              alignment: Alignment.center,
              child: Column(
                children: [
                  const Text('✉', style: TextStyle(fontSize: 48, color: AppColors.roseSoft)),
                  const SizedBox(height: 10),
                  Text(
                    'No letters in this view.',
                    style: TextStyle(
                      fontFamily: AppTheme.serifFont,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Write a letter for when your partner needs a smile or hug.',
                    style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            )
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: letters.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 0.72,
              ),
              itemBuilder: (ctx, idx) => _buildLetterCard(ctx, letters[idx], isDark),
            ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String value) {
    final isSelected = _filter == value;
    return ChoiceChip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      selected: isSelected,
      selectedColor: AppColors.roseSoft,
      labelStyle: TextStyle(
        color: isSelected ? AppColors.roseDark : AppColors.lightMuted,
        fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
      ),
      onSelected: (sel) {
        if (sel) setState(() => _filter = value);
      },
    );
  }

  Widget _buildLetterCard(BuildContext context, Entry letter, bool isDark) {
    final isOpened = letter.completed;
    final isLocked = letter.isLocked;

    WaxSealState sealState;
    if (isLocked) {
      sealState = WaxSealState.locked;
    } else if (isOpened) {
      sealState = WaxSealState.cracked;
    } else {
      sealState = WaxSealState.intact;
    }

    final title = letter.title.toLowerCase().startsWith('open when')
        ? letter.title.substring(9).trim()
        : letter.title;

    return Container(
      decoration: BoxDecoration(
        color: isOpened
            ? (isDark ? const Color(0xFF241C24) : const Color(0xFFFCF8F9))
            : (isDark ? AppColors.darkSurface : const Color(0xFFF9EEF1)),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.roseSoft,
          width: 1.5,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () {
            LetterReaderDialog.show(context, letter);
          },
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Envelope flap simulation
                WaxSealWidget(
                  state: sealState,
                  size: 46,
                  onTap: () {
                    LetterReaderDialog.show(context, letter);
                  },
                ),
                const SizedBox(height: 12),
                const Text(
                  'OPEN WHEN...',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.2,
                    color: AppColors.rose,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: AppTheme.serifFont,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkText : AppColors.lightText,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: isOpened
                        ? AppColors.liveGreen.withOpacity(0.12)
                        : isLocked
                            ? AppColors.goldLight
                            : AppColors.roseSoft,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    isOpened
                        ? 'Opened ♡'
                        : isLocked
                            ? 'Locked 🔒'
                            : 'Tap to unseal ♡',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: isOpened
                          ? const Color(0xFF2E7D32)
                          : isLocked
                              ? AppColors.goldDark
                              : AppColors.roseDark,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
