import 'dart:math';
import 'package:flutter/material.dart';

class ConfettiParticle {
  double x;
  double y;
  double vx;
  double vy;
  double size;
  Color color;
  double rotation;
  double rotationSpeed;

  ConfettiParticle({
    required this.x,
    required this.y,
    required this.vx,
    required this.vy,
    required this.size,
    required this.color,
    required this.rotation,
    required this.rotationSpeed,
  });
}

class ConfettiOverlay extends StatefulWidget {
  final VoidCallback? onFinished;

  const ConfettiOverlay({Key? key, this.onFinished}) : super(key: key);

  static void show(BuildContext context) {
    final overlay = Overlay.of(context);
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (ctx) => ConfettiOverlay(
        onFinished: () {
          entry.remove();
        },
      ),
    );
    overlay.insert(entry);
  }

  @override
  State<ConfettiOverlay> createState() => _ConfettiOverlayState();
}

class _ConfettiOverlayState extends State<ConfettiOverlay> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  final List<ConfettiParticle> _particles = [];
  final Random _random = Random();

  final List<Color> _colors = [
    const Color(0xFFE91E63),
    const Color(0xFFFF4081),
    const Color(0xFFFFB74D),
    const Color(0xFFFFD54F),
    const Color(0xFF81D4FA),
    const Color(0xFFB39DDB),
  ];

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2500),
    )..addListener(_updateParticles);

    // Generate 60 particles
    for (int i = 0; i < 60; i++) {
      _particles.add(
        ConfettiParticle(
          x: 0.5,
          y: 0.4,
          vx: (_random.nextDouble() - 0.5) * 1.5,
          vy: -_random.nextDouble() * 1.2 - 0.3,
          size: _random.nextDouble() * 8 + 6,
          color: _colors[_random.nextInt(_colors.length)],
          rotation: _random.nextDouble() * 2 * pi,
          rotationSpeed: (_random.nextDouble() - 0.5) * 0.3,
        ),
      );
    }

    _controller.forward().then((_) => widget.onFinished?.call());
  }

  void _updateParticles() {
    setState(() {
      for (final p in _particles) {
        p.x += p.vx * 0.015;
        p.y += p.vy * 0.015;
        p.vy += 0.025; // gravity
        p.rotation += p.rotationSpeed;
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return IgnorePointer(
      child: CustomPaint(
        size: size,
        painter: _ConfettiPainter(_particles, size, 1.0 - _controller.value),
      ),
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  final List<ConfettiParticle> particles;
  final Size screenSize;
  final double opacity;

  _ConfettiPainter(this.particles, this.screenSize, this.opacity);

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in particles) {
      final paint = Paint()
        ..color = p.color.withOpacity(opacity.clamp(0.0, 1.0))
        ..style = PaintingStyle.fill;

      final px = p.x * screenSize.width;
      final py = p.y * screenSize.height;

      canvas.save();
      canvas.translate(px, py);
      canvas.rotate(p.rotation);
      canvas.drawRect(
        Rect.fromCenter(center: Offset.zero, width: p.size, height: p.size * 0.6),
        paint,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
