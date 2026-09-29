import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../providers/space_provider.dart';
import '../providers/theme_provider.dart';
import '../widgets/presence_badge.dart';
import '../widgets/heart_tap_dialog.dart';
import 'story/story_tab.dart';
import 'story/entry_editor_screen.dart';
import 'letters/letters_tab.dart';
import 'letters/letter_editor_screen.dart';
import 'gallery/gallery_tab.dart';
import 'calendar/calendar_tab.dart';
import 'calendar/date_editor_screen.dart';
import 'plans/bucket_list_tab.dart';
import 'plans/plan_editor_screen.dart';
import 'playlist/playlist_tab.dart';
import 'playlist/song_editor_screen.dart';
import 'special/monthsary_modal.dart';
import 'special/mystery_date_modal.dart';
import 'settings/settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  final List<String> _tabTitles = [
    'OUR STORY',
    'LETTERS',
    'GALLERY',
    'CALENDAR',
    'BUCKET LIST',
    'PLAYLIST',
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<SpaceProvider>(context, listen: false).loadSpace();
    });
  }

  void _onFabPressed() {
    switch (_currentIndex) {
      case 0:
        Navigator.push(context, MaterialPageRoute(builder: (_) => const EntryEditorScreen()));
        break;
      case 1:
        Navigator.push(context, MaterialPageRoute(builder: (_) => const LetterEditorScreen()));
        break;
      case 2:
        Navigator.push(context, MaterialPageRoute(builder: (_) => const EntryEditorScreen()));
        break;
      case 3:
        Navigator.push(context, MaterialPageRoute(builder: (_) => const DateEditorScreen()));
        break;
      case 4:
        Navigator.push(context, MaterialPageRoute(builder: (_) => const PlanEditorScreen()));
        break;
      case 5:
        Navigator.push(context, MaterialPageRoute(builder: (_) => const SongEditorScreen()));
        break;
    }
  }

  String get _fabTooltip {
    switch (_currentIndex) {
      case 0:
        return 'Add Memory';
      case 1:
        return 'Write Letter';
      case 2:
        return 'Add Memory';
      case 3:
        return 'Add Milestone';
      case 4:
        return 'Add Dream';
      case 5:
        return 'Add Track';
      default:
        return 'Add';
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<SpaceProvider>(context);
    final themeProvider = Provider.of<ThemeProvider>(context);
    final isDark = themeProvider.isDarkMode;

    final tabs = const [
      StoryTab(),
      LettersTab(),
      GalleryTab(),
      CalendarTab(),
      BucketListTab(),
      PlaylistTab(),
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                RichText(
                  text: const TextSpan(
                    style: TextStyle(
                      fontFamily: AppTheme.serifFont,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      letterSpacing: -0.5,
                      color: AppColors.rose,
                    ),
                    children: [
                      TextSpan(text: 'ivraine'),
                      TextSpan(text: ' ♡', style: TextStyle(color: AppColors.roseAccent)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '/ ${_tabTitles[_currentIndex]}',
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1,
                    color: AppColors.lightMuted,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          // Partner live presence badge
          PresenceBadge(
            partner: provider.info?.partner,
            onTap: () => HeartTapDialog.show(context),
          ),
          const SizedBox(width: 4),

          // Heart Tap Button ("I Miss You" Touch)
          IconButton(
            icon: const Text('♥', style: TextStyle(fontSize: 20, color: AppColors.roseAccent)),
            tooltip: '“I Miss You” Touch',
            onPressed: () => HeartTapDialog.show(context),
          ),

          // Mystery Date button
          IconButton(
            icon: const Icon(Icons.auto_awesome_rounded, color: AppColors.gold, size: 20),
            tooltip: 'Mystery Date & Location',
            onPressed: () => MysteryDateModal.show(context),
          ),

          // Theme Mode Toggle
          IconButton(
            icon: Text(
              isDark ? '☀' : '☾',
              style: const TextStyle(fontSize: 16),
            ),
            tooltip: isDark ? 'Switch to light mode' : 'Switch to dark mode',
            onPressed: () => themeProvider.toggleTheme(),
          ),

          // Settings Avatar
          IconButton(
            icon: CircleAvatar(
              radius: 14,
              backgroundColor: AppColors.roseSoft,
              child: Text(
                provider.info?.member.displayName.isNotEmpty == true
                    ? provider.info!.member.displayName.substring(0, 1).toUpperCase()
                    : '♡',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.roseDark),
              ),
            ),
            tooltip: 'Settings & Keepsakes',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              );
            },
          ),
          const SizedBox(width: 8),
        ],
      ),

      body: Stack(
        children: [
          IndexedStack(
            index: _currentIndex,
            children: tabs,
          ),

          // Floating Monthsary Celebration Pill
          Positioned(
            bottom: 16,
            left: 16,
            child: GestureDetector(
              onTap: () => MonthsaryModal.show(context),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFE91E63), Color(0xFFC2185B)],
                  ),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFE91E63).withOpacity(0.4),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('💌', style: TextStyle(fontSize: 15)),
                    SizedBox(width: 6),
                    Text(
                      'Open This ♡',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),

      floatingActionButton: FloatingActionButton(
        backgroundColor: AppColors.rose,
        foregroundColor: Colors.white,
        tooltip: _fabTooltip,
        onPressed: _onFabPressed,
        child: const Icon(Icons.add_rounded, size: 28),
      ),

      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (idx) => setState(() => _currentIndex = idx),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.book_outlined),
            activeIcon: Icon(Icons.menu_book_rounded),
            label: 'Story',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.mail_outline_rounded),
            activeIcon: Icon(Icons.mark_email_read_rounded),
            label: 'Letters',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.photo_library_outlined),
            activeIcon: Icon(Icons.photo_library_rounded),
            label: 'Gallery',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.calendar_month_outlined),
            activeIcon: Icon(Icons.calendar_month_rounded),
            label: 'Calendar',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.star_border_rounded),
            activeIcon: Icon(Icons.star_rounded),
            label: 'Bucket List',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.music_note_outlined),
            activeIcon: Icon(Icons.music_note_rounded),
            label: 'Playlist',
          ),
        ],
      ),
    );
  }
}
