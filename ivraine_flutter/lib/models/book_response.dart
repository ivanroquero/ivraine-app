import 'book.dart';
import 'member.dart';

class BookResponse {
  final Book book;
  final MemberPresence member;
  final MemberPresence? partner;
  final String userId;

  BookResponse({
    required this.book,
    required this.member,
    this.partner,
    required this.userId,
  });

  factory BookResponse.fromJson(Map<String, dynamic> json) {
    return BookResponse(
      book: Book.fromJson(json['book'] as Map<String, dynamic>? ?? {}),
      member: MemberPresence.fromJson(json['member'] as Map<String, dynamic>? ?? {}),
      partner: json['partner'] != null
          ? MemberPresence.fromJson(json['partner'] as Map<String, dynamic>)
          : null,
      userId: json['userId']?.toString() ?? '',
    );
  }
}
