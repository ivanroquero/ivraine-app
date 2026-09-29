import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../config/api_config.dart';
import '../providers/auth_provider.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({Key? key}) : super(key: key);

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter your email and password.')),
      );
      return;
    }

    final auth = Provider.of<AuthProvider>(context, listen: false);
    final success = await auth.login(email, password);

    if (success && mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    }
  }

  void _showConfigSheet() {
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
              const SizedBox(height: 6),
              const Text(
                'Configure your Railway Backend URL and Supabase Project values.',
                style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: apiUrlCtrl,
                decoration: const InputDecoration(
                  labelText: 'Backend API URL',
                  hintText: 'e.g. http://10.0.2.2:3001 or https://your.railway.app',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: supabaseUrlCtrl,
                decoration: const InputDecoration(
                  labelText: 'Supabase URL',
                  hintText: 'https://xxx.supabase.co',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: anonKeyCtrl,
                decoration: const InputDecoration(
                  labelText: 'Supabase Publishable/Anon Key',
                  hintText: 'sb_publishable_... or eyJ...',
                ),
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
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Server settings saved!')),
                    );
                  }
                },
                child: const Text('Save Settings'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showForgotPasswordDialog() {
    final emailCtrl = TextEditingController(text: _emailController.text);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset Password'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Enter your registered email address and we will send a password reset link.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: emailCtrl,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              final auth = Provider.of<AuthProvider>(context, listen: false);
              final ok = await auth.requestPasswordReset(emailCtrl.text);
              if (ctx.mounted) Navigator.pop(ctx);
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(ok
                        ? 'Password reset email sent. Please check your inbox.'
                        : 'Could not send reset email.'),
                  ),
                );
              }
            },
            child: const Text('Send Reset Link'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final auth = Provider.of<AuthProvider>(context);

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBg : AppColors.lightBg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Top Settings Gear
                Align(
                  alignment: Alignment.topRight,
                  child: IconButton(
                    icon: const Icon(Icons.settings_outlined, color: AppColors.lightMuted),
                    onPressed: _showConfigSheet,
                    tooltip: 'Server & Supabase Settings',
                  ),
                ),

                // Romantic polaroid couple image
                Center(
                  child: Transform.rotate(
                    angle: -0.04,
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.1),
                            blurRadius: 16,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.asset(
                              'assets/icons/couple-512.png',
                              width: 130,
                              height: 130,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Container(
                                width: 130,
                                height: 130,
                                color: AppColors.roseSoft,
                                child: const Center(
                                  child: Text('♡', style: TextStyle(fontSize: 40, color: AppColors.rose)),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'you, me & all our little moments.',
                            style: TextStyle(
                              fontFamily: AppTheme.serifFont,
                              fontStyle: FontStyle.italic,
                              fontSize: 11,
                              color: AppColors.roseDark,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 24),
                const Center(
                  child: Text(
                    'JUST BETWEEN US',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2,
                      color: AppColors.rose,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'A little space\nfor us.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: AppTheme.serifFont,
                    fontSize: 34,
                    height: 1.15,
                    fontWeight: FontWeight.w400,
                    color: isDark ? AppColors.darkText : AppColors.lightText,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'A few memories, a whole lot of love.\nCome in and stay a while.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: AppColors.lightMuted, height: 1.5),
                ),
                const SizedBox(height: 28),

                if (auth.errorMessage != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.roseSoft,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.rose.withOpacity(0.3)),
                    ),
                    child: Text(
                      auth.errorMessage!,
                      style: const TextStyle(fontSize: 12, color: AppColors.roseDark),
                      textAlign: TextAlign.center,
                    ),
                  ),

                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Your email',
                    prefixIcon: Icon(Icons.email_outlined, size: 20),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                        size: 20,
                      ),
                      onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                    ),
                  ),
                ),
                const SizedBox(height: 8),

                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: _showForgotPasswordDialog,
                    child: const Text(
                      'Forgot password?',
                      style: TextStyle(fontSize: 12, color: AppColors.rose),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                ElevatedButton(
                  onPressed: auth.status == AuthStatus.loading ? null : _handleLogin,
                  child: auth.status == AuthStatus.loading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text('Open our private space'),
                            SizedBox(width: 8),
                            Icon(Icons.arrow_forward_rounded, size: 18),
                          ],
                        ),
                ),

                const SizedBox(height: 24),
                const Center(
                  child: Text(
                    'PRIVATE MEMORIES · SHARED WITH LOVE',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.5,
                      color: AppColors.lightMuted,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
