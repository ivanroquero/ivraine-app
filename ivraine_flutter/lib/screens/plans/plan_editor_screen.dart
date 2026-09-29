import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';

class PlanEditorScreen extends StatefulWidget {
  const PlanEditorScreen({Key? key}) : super(key: key);

  @override
  State<PlanEditorScreen> createState() => _PlanEditorScreenState();
}

class _PlanEditorScreenState extends State<PlanEditorScreen> {
  final _titleController = TextEditingController();
  final _bodyController = TextEditingController();
  final _locationController = TextEditingController();
  DateTime? _targetDate;
  bool _isSaving = false;

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _targetDate ?? DateTime.now().add(const Duration(days: 30)),
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
      setState(() => _targetDate = picked);
    }
  }

  Future<void> _handleSave() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a dream or plan title.')),
      );
      return;
    }

    setState(() => _isSaving = true);
    final provider = Provider.of<SpaceProvider>(context, listen: false);
    final dateStr = _targetDate != null
        ? DateFormat('yyyy-MM-dd').format(_targetDate!)
        : DateTime.now().toIso8601String().substring(0, 10);

    try {
      await provider.addEntry({
        'kind': 'plan',
        'title': title,
        'body': _bodyController.text.trim(),
        'event_date': dateStr,
        'location': _locationController.text.trim(),
        'photo_paths': [],
        'chapter': 'Bucket List',
        'recurrence': 'none',
        'song_url': '',
        'artist': '',
        'voice_url': '',
        'favorite': false,
        'completed': false,
      });

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Dream added to our bucket list ♡')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error adding dream: $e')),
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
        title: const Text('Add Bucket List Dream'),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _handleSave,
            child: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.rose),
                  )
                : const Text('Add Dream ♡', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
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
                labelText: 'Dream Title *',
                hintText: 'e.g. Travel to Kyoto for the cherry blossoms',
              ),
            ),
            const SizedBox(height: 16),

            // Target Date
            InkWell(
              onTap: _pickDate,
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Target Date (Optional)',
                  suffixIcon: Icon(Icons.calendar_today_rounded, size: 18),
                ),
                child: Text(
                  _targetDate != null
                      ? DateFormat('MMM d, yyyy').format(_targetDate!)
                      : 'Someday in the future...',
                  style: TextStyle(
                    color: _targetDate != null ? AppColors.rose : AppColors.lightMuted,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),

            TextField(
              controller: _locationController,
              decoration: const InputDecoration(
                labelText: 'Destination / Location',
                hintText: 'e.g. Kyoto, Japan or Batanes, Philippines',
                prefixIcon: Icon(Icons.flight_takeoff_rounded, size: 18),
              ),
            ),
            const SizedBox(height: 16),

            TextField(
              controller: _bodyController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Our Vision & Notes',
                hintText: 'What makes this dream so special to us?',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
