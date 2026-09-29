import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../models/entry.dart';

class EntryEditorScreen extends StatefulWidget {
  final Entry? existingEntry;

  const EntryEditorScreen({Key? key, this.existingEntry}) : super(key: key);

  @override
  State<EntryEditorScreen> createState() => _EntryEditorScreenState();
}

class _EntryEditorScreenState extends State<EntryEditorScreen> {
  final _titleController = TextEditingController();
  final _bodyController = TextEditingController();
  final _locationController = TextEditingController();
  final _chapterController = TextEditingController();

  DateTime _selectedDate = DateTime.now();
  List<String> _existingPhotoPaths = [];
  final List<Uint8List> _newPhotoBytes = [];
  final List<String> _newPhotoNames = [];
  bool _isSaving = false;

  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    if (widget.existingEntry != null) {
      final e = widget.existingEntry!;
      _titleController.text = e.title;
      _bodyController.text = e.body;
      _locationController.text = e.location;
      _chapterController.text = e.chapter;
      _existingPhotoPaths = List.from(e.photoPaths);
      try {
        _selectedDate = DateTime.parse(e.eventDate);
      } catch (_) {}
    } else {
      _chapterController.text = 'First Moments';
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    _locationController.dispose();
    _chapterController.dispose();
    super.dispose();
  }

  Future<void> _pickImages() async {
    final totalPhotos = _existingPhotoPaths.length + _newPhotoBytes.length;
    if (totalPhotos >= 12) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Maximum 12 photos per memory.')),
      );
      return;
    }

    try {
      final images = await _picker.pickMultiImage();
      if (images.isNotEmpty) {
        for (final img in images) {
          if (_existingPhotoPaths.length + _newPhotoBytes.length < 12) {
            final bytes = await img.readAsBytes();
            setState(() {
              _newPhotoBytes.add(bytes);
              _newPhotoNames.add(img.name);
            });
          }
        }
      }
    } catch (err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not pick photo: $err')),
      );
    }
  }

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      builder: (ctx, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppColors.rose,
              onPrimary: Colors.white,
            ),
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
        const SnackBar(content: Text('Please enter a title for this memory.')),
      );
      return;
    }

    setState(() => _isSaving = true);
    final provider = Provider.of<SpaceProvider>(context, listen: false);

    try {
      final uploadedPaths = List<String>.from(_existingPhotoPaths);

      // Upload newly picked photos
      for (int i = 0; i < _newPhotoBytes.length; i++) {
        final path = await provider.uploadPhoto(
          _newPhotoBytes[i],
          _newPhotoNames[i],
        );
        uploadedPaths.add(path);
      }

      final dateStr = DateFormat('yyyy-MM-dd').format(_selectedDate);

      if (widget.existingEntry != null) {
        final e = widget.existingEntry!;
        await provider.updateEntry(e.id, e.updatedAt, {
          'title': title,
          'body': _bodyController.text.trim(),
          'event_date': dateStr,
          'location': _locationController.text.trim(),
          'chapter': _chapterController.text.trim(),
          'photo_paths': uploadedPaths,
        });
      } else {
        await provider.addEntry({
          'kind': 'memory',
          'title': title,
          'body': _bodyController.text.trim(),
          'event_date': dateStr,
          'location': _locationController.text.trim(),
          'chapter': _chapterController.text.trim(),
          'photo_paths': uploadedPaths,
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
          const SnackBar(content: Text('Memory saved to your space ♡')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving memory: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final totalPhotos = _existingPhotoPaths.length + _newPhotoBytes.length;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existingEntry != null ? 'Edit Memory' : 'New Memory'),
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
                labelText: 'Title of memory *',
                hintText: 'e.g. Under the stars in Tagaytay',
              ),
            ),
            const SizedBox(height: 14),

            // Date & Chapter Row
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: _selectDate,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Date',
                        suffixIcon: Icon(Icons.calendar_today_rounded, size: 18),
                      ),
                      child: Text(DateFormat('MMM d, yyyy').format(_selectedDate)),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _chapterController,
                    decoration: const InputDecoration(
                      labelText: 'Chapter',
                      hintText: 'e.g. Adventures',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            TextField(
              controller: _locationController,
              decoration: const InputDecoration(
                labelText: 'Location / Place (optional)',
                hintText: 'e.g. Bonifacio Global City, Taguig',
                prefixIcon: Icon(Icons.location_on_outlined, size: 18),
              ),
            ),
            const SizedBox(height: 14),

            TextField(
              controller: _bodyController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Our Story & Thoughts',
                hintText: 'What made this moment unforgettable?',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 20),

            // Photos section
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Photos ($totalPhotos / 12)',
                  style: TextStyle(
                    fontFamily: AppTheme.serifFont,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                TextButton.icon(
                  onPressed: totalPhotos >= 12 ? null : _pickImages,
                  icon: const Icon(Icons.add_photo_alternate_rounded, size: 18),
                  label: const Text('Add Photos'),
                ),
              ],
            ),
            const SizedBox(height: 8),

            if (totalPhotos == 0)
              Container(
                height: 100,
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkElevated : AppColors.roseSoft.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                    style: BorderStyle.solid,
                  ),
                ),
                child: Center(
                  child: TextButton.icon(
                    onPressed: _pickImages,
                    icon: const Icon(Icons.cloud_upload_outlined, color: AppColors.rose),
                    label: const Text(
                      'Tap to choose photos (up to 12)',
                      style: TextStyle(color: AppColors.rose),
                    ),
                  ),
                ),
              )
            else
              SizedBox(
                height: 100,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    // Existing remote photos
                    ..._existingPhotoPaths.asMap().entries.map((entry) {
                      return Container(
                        margin: const EdgeInsets.only(right: 8),
                        width: 90,
                        height: 90,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          color: AppColors.roseSoft,
                        ),
                        child: Stack(
                          children: [
                            const Center(child: Icon(Icons.image_outlined, color: AppColors.rose)),
                            Positioned(
                              top: 2,
                              right: 2,
                              child: InkWell(
                                onTap: () {
                                  setState(() => _existingPhotoPaths.removeAt(entry.key));
                                },
                                child: Container(
                                  padding: const EdgeInsets.all(3),
                                  decoration: const BoxDecoration(
                                    color: Colors.black54,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.close, size: 14, color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                    // New picked photo bytes
                    ..._newPhotoBytes.asMap().entries.map((entry) {
                      return Container(
                        margin: const EdgeInsets.only(right: 8),
                        width: 90,
                        height: 90,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          image: DecorationImage(
                            image: MemoryImage(entry.value),
                            fit: BoxFit.cover,
                          ),
                        ),
                        child: Stack(
                          children: [
                            Positioned(
                              top: 2,
                              right: 2,
                              child: InkWell(
                                onTap: () {
                                  setState(() {
                                    _newPhotoBytes.removeAt(entry.key);
                                    _newPhotoNames.removeAt(entry.key);
                                  });
                                },
                                child: Container(
                                  padding: const EdgeInsets.all(3),
                                  decoration: const BoxDecoration(
                                    color: Colors.black54,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.close, size: 14, color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
