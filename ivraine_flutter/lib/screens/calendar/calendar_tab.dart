import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../models/entry.dart';
import 'date_editor_screen.dart';

class CalendarTab extends StatefulWidget {
  const CalendarTab({Key? key}) : super(key: key);

  @override
  State<CalendarTab> createState() => _CalendarTabState();
}

class _CalendarTabState extends State<CalendarTab> {
  Timer? _countdownTimer;
  Duration _timeLeft = Duration.zero;

  @override
  void initState() {
    super.initState();
    _startTicking();
  }

  void _startTicking() {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) _updateCountdown();
    });
  }

  void _updateCountdown() {
    final provider = Provider.of<SpaceProvider>(context, listen: false);
    final anniversary = provider.info?.book.anniversary ?? '2026-09-02';

    DateTime target;
    try {
      target = DateTime.parse(anniversary).toUtc();
    } catch (_) {
      target = DateTime.now().add(const Duration(days: 30));
    }

    final now = DateTime.now().toUtc();
    // If target is in the past, calculate countdown to next annual anniversary
    var nextTarget = DateTime.utc(now.year, target.month, target.day);
    if (nextTarget.isBefore(now)) {
      nextTarget = DateTime.utc(now.year + 1, target.month, target.day);
    }

    final diff = nextTarget.difference(now);
    setState(() {
      _timeLeft = diff.isNegative ? Duration.zero : diff;
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<SpaceProvider>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final allEvents = provider.getFilteredEntries('date');
    final month = provider.calendarMonth;

    final daysInMonth = DateUtils.getDaysInMonth(month.year, month.month);
    final firstDayWeekday = DateTime.utc(month.year, month.month, 1).weekday % 7; // Sunday = 0

    final selectedDate = provider.selectedDate;
    final selectedEvents = allEvents.where((e) => e.eventDate == selectedDate).toList();

    return RefreshIndicator(
      color: AppColors.rose,
      onRefresh: provider.refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Pinned Countdown Card
          _buildCountdownHero(isDark),
          const SizedBox(height: 16),

          // Calendar Card
          Container(
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
            ),
            child: Column(
              children: [
                // Month Header
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.chevron_left_rounded),
                        onPressed: () {
                          provider.setCalendarMonth(DateTime.utc(month.year, month.month - 1, 1));
                        },
                      ),
                      Text(
                        DateFormat('MMMM yyyy').format(month),
                        style: TextStyle(
                          fontFamily: AppTheme.serifFont,
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: isDark ? AppColors.darkText : AppColors.lightText,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.chevron_right_rounded),
                        onPressed: () {
                          provider.setCalendarMonth(DateTime.utc(month.year, month.month + 1, 1));
                        },
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),

                // Weekday Row
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) {
                      return SizedBox(
                        width: 38,
                        child: Text(
                          d,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 1,
                            color: AppColors.lightMuted,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),

                // Day Grid
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  itemCount: firstDayWeekday + daysInMonth,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    childAspectRatio: 1.1,
                  ),
                  itemBuilder: (ctx, idx) {
                    if (idx < firstDayWeekday) {
                      return const SizedBox.shrink();
                    }
                    final dayNum = idx - firstDayWeekday + 1;
                    final dayDateStr = '${month.year}-${month.month.toString().padLeft(2, '0')}-${dayNum.toString().padLeft(2, '0')}';
                    final isToday = dayDateStr == DateTime.now().toUtc().toIso8601String().substring(0, 10);
                    final isSelected = dayDateStr == selectedDate;

                    final dayEvents = allEvents.where((e) => e.eventDate == dayDateStr).toList();
                    final hasEvents = dayEvents.isNotEmpty;

                    return GestureDetector(
                      onTap: () {
                        provider.setSelectedDate(dayDateStr);
                      },
                      child: Container(
                        margin: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppColors.rose
                              : isToday
                                  ? AppColors.roseSoft.withOpacity(0.5)
                                  : Colors.transparent,
                          borderRadius: BorderRadius.circular(10),
                          border: isToday && !isSelected
                              ? Border.all(color: AppColors.roseAccent, width: 1.2)
                              : null,
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              '$dayNum',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: isSelected || isToday ? FontWeight.bold : FontWeight.normal,
                                color: isSelected
                                    ? Colors.white
                                    : (isDark ? AppColors.darkText : AppColors.lightText),
                              ),
                            ),
                            if (hasEvents)
                              Container(
                                margin: const EdgeInsets.only(top: 2),
                                width: 5,
                                height: 5,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: isSelected ? Colors.white : AppColors.roseAccent,
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Selected Day Agenda
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Agenda for $selectedDate',
                      style: TextStyle(
                        fontFamily: AppTheme.serifFont,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkText : AppColors.lightText,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.add_circle_outline_rounded, color: AppColors.rose, size: 22),
                      tooltip: 'Add milestone on this day',
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => DateEditorScreen(initialDate: selectedDate),
                          ),
                        );
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (selectedEvents.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'No milestones or plans on this day yet. Tap + to add one ♡',
                      style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
                    ),
                  )
                else
                  ...selectedEvents.map((e) => Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.darkElevated : AppColors.roseSoft.withOpacity(0.4),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            const Text('✨', style: TextStyle(fontSize: 18)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    e.title,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                  ),
                                  if (e.body.isNotEmpty)
                                    Text(
                                      e.body,
                                      style: const TextStyle(fontSize: 11, color: AppColors.lightMuted),
                                    ),
                                ],
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline_rounded, size: 18, color: AppColors.roseAccent),
                              onPressed: () => provider.deleteEntry(e.id),
                            ),
                          ],
                        ),
                      )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCountdownHero(bool isDark) {
    final days = _timeLeft.inDays;
    final hours = _timeLeft.inHours.remainder(24);
    final mins = _timeLeft.inMinutes.remainder(60);
    final secs = _timeLeft.inSeconds.remainder(60);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isDark
              ? [const Color(0xFF2E2028), const Color(0xFF22171E)]
              : [const Color(0xFFFFF7FA), const Color(0xFFF6E8EE)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.roseSoft),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.roseSoft,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  '✈ PINNED COUNTDOWN',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1,
                    color: AppColors.roseDark,
                  ),
                ),
              ),
              const Text(
                'Next Anniversary ♡',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.rose),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Days until our anniversary',
            style: TextStyle(
              fontFamily: AppTheme.serifFont,
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: isDark ? AppColors.darkText : AppColors.lightText,
            ),
          ),
          const SizedBox(height: 16),
          // Timer Blocks: Days : Hours : Mins : Secs
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildTimeUnit('$days', 'days', isDark),
              const Text(':', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.rose)),
              _buildTimeUnit('${hours.toString().padLeft(2, '0')}', 'hours', isDark),
              const Text(':', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.rose)),
              _buildTimeUnit('${mins.toString().padLeft(2, '0')}', 'mins', isDark),
              const Text(':', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.rose)),
              _buildTimeUnit('${secs.toString().padLeft(2, '0')}', 'secs', isDark),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTimeUnit(String num, String label, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.roseSoft),
      ),
      child: Column(
        children: [
          Text(
            num,
            style: const TextStyle(
              fontFamily: AppTheme.serifFont,
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: AppColors.rose,
            ),
          ),
          Text(
            label,
            style: const TextStyle(fontSize: 9, color: AppColors.lightMuted, letterSpacing: 0.5),
          ),
        ],
      ),
    );
  }
}
