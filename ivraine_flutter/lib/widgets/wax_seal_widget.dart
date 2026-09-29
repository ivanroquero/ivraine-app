import 'package:flutter/material.dart';
import '../config/theme.dart';

enum WaxSealState { intact, locked, cracked }

class WaxSealWidget extends StatefulWidget {
  final WaxSealState state;
  final VoidCallback? onTap;
  final double size;

  const WaxSealWidget({
    Key? key,
    required this.state,
    this.onTap,
    this.size = 54,
  }) : super(key: key);

  @override
  State<WaxSealWidget> createState() => _WaxSealWidgetState();
}

class _WaxSealWidgetState extends State<WaxSealWidget> with SingleTickerProviderStateMixin {
  late AnimationController _anim;
  late Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _scale = Tween<double>(begin: 1.0, end: 0.9).animate(
      CurvedAnimation(parent: _anim, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    Color bg1, bg2;
    Widget icon;

    switch (widget.state) {
      case WaxSealState.locked:
        bg1 = const Color(0xFFF9DDA0);
        bg2 = const Color(0xFFCF982E);
        icon = const Icon(Icons.lock_rounded, color: Colors.white, size: 20);
        break;
      case WaxSealState.cracked:
        bg1 = const Color(0xFFE8B5C4);
        bg2 = const Color(0xFFBE6D88);
        icon = const Text('♡', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold));
        break;
      case WaxSealState.intact:
      default:
        bg1 = const Color(0xFFE64A72);
        bg2 = const Color(0xFF8C1836);
        icon = const Text('♥', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold));
        break;
    }

    return GestureDetector(
      onTapDown: (_) => _anim.forward(),
      onTapUp: (_) {
        _anim.reverse();
        widget.onTap?.call();
      },
      onTapCancel: () => _anim.reverse(),
      child: ScaleTransition(
        scale: _scale,
        child: Container(
          width: widget.size,
          height: widget.size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              center: const Alignment(-0.3, -0.3),
              radius: 0.8,
              colors: [bg1, bg2],
            ),
            boxShadow: [
              BoxShadow(
                color: bg2.withOpacity(0.5),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
              const BoxShadow(
                color: Colors.white24,
                blurRadius: 2,
                offset: Offset(-1, -1),
              ),
            ],
            border: Border.all(color: Colors.white38, width: 1.5),
          ),
          child: Center(child: icon),
        ),
      ),
    );
  }
}
