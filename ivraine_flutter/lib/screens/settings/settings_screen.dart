import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../config/api_config.dart';
import '../../providers/space_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';
import '../login_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({Key? key}) : super(key: key);

  void _showConfigSheet(BuildContext context) {
    final apiUrlCtrl = TextEditingController(text: ApiConfig.apiUrl);
    final supabaseUrlCtrl = TextEditingController(text: ApiConfig.supabaseUrl);
    final anonKeyCtrl = TextEditingController(text: ApiConfig.supabaseAnonKey);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 24,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
        ),
        decoration: BoxDecoration(
          color: Theme.of(ctx).cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Server & Database Connection',
                style: TextStyle(
                  fontFamily: AppTheme.serifFont,
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(ctx).textTheme.bodyLarge?.color,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: apiUrlCtrl,
                decoration: const InputDecoration(labelText: 'Backend API URL'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: supabaseUrlCtrl,
                decoration: const InputDecoration(labelText: 'Supabase URL'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: anonKeyCtrl,
                decoration: const InputDecoration(labelText: 'Supabase Anon Key'),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () async {
                  await ApiConfig.save(
                    apiUrl: apiUrlCtrl.text,
                    supabaseUrl: supabaseUrlCtrl.text,
                    supabaseAnonKey: anonKeyCtrl.text,
                  );
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Settings saved. Refreshing space...')),
                    );
                    Provider.of<SpaceProvider>(context, listen: false).loadSpace();
                  }
                },
                child: const Text('Save and Connect'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _exportJson(BuildContext context) {
    final provider = Provider.of<SpaceProvider>(context, listen: false);
    final data = {
      'exported_at': DateTime.now().toIso8601String(),
      'book': provider.info?.book.toJson(),
      'entries_count': provider.entries.length,
      'entries': provider.entries.map((e) => e.toJson()).toList(),
    };
    final jsonStr = jsonEncode(data);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Export Memories'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${provider.entries.length} memories & keepsakes exported.'),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.roseSoft.withOpacity(0.4),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${jsonStr.substring(0, jsonStr.length > 200 ? 200 : jsonStr.length)}...',
                style: const TextStyle(fontSize: 10, fontFamily: 'monospace'),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<SpaceProvider>(context);
    final auth = Provider.of<AuthProvider>(context);
    final themeProvider = Provider.of<ThemeProvider>(context);
    final isDark = themeProvider.isDarkMode;

    final info = provider.info;
    final partner1 = info?.book.partnerOne ?? 'Ivan';
    final partner2 = info?.book.partnerTwo ?? 'Loraine';
    final anniversary = info?.book.anniversary ?? '2026-09-02';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings & Keepsakes'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Couple Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: isDark
                    ? [const Color(0xFF2C1D26), const Color(0xFF1E151E)]
                    : [const Color(0xFFFFF5F8), const Color(0xFFFBF0F5)],
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.roseSoft),
            ),
            child: Column(
              children: [
                const Text('♡', style: TextStyle(fontSize: 32, color: AppColors.rose)),
                const SizedBox(height: 6),
                Text(
                  '$partner1 & $partner2',
                  style: TextStyle(
                    fontFamily: AppTheme.serifFont,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppColors.darkText : AppColors.lightText,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Our Little Space · Official Date: $anniversary',
                  style: const TextStyle(fontSize: 12, color: AppColors.lightMuted),
                ),
                const SizedBox(height: 12),
                Text(
                  'Signed in as: ${auth.userEmail ?? info?.member.displayName ?? 'You'}',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.rose),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Options List
          ListTile(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            leading: const Icon(Icons.palette_outlined, color: AppColors.rose),
            title: const Text('Theme Mode', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(isDark ? 'Dark romantic mode' : 'Light warm mode'),
            trailing: Switch(
              value: isDark,
              activeColor: AppColors.rose,
              onChanged: (_) => themeProvider.toggleTheme(),
            ),
          ),
          const Divider(),

          ListTile(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            leading: const Icon(Icons.cloud_outlined, color: AppColors.rose),
            title: const Text('Backend & Database Connection', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(ApiConfig.apiUrl, maxLines: 1, overflow: TextOverflow.ellipsis),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => _showConfigSheet(context),
          ),
          const Divider(),

          ListTile(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            leading: const Icon(Icons.download_rounded, color: AppColors.rose),
            title: const Text('Export Memories (JSON)', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: const Text('Export all our stories, letters & bucket list items'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => _exportJson(context),
          ),
          const Divider(),

          const SizedBox(height: 24),

          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.roseAccent,
              minimumSize: const Size.fromHeight(50),
            ),
            onPressed: () async {
              await auth.logout();
              if (context.mounted) {
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                  (route) => false,
                );
              }
            },
            icon: const Icon(Icons.lock_outline_rounded, size: 20),
            label: const Text('Lock Private Space'),
          ),
          const SizedBox(height: 32),
          const Center(
            child: Text(
              'ivraine v2.0 · Built with love for Ivan & Loraine',
              style: TextStyle(fontSize: 11, color: AppColors.lightMuted),
            ),
          ),
        ],
      ),
    );
  }
}
