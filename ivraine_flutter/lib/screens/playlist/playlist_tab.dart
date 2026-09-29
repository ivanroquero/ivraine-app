import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../models/entry.dart';
import '../../widgets/spinning_vinyl.dart';
import 'song_editor_screen.dart';

class PlaylistTab extends StatelessWidget {
  const PlaylistTab({Key? key}) : super(key: key);

  Future<void> _launchSongUrl(BuildContext context, String url) async {
    if (url.isEmpty) return;
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open music provider link.')),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid link or player.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<SpaceProvider>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final songs = provider.getFilteredEntries('song');

    final themeSong = songs.firstWhere(
      (s) => s.location == 'theme-song' || s.chapter == 'Theme Song of the Month',
      orElse: () => songs.firstWhere((s) => s.favorite, orElse: () => songs.isNotEmpty ? songs.first : _dummySong()),
    );

    return RefreshIndicator(
      color: AppColors.rose,
      onRefresh: provider.refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Theme Song Hero with Spinning Vinyl
          if (songs.isNotEmpty)
            _buildThemeSongCard(context, themeSong, isDark),

          const SizedBox(height: 16),

          // Playlist Heading
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Our Playlist (${songs.length})',
                style: TextStyle(
                  fontFamily: AppTheme.serifFont,
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.darkText : AppColors.lightText,
                ),
              ),
              TextButton.icon(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const SongEditorScreen()),
                  );
                },
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Add Song'),
              ),
            ],
          ),
          const SizedBox(height: 8),

          if (songs.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 20),
              alignment: Alignment.center,
              child: Column(
                children: [
                  const Text('♫', style: TextStyle(fontSize: 48, color: AppColors.roseSoft)),
                  const SizedBox(height: 10),
                  Text(
                    'No songs in our playlist yet.',
                    style: TextStyle(
                      fontFamily: AppTheme.serifFont,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Add tracks that remind you of each other and your story.',
                    style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
                  ),
                ],
              ),
            )
          else
            ...songs.asMap().entries.map((entry) {
              return _buildSongCard(context, entry.value, entry.key + 1, isDark);
            }),
        ],
      ),
    );
  }

  static Entry _dummySong() {
    return Entry(
      id: '',
      bookId: '',
      authorId: '',
      kind: 'song',
      title: 'Our Special Song',
      body: 'Add your favorite track here',
      eventDate: '',
      location: '',
      photoPaths: [],
      photoUrls: [],
      chapter: '',
      recurrence: 'none',
      songUrl: '',
      artist: 'Us',
      voiceUrl: '',
      favorite: false,
      completed: false,
      createdAt: '',
      updatedAt: '',
    );
  }

  Widget _buildThemeSongCard(BuildContext context, Entry themeSong, bool isDark) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isDark
              ? [const Color(0xFF2C1D26), const Color(0xFF1E151E)]
              : [const Color(0xFFFFF5F8), const Color(0xFFFBF0F5)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.roseSoft),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const SpinningVinyl(size: 96),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.roseSoft,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    '★ THEME SONG OF THE MONTH',
                    style: TextStyle(
                      fontSize: 8,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1,
                      color: AppColors.roseDark,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  themeSong.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: AppTheme.serifFont,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppColors.darkText : AppColors.lightText,
                  ),
                ),
                Text(
                  themeSong.artist,
                  style: const TextStyle(fontSize: 12, color: AppColors.rose, fontWeight: FontWeight.w600),
                ),
                if (themeSong.body.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    '“${themeSong.body}”',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontStyle: FontStyle.italic,
                      color: AppColors.lightMuted,
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                if (themeSong.songUrl.isNotEmpty)
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.rose,
                      minimumSize: const Size(120, 36),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                    ),
                    onPressed: () => _launchSongUrl(context, themeSong.songUrl),
                    icon: const Icon(Icons.play_arrow_rounded, size: 18),
                    label: const Text('Play Track', style: TextStyle(fontSize: 12)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSongCard(BuildContext context, Entry song, int trackNumber, bool isDark) {
    final provider = Provider.of<SpaceProvider>(context, listen: false);
    final isTheme = song.location == 'theme-song' || song.chapter == 'Theme Song of the Month';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isTheme ? AppColors.rose : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Vinyl disc mini icon
          Container(
            width: 48,
            height: 48,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0xFF1E1B22),
            ),
            child: Center(
              child: Container(
                width: 16,
                height: 16,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.rose,
                ),
                child: Center(
                  child: Text(
                    '$trackNumber',
                    style: const TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        song.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: AppTheme.serifFont,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: isDark ? AppColors.darkText : AppColors.lightText,
                        ),
                      ),
                    ),
                    if (isTheme)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.goldLight,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          '★ Theme Song',
                          style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppColors.goldDark),
                        ),
                      ),
                  ],
                ),
                Text(
                  song.artist,
                  style: const TextStyle(fontSize: 12, color: AppColors.lightMuted),
                ),
                if (song.body.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    song.body,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: AppColors.lightMuted),
                  ),
                ],
              ],
            ),
          ),
          // Actions
          if (song.songUrl.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.play_circle_fill_rounded, color: AppColors.rose, size: 30),
              tooltip: 'Play Song',
              onPressed: () => _launchSongUrl(context, song.songUrl),
            ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert_rounded, size: 20),
            onSelected: (val) {
              if (val == 'theme') {
                provider.setThemeSong(song);
              } else if (val == 'favorite') {
                provider.toggleFavorite(song);
              } else if (val == 'delete') {
                provider.deleteEntry(song.id);
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                value: 'theme',
                child: Text(isTheme ? 'Current Theme' : '★ Set as Theme Song'),
              ),
              PopupMenuItem(
                value: 'favorite',
                child: Text(song.favorite ? 'Unfavorite' : '♡ Add to Favorites'),
              ),
              const PopupMenuItem(
                value: 'delete',
                child: Text('Delete Song', style: TextStyle(color: AppColors.roseAccent)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
