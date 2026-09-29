import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../models/entry.dart';

class LetterEditorScreen extends StatefulWidget {
  final Entry? existingLetter;

  const LetterEditorScreen({Key? key, this.existingLetter}) : super(key: key);

  @override
  State<LetterEditorScreen> createState() => _LetterEditorScreenState();
}

class _LetterEditorScreenState extends State<LetterEditorScreen> {
  final _titleController = TextEditingController();
  final _bodyController = TextEditingController();
  DateTime? _lockUntilDate;
  bool _isSaving = false;

  final List<String> _suggestions = [
    'you miss me terribly ♡',
    'you had a exhausting day ✨',
    'you can’t sleep at night',
    'you need a reminder of how much I love you',
    'it is our anniversary ♡',
    'you feel anxious or overwhelmed',
  ];

  @override
  void initState() {
    super.initState();
    if (widget.existingLetter != null) {
      final e = widget.existingLetter!;
      _titleController.text = e.title.replaceFirst(RegExp(r'^open when\s*', caseSensitive: false), '');
      _bodyController.text = e.body;
      if (e.lockUntil != null && e.lockUntil!.isNotEmpty) {
        try {
          _lockUntilDate = DateTime.parse(e.lockUntil!);
        } catch (_) {}
      }
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _pickLockDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _lockUntilDate ?? DateTime.now().add(const Duration(days: 7)),
      firstDate: DateTime.now(),
      lastDate: DateTime(2035),
      builder: (ctx, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(primary: AppColors.rose),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() => _lockUntilDate = picked);
    }
  }

  Future<void> _handleSave() async {
    final titleText = _titleController.text.trim();
    final bodyText = _bodyController.text.trim();

    if (titleText.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please specify when this letter should be opened.')),
      );
      return;
    }

    if (bodyText.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please write your letter message.')),
      );
      return;
    }

    setState(() => _isSaving = true);
    final provider = Provider.of<SpaceProvider>(context, listen: false);

    final finalTitle = titleText.toLowerCase().startsWith('open when')
        ? titleText
        : 'Open when $titleText';

    final lockStr = _lockUntilDate != null
        ? DateFormat('yyyy-MM-dd').format(_lockUntilDate!)
        : null;

    final locMeta = lockStr != null ? '{"lockUntil":"$lockStr"}' : '';

    try {
      if (widget.existingLetter != null) {
        final e = widget.existingLetter!;
        await provider.updateEntry(e.id, e.updatedAt, {
          'title': finalTitle,
          'body': bodyText,
          'location': locMeta,
        });
      } else {
        await provider.addEntry({
          'kind': 'note',
          'title': finalTitle,
          'body': bodyText,
          'event_date': DateTime.now().toIso8601String().substring(0, 10),
          'location': locMeta,
          'photo_paths': [],
          'chapter': 'Letters',
          'recurrence': 'none',
          'song_url': '',
          'artist': '',
          'voice_url': '',
          'favorite': false,
          'completed': false,
        });
      }

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Letter sealed and saved ♡')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving letter: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existingLetter != null ? 'Edit Letter' : 'Write a Letter'),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _handleSave,
            child: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.rose),
                  )
                : const Text('Seal Letter ♡', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'OPEN WHEN...',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.5,
                color: AppColors.rose,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(
                hintText: 'e.g. you miss me or you had a hard day',
                prefixText: 'Open when ',
              ),
            ),
            const SizedBox(height: 12),

            // Suggestions Chips
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _suggestions.map((s) {
                return ActionChip(
                  label: Text(s, style: const TextStyle(fontSize: 11)),
                  onPressed: () {
                    setState(() => _titleController.text = s);
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 20),

            // Optional Lock Until Date
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: _pickLockDate,
                    child: InputDecorator(
                      decoration: InputDecoration(
                        labelText: 'Lock Until Date (Optional)',
                        hintText: 'Keep sealed until...',
                        suffixIcon: _lockUntilDate != null
                            ? IconButton(
                                icon: const Icon(Icons.clear, size: 16),
                                onPressed: () => setState(() => _lockUntilDate = null),
                              )
                            : const Icon(Icons.lock_clock_rounded, size: 18),
                      ),
                      child: Text(
                        _lockUntilDate != null
                            ? DateFormat('MMM d, yyyy').format(_lockUntilDate!)
                            : 'No lock (can be unsealed anytime)',
                        style: TextStyle(
                          color: _lockUntilDate != null ? AppColors.rose : AppColors.lightMuted,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            TextField(
              controller: _bodyController,
              maxLines: 12,
              decoration: const InputDecoration(
                labelText: 'Your Letter',
                hintText: 'Write from the heart. Share your comfort, jokes, memories, and love...',
                alignLabelWithHint: true,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
