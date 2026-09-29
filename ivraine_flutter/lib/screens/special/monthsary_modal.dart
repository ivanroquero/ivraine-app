import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/confetti_overlay.dart';

class MonthsaryModal extends StatefulWidget {
  const MonthsaryModal({Key? key}) : super(key: key);

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const MonthsaryModal(),
    );
  }

  @override
  State<MonthsaryModal> createState() => _MonthsaryModalState();
}

class _MonthsaryModalState extends State<MonthsaryModal> {
  int _currentTab = 0; // 0 = Letter, 1 = Vows, 2 = Love Quiz

  // Quiz state
  final Map<int, String> _selectedAnswers = {};
  bool _submitted = false;

  final List<Map<String, dynamic>> _questions = [
    {
      'id': 1,
      'question': 'What was our sweetest memory together this month?',
      'options': [
        {'key': 'A', 'text': 'Our late night conversations that lasted for hours'},
        {'key': 'B', 'text': 'Laughing together over silly jokes'},
        {'key': 'C', 'text': 'Holding hands and walking quietly together'},
        {'key': 'D', 'text': 'Every single second with you ♡'},
      ],
    },
    {
      'id': 2,
      'question': 'What are you most excited for in our future?',
      'options': [
        {'key': 'A', 'text': 'Going on all our bucket list travels'},
        {'key': 'B', 'text': 'Cooking and eating good food together'},
        {'key': 'C', 'text': 'Building our quiet forever home'},
        {'key': 'D', 'text': 'All of the above and more ✨'},
      ],
    },
  ];

  Future<void> _submitQuiz() async {
    if (_selectedAnswers.length < _questions.length) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please answer all questions ♡')),
      );
      return;
    }

    final provider = Provider.of<SpaceProvider>(context, listen: false);
    final user = provider.info?.member.displayName ?? 'Loraine';

    final answersList = _selectedAnswers.entries.map((e) {
      return {
        'questionId': e.key,
        'selectedKey': e.value,
      };
    }).toList();

    try {
      final apiService = ApiService();
      await apiService.submitMonthsaryAnswers(
        answers: answersList,
        user: user,
      );
    } catch (_) {}

    ConfettiOverlay.show(context);
    setState(() => _submitted = true);
  }

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<SpaceProvider>(context);
    final config = provider.appConfig?.monthsary;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final letterTitle = config?.letterTitle ?? 'Happy 1st Monthsary, My Love ♡';
    final letterGreeting = config?.letterGreeting ?? 'Dearest Loraine,';
    final letterBody = config?.letterBody ??
        'Happy 1st Monthsary, my beautiful love! Every single moment with you has felt like a dream I never want to wake up from. Thank you for your warmth, your pure heart, your gentle patience, and for loving me the way you do.';
    final letterSignoff = config?.letterSignoff ?? 'Forever & Always Yours,\nIvan ♡';
    final vows = config?.vows ?? [
      'Promise to always make you smile even on the hardest days.',
      'Promise to listen to your stories with my whole heart.',
      'Promise to choose you and only you, today and for all our tomorrows.'
    ];

    return Container(
      height: MediaQuery.of(context).size.height * 0.88,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1724) : const Color(0xFFFFF9FB),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'OUR 1ST MONTHSARY ✨',
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 2,
                  color: AppColors.rose,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, size: 22),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Tabs
          Row(
            children: [
              _buildTabButton('💌 Letter', 0),
              const SizedBox(width: 8),
              _buildTabButton('✨ Vows', 1),
              const SizedBox(width: 8),
              _buildTabButton('♥ Quiz', 2),
            ],
          ),
          const SizedBox(height: 16),

          Expanded(
            child: SingleChildScrollView(
              child: _currentTab == 0
                  ? _buildLetterTab(letterTitle, letterGreeting, letterBody, letterSignoff, isDark)
                  : _currentTab == 1
                      ? _buildVowsTab(vows, isDark)
                      : _buildQuizTab(isDark),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(String label, int index) {
    final active = _currentTab == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _currentTab = index),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: active ? AppColors.rose : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: active ? AppColors.rose : AppColors.lightBorder),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              fontWeight: active ? FontWeight.bold : FontWeight.normal,
              color: active ? Colors.white : AppColors.lightMuted,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLetterTab(String title, String greeting, String body, String signoff, bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontFamily: AppTheme.serifFont,
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: isDark ? AppColors.darkText : AppColors.lightText,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          greeting,
          style: const TextStyle(
            fontFamily: AppTheme.serifFont,
            fontSize: 18,
            fontStyle: FontStyle.italic,
            color: AppColors.rose,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          body,
          style: TextStyle(
            fontFamily: AppTheme.serifFont,
            fontSize: 15,
            height: 1.8,
            color: isDark ? AppColors.darkText : const Color(0xFF28222A),
          ),
        ),
        const SizedBox(height: 24),
        Text(
          signoff,
          style: const TextStyle(
            fontFamily: AppTheme.serifFont,
            fontStyle: FontStyle.italic,
            fontSize: 18,
            color: AppColors.rose,
            height: 1.4,
          ),
        ),
        const SizedBox(height: 32),
      ],
    );
  }

  Widget _buildVowsTab(List<String> vows, bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'My Promises To You',
          style: TextStyle(
            fontFamily: AppTheme.serifFont,
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: isDark ? AppColors.darkText : AppColors.lightText,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Little promises I keep in my heart every single day.',
          style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
        ),
        const SizedBox(height: 18),
        ...vows.map((v) => Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkElevated : AppColors.roseSoft.withOpacity(0.5),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.roseSoft),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('💍', style: TextStyle(fontSize: 20)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      v,
                      style: TextStyle(
                        fontFamily: AppTheme.serifFont,
                        fontSize: 15,
                        height: 1.5,
                        color: isDark ? AppColors.darkText : AppColors.lightText,
                      ),
                    ),
                  ),
                ],
              ),
            )),
      ],
    );
  }

  Widget _buildQuizTab(bool isDark) {
    if (_submitted) {
      return Container(
        padding: const EdgeInsets.all(24),
        alignment: Alignment.center,
        child: Column(
          children: [
            const Text('🎉', style: TextStyle(fontSize: 48)),
            const SizedBox(height: 12),
            Text(
              'Answers Saved to Our Story!',
              style: TextStyle(
                fontFamily: AppTheme.serifFont,
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Thank you for answering with your heart. Happy 1st Month, my love! ♡',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppColors.lightMuted),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Our Love Quiz',
          style: TextStyle(
            fontFamily: AppTheme.serifFont,
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: isDark ? AppColors.darkText : AppColors.lightText,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Pick your answers and seal them into our memories.',
          style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
        ),
        const SizedBox(height: 16),
        ..._questions.map((q) {
          final qId = q['id'] as int;
          final options = q['options'] as List;

          return Container(
            margin: const EdgeInsets.only(bottom: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${qId}. ${q['question']}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
                const SizedBox(height: 8),
                ...options.map((opt) {
                  final key = opt['key'] as String;
                  final text = opt['text'] as String;
                  final isSelected = _selectedAnswers[qId] == key;

                  return GestureDetector(
                    onTap: () {
                      setState(() => _selectedAnswers[qId] = key);
                    },
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? AppColors.rose
                            : (isDark ? AppColors.darkElevated : Colors.white),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isSelected ? AppColors.rose : AppColors.lightBorder,
                        ),
                      ),
                      child: Row(
                        children: [
                          Text(
                            '$key. ',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: isSelected ? Colors.white : AppColors.rose,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              text,
                              style: TextStyle(
                                fontSize: 13,
                                color: isSelected ? Colors.white : (isDark ? AppColors.darkText : AppColors.lightText),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ),
          );
        }),
        const SizedBox(height: 10),
        ElevatedButton(
          onPressed: _submitQuiz,
          child: const Text('Save Quiz Answers ♡'),
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}
