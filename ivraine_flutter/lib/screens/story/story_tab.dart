import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../models/entry.dart';
import '../../widgets/voice_note_player.dart';
import '../gallery/photo_lightbox_screen.dart';
import 'entry_editor_screen.dart';

class StoryTab extends StatelessWidget {
  const StoryTab({Key? key}) : super(key: key);

  int _calculateDaysTogether(String? anniversaryStr) {
    if (anniversaryStr == null || anniversaryStr.isEmpty) return 0;
    try {
      final start = DateTime.parse(anniversaryStr).toUtc();
      final now = DateTime.now().toUtc();
      return now.difference(start).inDays.abs();
    } catch (_) {
      return 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<SpaceProvider>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final info = provider.info;
    final entries = provider.getFilteredEntries('story');

    // Sort chronologically or by event date
    entries.sort((a, b) => b.eventDate.compareTo(a.eventDate));

    final anniversary = info?.book.anniversary ?? '2026-09-02';
    final daysCount = _calculateDaysTogether(anniversary);
    final partner1 = info?.book.partnerOne ?? 'Ivan';
    final partner2 = info?.book.partnerTwo ?? 'Loraine';

    return RefreshIndicator(
      color: AppColors.rose,
      onRefresh: provider.refresh,
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        children: [
          // Romantic Hero Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: isDark
                    ? [const Color(0xFF2A2030), const Color(0xFF201A26)]
                    : [const Color(0xFFF7ECED), const Color(0xFFEBEFF7)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$partner1 & $partner2',
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 2,
                              color: AppColors.rose,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Our favorite\nkind of forever.',
                            style: TextStyle(
                              fontFamily: AppTheme.serifFont,
                              fontSize: 26,
                              height: 1.15,
                              color: isDark ? AppColors.darkText : AppColors.lightText,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Collecting the little things that make us, us.',
                            style: TextStyle(fontSize: 11, color: AppColors.lightMuted),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    // Polaroid Photo
                    Transform.rotate(
                      angle: 0.08,
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.12),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Column(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: Image.asset(
                                'assets/icons/couple-512.png',
                                width: 75,
                                height: 75,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Container(
                                  width: 75,
                                  height: 75,
                                  color: AppColors.roseSoft,
                                  child: const Center(child: Text('♡', style: TextStyle(color: AppColors.rose))),
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'my favorite person. ♡',
                              style: TextStyle(
                                fontFamily: AppTheme.serifFont,
                                fontStyle: FontStyle.italic,
                                fontSize: 8,
                                color: AppColors.roseDark,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const Divider(height: 1),
                const SizedBox(height: 14),
                // Stats Row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildHeroStat('$daysCount', 'days together'),
                    Container(height: 24, width: 1, color: AppColors.lightBorder),
                    _buildHeroStat('${provider.entries.where((e) => e.kind == 'memory').length}', 'memories kept'),
                    Container(height: 24, width: 1, color: AppColors.lightBorder),
                    _buildHeroStat('∞', 'more to come'),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Filters Bar
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 40,
                  child: TextField(
                    onChanged: provider.setSearchQuery,
                    decoration: InputDecoration(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                      hintText: 'Search our story...',
                      prefixIcon: const Icon(Icons.search, size: 18),
                      suffixIcon: provider.searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, size: 16),
                              onPressed: () => provider.setSearchQuery(''),
                            )
                          : null,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilterChip(
                selected: provider.favoritesOnly,
                label: const Text('♡ Favorites', style: TextStyle(fontSize: 12)),
                onSelected: provider.setFavoritesOnly,
                selectedColor: AppColors.roseSoft,
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Timeline entries
          if (entries.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
              alignment: Alignment.center,
              child: Column(
                children: [
                  const Text('♡', style: TextStyle(fontSize: 48, color: AppColors.roseSoft)),
                  const SizedBox(height: 8),
                  Text(
                    provider.searchQuery.isNotEmpty || provider.favoritesOnly
                        ? 'No memories match your filter.'
                        : 'A new chapter starts here.',
                    style: TextStyle(
                      fontFamily: AppTheme.serifFont,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Tap the + button below to create our first memory together.',
                    style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            )
          else
            ...entries.map((e) => _buildTimelineCard(context, e, isDark)),
        ],
      ),
    );
  }

  Widget _buildHeroStat(String value, String label) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontFamily: AppTheme.serifFont,
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: AppColors.rose,
          ),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: AppColors.lightMuted),
        ),
      ],
    );
  }

  Widget _buildTimelineCard(BuildContext context, Entry e, bool isDark) {
    final provider = Provider.of<SpaceProvider>(context, listen: false);

    DateTime? parsedDate;
    try {
      parsedDate = DateTime.parse(e.eventDate);
    } catch (_) {}

    final dateStr = parsedDate != null
        ? DateFormat('MMM d, yyyy').format(parsedDate)
        : e.eventDate;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Photos carousel / single photo
          if (e.photoUrls.isNotEmpty && e.photoUrls.first != null)
            GestureDetector(
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => PhotoLightboxScreen(
                      photoUrls: e.photoUrls.whereType<String>().toList(),
                      title: e.title,
                      date: dateStr,
                    ),
                  ),
                );
              },
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
                child: Stack(
                  children: [
                    CachedNetworkImage(
                      imageUrl: e.photoUrls.first!,
                      height: 220,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      placeholder: (_, __) => Container(
                        height: 220,
                        color: AppColors.roseSoft.withOpacity(0.3),
                        child: const Center(child: CircularProgressIndicator(color: AppColors.rose)),
                      ),
                      errorWidget: (_, __, ___) => Container(
                        height: 220,
                        color: AppColors.roseSoft.withOpacity(0.3),
                        child: const Icon(Icons.broken_image_rounded, color: AppColors.lightMuted),
                      ),
                    ),
                    if (e.photoUrls.length > 1)
                      Positioned(
                        bottom: 10,
                        right: 10,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.65),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            '+${e.photoUrls.length - 1} photos',
                            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Chapter & Date badge
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.roseSoft,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        e.chapter.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          color: AppColors.roseDark,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ),
                    Text(
                      dateStr,
                      style: const TextStyle(fontSize: 11, color: AppColors.lightMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  e.title,
                  style: TextStyle(
                    fontFamily: AppTheme.serifFont,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkText : AppColors.lightText,
                  ),
                ),
                if (e.body.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    e.body,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.5,
                      color: isDark ? AppColors.darkText.withOpacity(0.85) : AppColors.lightText.withOpacity(0.85),
                    ),
                  ),
                ],
                if (e.voiceUrl.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  VoiceNotePlayer(audioUrl: e.voiceUrl, title: 'Voice Memo Keepsake'),
                ],
                if (e.location.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.location_on_outlined, size: 14, color: AppColors.rose),
                      const SizedBox(width: 4),
                      Text(
                        e.location,
                        style: const TextStyle(fontSize: 11, color: AppColors.lightMuted),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 12),
                const Divider(height: 1),
                const SizedBox(height: 8),
                // Actions: Favorite, Edit, Delete
                Row(
                  children: [
                    IconButton(
                      icon: Icon(
                        e.favorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                        color: e.favorite ? AppColors.roseAccent : AppColors.lightMuted,
                        size: 20,
                      ),
                      onPressed: () => provider.toggleFavorite(e),
                      tooltip: e.favorite ? 'Unfavorite' : 'Favorite',
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => EntryEditorScreen(existingEntry: e),
                          ),
                        );
                      },
                      child: const Text('Edit', style: TextStyle(fontSize: 12)),
                    ),
                    TextButton(
                      onPressed: () async {
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text('Delete memory?'),
                            content: const Text('This will delete this keepsake for both of you.'),
                            actions: [
                              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(backgroundColor: AppColors.roseAccent),
                                onPressed: () => Navigator.pop(ctx, true),
                                child: const Text('Delete'),
                              ),
                            ],
                          ),
                        );
                        if (confirm == true) {
                          provider.deleteEntry(e.id);
                        }
                      },
                      child: const Text('Delete', style: TextStyle(fontSize: 12, color: AppColors.roseAccent)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
