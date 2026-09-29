class Book {
  final String id;
  final String title;
  final String partnerOne;
  final String partnerTwo;
  final String anniversary;

  Book({
    required this.id,
    required this.title,
    required this.partnerOne,
    required this.partnerTwo,
    required this.anniversary,
  });

  factory Book.fromJson(Map<String, dynamic> json) {
    return Book(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Ivraine — Our Little Space',
      partnerOne: json['partner_one']?.toString() ?? 'Ivan',
      partnerTwo: json['partner_two']?.toString() ?? 'Loraine',
      anniversary: json['anniversary']?.toString() ?? '2026-09-02',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'partner_one': partnerOne,
      'partner_two': partnerTwo,
      'anniversary': anniversary,
    };
  }
}
