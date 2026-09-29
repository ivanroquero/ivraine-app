import 'dart:convert';

typedef EntryKind = String; // 'memory' | 'note' | 'plan' | 'date' | 'song' | 'voice'

class Entry {
  final String id;
  final String bookId;
  final String authorId;
  final EntryKind kind;
  final String title;
  final String body;
  final String eventDate;
  final String location;
  final List<String> photoPaths;
  final List<String?> photoUrls;
  final String chapter;
  final String recurrence; // 'none' | 'monthly' | 'yearly'
  final String songUrl;
  final String artist;
  final String voiceUrl;
  final bool favorite;
  final bool completed;
  final String createdAt;
  final String updatedAt;

  Entry({
    required this.id,
    required this.bookId,
    required this.authorId,
    required this.kind,
    required this.title,
    required this.body,
    required this.eventDate,
    required this.location,
    required this.photoPaths,
    required this.photoUrls,
    required this.chapter,
    required this.recurrence,
    required this.songUrl,
    required this.artist,
    required this.voiceUrl,
    required this.favorite,
    required this.completed,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Entry.fromJson(Map<String, dynamic> json) {
    List<String> parseStringList(dynamic val) {
      if (val is List) {
        return val.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty).toList();
      }
      return [];
    }

    List<String?> parseNullableStringList(dynamic val) {
      if (val is List) {
        return val.map((e) => e?.toString()).toList();
      }
      return [];
    }

    return Entry(
      id: json['id']?.toString() ?? '',
      bookId: json['book_id']?.toString() ?? '',
      authorId: json['author_id']?.toString() ?? '',
      kind: json['kind']?.toString() ?? 'memory',
      title: json['title']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      eventDate: json['event_date']?.toString() ?? '',
      location: json['location']?.toString() ?? '',
      photoPaths: parseStringList(json['photo_paths']),
      photoUrls: parseNullableStringList(json['photo_urls']),
      chapter: json['chapter']?.toString() ?? 'Uncategorized',
      recurrence: json['recurrence']?.toString() ?? 'none',
      songUrl: json['song_url']?.toString() ?? '',
      artist: json['artist']?.toString() ?? '',
      voiceUrl: json['voice_url']?.toString() ?? '',
      favorite: json['favorite'] == true,
      completed: json['completed'] == true,
      createdAt: json['created_at']?.toString() ?? '',
      updatedAt: json['updated_at']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'book_id': bookId,
      'author_id': authorId,
      'kind': kind,
      'title': title,
      'body': body,
      'event_date': eventDate,
      'location': location,
      'photo_paths': photoPaths,
      'chapter': chapter,
      'recurrence': recurrence,
      'song_url': songUrl,
      'artist': artist,
      'voice_url': voiceUrl,
      'favorite': favorite,
      'completed': completed,
      'created_at': createdAt,
      'updated_at': updatedAt,
    };
  }

  Entry copyWith({
    String? id,
    String? bookId,
    String? authorId,
    EntryKind? kind,
    String? title,
    String? body,
    String? eventDate,
    String? location,
    List<String>? photoPaths,
    List<String?>? photoUrls,
    String? chapter,
    String? recurrence,
    String? songUrl,
    String? artist,
    String? voiceUrl,
    bool? favorite,
    bool? completed,
    String? createdAt,
    String? updatedAt,
  }) {
    return Entry(
      id: id ?? this.id,
      bookId: bookId ?? this.bookId,
      authorId: authorId ?? this.authorId,
      kind: kind ?? this.kind,
      title: title ?? this.title,
      body: body ?? this.body,
      eventDate: eventDate ?? this.eventDate,
      location: location ?? this.location,
      photoPaths: photoPaths ?? this.photoPaths,
      photoUrls: photoUrls ?? this.photoUrls,
      chapter: chapter ?? this.chapter,
      recurrence: recurrence ?? this.recurrence,
      songUrl: songUrl ?? this.songUrl,
      artist: artist ?? this.artist,
      voiceUrl: voiceUrl ?? this.voiceUrl,
      favorite: favorite ?? this.favorite,
      completed: completed ?? this.completed,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  // --- Helper getters for Letters ---
  Map<String, dynamic> get letterMeta {
    if (location.startsWith('{') && location.endsWith('}')) {
      try {
        return jsonDecode(location) as Map<String, dynamic>;
      } catch (_) {}
    }
    return {};
  }

  String? get lockUntil => letterMeta['lockUntil'] as String?;
  String? get openedBy => letterMeta['openedBy'] as String?;
  String? get openedAt => letterMeta['openedAt'] as String?;

  bool get isLocked {
    if (completed) return false;
    final until = lockUntil;
    if (until == null || until.isEmpty) return false;
    final nowStr = DateTime.now().toUtc().toIso8601String().substring(0, 10);
    return until.compareTo(nowStr) > 0;
  }
}
