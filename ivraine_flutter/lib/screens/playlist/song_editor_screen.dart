import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';

class SongEditorScreen extends StatefulWidget {
  const SongEditorScreen({Key? key}) : super(key: key);

  @override
  State<SongEditorScreen> createState() => _SongEditorScreenState();
}

class _SongEditorScreenState extends State<SongEditorScreen> {
  final _titleController = TextEditingController();
  final _artistController = TextEditingController();
  final _urlController = TextEditingController();
  final _noteController = TextEditingController();
  bool _setAsTheme = false;
  bool _isSaving = false;

  @override
  void dispose() {
    _titleController.dispose();
    _artistController.dispose();
    _urlController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _handleSave() async {
    final title = _titleController.text.trim();
    final artist = _artistController.text.trim();

    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a song title.')),
      );
      return;
    }

    setState(() => _isSaving = true);
    final provider = Provider.of<SpaceProvider>(context, listen: false);

    try {
      await provider.addEntry({
        'kind': 'song',
        'title': title,
        'artist': artist.isNotEmpty ? artist : 'Unknown Artist',
        'song_url': _urlController.text.trim(),
        'body': _noteController.text.trim(),
        'event_date': DateTime.now().toIso8601String().substring(0, 10),
        'location': _setAsTheme ? 'theme-song' : '',
        'chapter': _setAsTheme ? 'Theme Song of the Month' : 'Soundtrack',
        'photo_paths': [],
        'recurrence': 'none',
        'voice_url': '',
        'favorite': _setAsTheme,
        'completed': false,
      });

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Song added to our soundtrack ♫')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error adding song: $e')),
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
        title: const Text('Add Track to Playlist'),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _handleSave,
            child: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.rose),
                  )
                : const Text('Add ♫', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
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
                labelText: 'Song Title *',
                hintText: 'e.g. Until I Found You',
              ),
            ),
            const SizedBox(height: 16),

            TextField(
              controller: _artistController,
              decoration: const InputDecoration(
                labelText: 'Artist',
                hintText: 'e.g. Stephen Sanchez',
              ),
            ),
            const SizedBox(height: 16),

            TextField(
              controller: _urlController,
              decoration: const InputDecoration(
                labelText: 'Song Link (Spotify, YouTube, Apple Music)',
                hintText: 'https://open.spotify.com/track/...',
                prefixIcon: Icon(Icons.link_rounded, size: 20),
              ),
            ),
            const SizedBox(height: 16),

            TextField(
              controller: _noteController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Personal Note',
                hintText: 'Why this song reminds you of us...',
              ),
            ),
            const SizedBox(height: 16),

            SwitchListTile(
              title: const Text('Set as Theme Song of the Month', style: TextStyle(fontWeight: FontWeight.w600)),
              subtitle: const Text('Featured at the top of our playlist with spinning vinyl', style: TextStyle(fontSize: 12)),
              value: _setAsTheme,
              activeColor: AppColors.rose,
              onChanged: (val) => setState(() => _setAsTheme = val),
            ),
          ],
        ),
      ),
    );
  }
}
