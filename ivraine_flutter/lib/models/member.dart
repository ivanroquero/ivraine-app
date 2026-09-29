class MemberPresence {
  final String userId;
  final String bookId;
  final String displayName;
  final String? lastActiveAt;

  MemberPresence({
    required this.userId,
    required this.bookId,
    required this.displayName,
    this.lastActiveAt,
  });

  factory MemberPresence.fromJson(Map<String, dynamic> json) {
    return MemberPresence(
      userId: json['user_id']?.toString() ?? '',
      bookId: json['book_id']?.toString() ?? '',
      displayName: json['display_name']?.toString() ?? 'Love',
      lastActiveAt: json['last_active_at']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'user_id': userId,
      'book_id': bookId,
      'display_name': displayName,
      'last_active_at': lastActiveAt,
    };
  }

  bool get isRecentlyActive {
    if (lastActiveAt == null || lastActiveAt!.isEmpty) return false;
    try {
      final activeTime = DateTime.parse(lastActiveAt!);
      final diff = DateTime.now().toUtc().difference(activeTime.toUtc());
      return diff.inMinutes.abs() < 4;
    } catch (_) {
      return false;
    }
  }

  String get presenceText {
    if (isRecentlyActive) return 'Online now';
    if (lastActiveAt == null) return 'Offline';
    try {
      final activeTime = DateTime.parse(lastActiveAt!);
      final diff = DateTime.now().toUtc().difference(activeTime.toUtc());
      if (diff.inMinutes < 60) {
        return '${diff.inMinutes}m ago';
      } else if (diff.inHours < 24) {
        return '${diff.inHours}h ago';
      } else {
        return '${diff.inDays}d ago';
      }
    } catch (_) {
      return 'Offline';
    }
  }
}
