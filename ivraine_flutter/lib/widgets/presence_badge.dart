import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../models/member.dart';

class PresenceBadge extends StatefulWidget {
  final MemberPresence? partner;
  final VoidCallback? onTap;

  const PresenceBadge({Key? key, this.partner, this.onTap}) : super(key: key);

  @override
  State<PresenceBadge> createState() => _PresenceBadgeState();
}

class _PresenceBadgeState extends State<PresenceBadge> with SingleTickerProviderStateMixin {
  late AnimationController _anim;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final partner = widget.partner;
    if (partner == null) return const SizedBox.shrink();

    final isLive = partner.isRecentlyActive;
    final text = partner.displayName;
    final presence = partner.presenceText;

    return InkWell(
      onTap: widget.onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isLive ? AppColors.liveGreen.withOpacity(0.4) : AppColors.roseSoft.withOpacity(0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isLive)
              AnimatedBuilder(
                animation: _anim,
                builder: (context, child) {
                  return Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.only(right: 6),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.liveGreen,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.liveGreen.withOpacity(0.3 + 0.4 * _anim.value),
                          blurRadius: 4 + 4 * _anim.value,
                          spreadRadius: 1 + 2 * _anim.value,
                        ),
                      ],
                    ),
                  );
                },
              )
            else
              Container(
                width: 7,
                height: 7,
                margin: const EdgeInsets.only(right: 6),
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.offlineGrey,
                ),
              ),
            Text(
              '$text · $presence',
              style: TextStyle(
                fontSize: 11,
                fontWeight: isLive ? FontWeight.w600 : FontWeight.normal,
                color: isLive
                    ? (Theme.of(context).brightness == Brightness.dark ? Colors.white : AppColors.roseDark)
                    : Theme.of(context).textTheme.bodySmall?.color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
