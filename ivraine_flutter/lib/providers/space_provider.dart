import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import '../services/api_service.dart';
import '../models/entry.dart';
import '../models/book_response.dart';
import '../models/app_config.dart';

class SpaceProvider extends ChangeNotifier {
  final ApiService _apiService;

  BookResponse? _info;
  List<Entry> _entries = [];
  bool _isLoading = false;
  bool _isLoadingMore = false;
  int? _nextOffset;
  String? _errorMessage;

  // Filters
  String _searchQuery = '';
  String _chapterFilter = '';
  String _periodFilter = '';
  bool _favoritesOnly = false;
  String _galleryViewMode = 'grid'; // 'grid' | 'map'

  // Calendar
  DateTime _calendarMonth = DateTime.utc(DateTime.now().year, DateTime.now().month, 1);
  String _selectedDate = DateTime.now().toUtc().toIso8601String().substring(0, 10);

  // App Config
  AppConfig? _appConfig;

  // Heartbeat Timer
  Timer? _heartbeatTimer;

  SpaceProvider(this._apiService);

  BookResponse? get info => _info;
  List<Entry> get entries => _entries;
  bool get isLoading => _isLoading;
  bool get isLoadingMore => _isLoadingMore;
  String? get errorMessage => _errorMessage;

  String get searchQuery => _searchQuery;
  String get chapterFilter => _chapterFilter;
  String get periodFilter => _periodFilter;
  bool get favoritesOnly => _favoritesOnly;
  String get galleryViewMode => _galleryViewMode;

  DateTime get calendarMonth => _calendarMonth;
  String get selectedDate => _selectedDate;
  AppConfig? get appConfig => _appConfig;

  // Filtered entries according to tab kind and active filters
  List<Entry> getFilteredEntries(String kind) {
    return _entries.where((e) {
      if (kind == 'story') {
        if (e.kind != 'memory' && e.kind != 'voice') return false;
      } else if (kind == 'gallery') {
        if (e.kind != 'memory' || e.photoPaths.isEmpty) return false;
      } else {
        if (e.kind != kind) return false;
      }

      if (_favoritesOnly && !e.favorite) return false;
      if (_chapterFilter.isNotEmpty && e.chapter != _chapterFilter) return false;

      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        final match = e.title.toLowerCase().contains(query) ||
            e.body.toLowerCase().contains(query) ||
            e.location.toLowerCase().contains(query) ||
            e.artist.toLowerCase().contains(query);
        if (!match) return false;
      }

      return true;
    }).toList();
  }

  List<String> get availableChapters {
    final chapters = _entries
        .where((e) => e.kind == 'memory' && e.chapter.isNotEmpty)
        .map((e) => e.chapter)
        .toSet()
        .toList();
    chapters.sort();
    return chapters;
  }

  void setSearchQuery(String q) {
    _searchQuery = q;
    notifyListeners();
  }

  void setChapterFilter(String c) {
    _chapterFilter = c;
    notifyListeners();
  }

  void setFavoritesOnly(bool fav) {
    _favoritesOnly = fav;
    notifyListeners();
  }

  void setGalleryViewMode(String mode) {
    _galleryViewMode = mode;
    notifyListeners();
  }

  void setSelectedDate(String date) {
    _selectedDate = date;
    notifyListeners();
  }

  void setCalendarMonth(DateTime month) {
    _calendarMonth = month;
    notifyListeners();
  }

  void clearFilters() {
    _searchQuery = '';
    _chapterFilter = '';
    _periodFilter = '';
    _favoritesOnly = false;
    notifyListeners();
  }

  // --- Initial Load & Polling ---

  Future<void> loadSpace() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final bookResp = await _apiService.getBook();
      _info = bookResp;

      final res = await _apiService.getEntries(offset: 0);
      _entries = res['entries'] as List<Entry>;
      _nextOffset = res['nextOffset'] as int?;

      try {
        _appConfig = await _apiService.getAppConfig();
      } catch (_) {}

      _startHeartbeat();
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    try {
      final bookResp = await _apiService.getBook();
      _info = bookResp;

      final res = await _apiService.getEntries(offset: 0);
      _entries = res['entries'] as List<Entry>;
      _nextOffset = res['nextOffset'] as int?;

      try {
        _appConfig = await _apiService.getAppConfig();
      } catch (_) {}

      notifyListeners();
    } catch (_) {}
  }

  Future<void> loadMore() async {
    if (_nextOffset == null || _isLoadingMore) return;
    _isLoadingMore = true;
    notifyListeners();

    try {
      final res = await _apiService.getEntries(offset: _nextOffset!);
      final more = res['entries'] as List<Entry>;
      _entries.addAll(more);
      _nextOffset = res['nextOffset'] as int?;
    } catch (_) {}

    _isLoadingMore = false;
    notifyListeners();
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 60), (_) async {
      try {
        await _apiService.sendHeartbeat();
        final refreshed = await _apiService.getBook();
        _info = refreshed;
        notifyListeners();
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _heartbeatTimer?.cancel();
    super.dispose();
  }

  // --- Entry CRUD ---

  Future<bool> addEntry(Map<String, dynamic> data) async {
    try {
      final created = await _apiService.createEntry(data);
      _entries.insert(0, created);
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateEntry(String id, String updatedAt, Map<String, dynamic> patch) async {
    try {
      final updated = await _apiService.updateEntry(id, updatedAt, patch);
      final idx = _entries.indexWhere((e) => e.id == id);
      if (idx != -1) {
        _entries[idx] = updated;
        notifyListeners();
      }
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteEntry(String id) async {
    try {
      final success = await _apiService.deleteEntry(id);
      if (success) {
        _entries.removeWhere((e) => e.id == id);
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> toggleFavorite(Entry entry) async {
    final nextFav = !entry.favorite;
    final success = await updateEntry(entry.id, entry.updatedAt, {'favorite': nextFav});
    if (success) {
      _apiService.trackActivity(
        section: 'Private Space',
        action: nextFav ? 'Favorited Entry ♡' : 'Unfavorited Entry',
        details: entry.title,
        user: _info?.member.displayName ?? 'User',
      );
    }
  }

  Future<void> toggleCompleted(Entry entry) async {
    final nextComp = !entry.completed;
    final success = await updateEntry(entry.id, entry.updatedAt, {'completed': nextComp});
    if (success && nextComp) {
      _apiService.trackActivity(
        section: 'Private Space',
        action: 'Completed Bucket List Dream ✨',
        details: entry.title,
        user: _info?.member.displayName ?? 'User',
      );
    }
  }

  Future<void> unsealLetter(Entry letter) async {
    if (letter.completed) return;
    final userName = _info?.member.displayName ?? 'Partner';
    final nowStr = DateTime.now().toUtc().toIso8601String().substring(0, 10);
    final meta = Map<String, dynamic>.from(letter.letterMeta);
    meta['openedBy'] = userName;
    meta['openedAt'] = nowStr;

    final locStr = '{"openedBy":"$userName","openedAt":"$nowStr"}';
    await updateEntry(letter.id, letter.updatedAt, {
      'completed': true,
      'location': locStr,
    });

    _apiService.trackActivity(
      section: 'Private Space',
      action: 'Unsealed Open When Letter ✉️',
      details: letter.title,
      user: userName,
    );
  }

  Future<void> setThemeSong(Entry song) async {
    await updateEntry(song.id, song.updatedAt, {
      'location': 'theme-song',
      'chapter': 'Theme Song of the Month',
    });
  }

  Future<String> uploadPhoto(Uint8List bytes, String filename) async {
    return await _apiService.uploadPhoto(bytes, filename);
  }

  Future<Map<String, String>> uploadVoice(Uint8List bytes, String filename) async {
    return await _apiService.uploadVoice(bytes, filename);
  }

  Future<void> sendHeartTouch(String note) async {
    final userName = _info?.member.displayName ?? 'User';
    await _apiService.trackActivity(
      section: 'Private Space',
      action: 'Sent a Heart Touch ♡',
      details: note.isEmpty ? 'Thinking of you!' : note,
      user: userName,
    );
  }
}
