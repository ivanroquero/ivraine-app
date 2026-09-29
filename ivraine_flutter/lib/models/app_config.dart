class AppConfig {
  final String proposalVisibility;
  final String defaultEntry;
  final MonthsaryConfig monthsary;

  AppConfig({
    required this.proposalVisibility,
    required this.defaultEntry,
    required this.monthsary,
  });

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    return AppConfig(
      proposalVisibility: json['proposalVisibility']?.toString() ?? 'visible',
      defaultEntry: json['defaultEntry']?.toString() ?? 'scrapbook',
      monthsary: MonthsaryConfig.fromJson(
        json['monthsary'] as Map<String, dynamic>? ?? {},
      ),
    );
  }
}

class MonthsaryConfig {
  final bool enabled;
  final String letterTitle;
  final String letterGreeting;
  final String letterBody;
  final String letterSignoff;
  final List<String> vows;

  MonthsaryConfig({
    required this.enabled,
    required this.letterTitle,
    required this.letterGreeting,
    required this.letterBody,
    required this.letterSignoff,
    required this.vows,
  });

  factory MonthsaryConfig.fromJson(Map<String, dynamic> json) {
    List<String> parseVows(dynamic val) {
      if (val is List) {
        return val.map((v) => v?.toString() ?? '').where((s) => s.isNotEmpty).toList();
      }
      return [
        'Promise to always make you smile even on the hardest days.',
        'Promise to listen to your stories with my whole heart.',
        'Promise to choose you and only you, today and for all our tomorrows.'
      ];
    }

    return MonthsaryConfig(
      enabled: json['enabled'] != false,
      letterTitle: json['letterTitle']?.toString() ?? 'Happy 1st Monthsary, My Love ♡',
      letterGreeting: json['letterGreeting']?.toString() ?? 'Dearest Loraine,',
      letterBody: json['letterBody']?.toString() ??
          'Happy 1st Monthsary, my beautiful love! Every single moment with you has felt like a dream I never want to wake up from. Thank you for your warmth, your pure heart, your gentle patience, and for loving me the way you do.',
      letterSignoff: json['letterSignoff']?.toString() ?? 'Forever & Always Yours,\nIvan ♡',
      vows: parseVows(json['vows']),
    );
  }
}

class QuizAnswerSubmission {
  final String id;
  final String user;
  final String timestamp;
  final List<Map<String, dynamic>> answers;
  final String summary;

  QuizAnswerSubmission({
    required this.id,
    required this.user,
    required this.timestamp,
    required this.answers,
    required this.summary,
  });

  factory QuizAnswerSubmission.fromJson(Map<String, dynamic> json) {
    return QuizAnswerSubmission(
      id: json['id']?.toString() ?? '',
      user: json['user']?.toString() ?? 'Loraine',
      timestamp: json['timestamp']?.toString() ?? '',
      answers: (json['answers'] as List? ?? []).map((a) => a as Map<String, dynamic>).toList(),
      summary: json['summary']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user': user,
      'timestamp': timestamp,
      'answers': answers,
      'summary': summary,
    };
  }
}
