import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';

class DateEditorScreen extends StatefulWidget {
  final String? initialDate;

  const DateEditorScreen({Key? key, this.initialDate}) : super(key: key);

  @override
  State<DateEditorScreen> createState() => _DateEditorScreenState();
}

class _DateEditorScreenState extends State<DateEditorScreen> {
  final _titleController = TextEditingController();
  final _bodyController = TextEditingController();
  late DateTime _selectedDate;
  String _recurrence = 'none'; // 'none' | 'monthly' | 'yearly'
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    if (widget.initialDate != null) {
      try {
        _selectedDate = DateTime.parse(widget.initialDate!);
      } catch (_) {
        _selectedDate = DateTime.now();
      }
    } else {
      _selectedDate = DateTime.now();
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
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
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _handleSave() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a milestone title.')),
      );
      return;
    }

    setState(() => _isSaving = true);
    final provider = Provider.of<SpaceProvider>(context, listen: false);
    final dateStr = DateFormat('yyyy-MM-dd').format(_selectedDate);

    try {
      await provider.addEntry({
        'kind': 'date',
        'title': title,
        'body': _bodyController.text.trim(),
        'event_date': dateStr,
        'location': '',
        'photo_paths': [],
        'chapter': 'Milestones',
        'recurrence': _recurrence,
        'song_url': '',
        'artist': '',
        'voice_url': '',
        'favorite': false,
        'completed': false,
      });

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Milestone added to our calendar ♡')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error adding milestone: $e')),
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
        title: const Text('Add Milestone or Date'),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _handleSave,
            child: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.rose),
                  )
                : const Text('Save', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: 'Milestone Title *',
                hintText: 'e.g. Loraine’s Birthday, 100th Day Together',
              ),
            ),
            const SizedBox(height: 16),

            // Date picker
            InkWell(
              onTap: _pickDate,
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Date',
                  suffixIcon: Icon(Icons.calendar_today_rounded, size: 18),
                ),
                child: Text(DateFormat('MMM d, yyyy').format(_selectedDate)),
              ),
            ),
            const SizedBox(height: 16),

            // Recurrence dropdown
            DropdownButtonFormField<String>(
              value: _recurrence,
              decoration: const InputDecoration(labelText: 'Repeats'),
              items: const [
                DropdownMenuItem(value: 'none', child: Text('Does not repeat')),
                DropdownMenuItem(value: 'monthly', child: Text('Every month (Monthsary)')),
                DropdownMenuItem(value: 'yearly', child: Text('Every year (Annual Anniversary / Birthday)')),
              ],
              onChanged: (val) {
                if (val != null) setState(() => _recurrence = val);
              },
            ),
            const SizedBox(height: 16),

            TextField(
              controller: _bodyController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Notes or Celebration Plans',
                hintText: 'How should we celebrate this special day?',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
