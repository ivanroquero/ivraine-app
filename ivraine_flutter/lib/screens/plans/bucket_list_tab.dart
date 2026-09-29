import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../models/entry.dart';
import '../../widgets/confetti_overlay.dart';
import '../story/entry_editor_screen.dart';
import 'plan_editor_screen.dart';

class BucketListTab extends StatelessWidget {
  const BucketListTab({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<SpaceProvider>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final dreams = provider.getFilteredEntries('plan');

    final completedCount = dreams.where((d) => d.completed).length;
    final totalCount = dreams.length;
    final progress = totalCount > 0 ? completedCount / totalCount : 0.0;

    return RefreshIndicator(
      color: AppColors.rose,
      onRefresh: provider.refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header & Progress Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: isDark
                    ? [const Color(0xFF2E2433), const Color(0xFF201824)]
                    : [const Color(0xFFFCF6F8), const Color(0xFFF7EFF3)],
              ),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.roseSoft),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'SOMEDAY, WITH YOU',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2,
                    color: AppColors.rose,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Our Shared Bucket List',
                  style: TextStyle(
                    fontFamily: AppTheme.serifFont,
                    fontSize: 24,
                    color: isDark ? AppColors.darkText : AppColors.lightText,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Little adventures and big dreams we want to experience side by side.',
                  style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '$completedCount of $totalCount dreams checked off',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.rose),
                    ),
                    Text(
                      '${(progress * 100).toInt()}%',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.lightMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    backgroundColor: isDark ? AppColors.darkElevated : AppColors.lightBorder,
                    valueColor: const AlwaysStoppedAnimation<Color>(AppColors.roseAccent),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          if (dreams.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 20),
              alignment: Alignment.center,
              child: Column(
                children: [
                  const Text('✧', style: TextStyle(fontSize: 48, color: AppColors.roseSoft)),
                  const SizedBox(height: 10),
                  Text(
                    'No dreams added yet.',
                    style: TextStyle(
                      fontFamily: AppTheme.serifFont,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Add places to travel, dates to go on, or milestones to chase together.',
                    style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            )
          else
            ...dreams.map((d) => _buildPlanCard(context, d, isDark)),
        ],
      ),
    );
  }

  Widget _buildPlanCard(BuildContext context, Entry dream, bool isDark) {
    final provider = Provider.of<SpaceProvider>(context, listen: false);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: dream.completed
            ? (isDark ? const Color(0xFF1E2822) : const Color(0xFFF2F8F4))
            : (isDark ? AppColors.darkSurface : AppColors.lightSurface),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: dream.completed
              ? (isDark ? const Color(0xFF2A4834) : const Color(0xFFCBE3D2))
              : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Complete Checkbox Button
              InkWell(
                onTap: () {
                  final willBeComplete = !dream.completed;
                  provider.toggleCompleted(dream);
                  if (willBeComplete) {
                    ConfettiOverlay.show(context);
                  }
                },
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: dream.completed
                        ? const Color(0xFF4ADE80)
                        : (isDark ? AppColors.darkElevated : AppColors.lightBg),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: dream.completed ? const Color(0xFF22C55E) : AppColors.lightBorder,
                    ),
                  ),
                  child: Icon(
                    dream.completed ? Icons.check_rounded : null,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: dream.completed
                            ? const Color(0xFFDCFCE7)
                            : AppColors.roseSoft,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        dream.completed ? 'WE DID IT ♡' : 'SOMEDAY WITH YOU',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.8,
                          color: dream.completed ? const Color(0xFF15803D) : AppColors.roseDark,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      dream.title,
                      style: TextStyle(
                        fontFamily: AppTheme.serifFont,
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        decoration: dream.completed ? TextDecoration.lineThrough : null,
                        color: isDark ? AppColors.darkText : AppColors.lightText,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: Icon(
                  dream.favorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                  color: dream.favorite ? AppColors.roseAccent : AppColors.lightMuted,
                  size: 20,
                ),
                onPressed: () => provider.toggleFavorite(dream),
              ),
            ],
          ),

          if (dream.body.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              dream.body,
              style: TextStyle(fontSize: 13, color: isDark ? AppColors.darkMuted : AppColors.lightMuted),
            ),
          ],

          if (dream.location.isNotEmpty || dream.eventDate.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                if (dream.eventDate.isNotEmpty) ...[
                  const Icon(Icons.calendar_today_rounded, size: 12, color: AppColors.lightMuted),
                  const SizedBox(width: 4),
                  Text(dream.eventDate, style: const TextStyle(fontSize: 11, color: AppColors.lightMuted)),
                  const SizedBox(width: 12),
                ],
                if (dream.location.isNotEmpty) ...[
                  const Icon(Icons.location_on_outlined, size: 12, color: AppColors.lightMuted),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      dream.location,
                      style: const TextStyle(fontSize: 11, color: AppColors.lightMuted),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ],
            ),
          ],

          // If completed, offer to convert to a photo memory
          if (dream.completed) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => EntryEditorScreen(
                      existingEntry: Entry(
                        id: '',
                        bookId: dream.bookId,
                        authorId: dream.authorId,
                        kind: 'memory',
                        title: dream.title,
                        body: 'We made our dream come true: ${dream.body}',
                        eventDate: DateTime.now().toIso8601String().substring(0, 10),
                        location: dream.location,
                        photoPaths: [],
                        photoUrls: [],
                        chapter: 'Bucket List Fulfilled',
                        recurrence: 'none',
                        songUrl: '',
                        artist: '',
                        voiceUrl: '',
                        favorite: true,
                        completed: false,
                        createdAt: '',
                        updatedAt: '',
                      ),
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.camera_alt_outlined, size: 16),
              label: const Text('Make this a photo memory +', style: TextStyle(fontSize: 12)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFF22C55E)),
                foregroundColor: const Color(0xFF15803D),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
