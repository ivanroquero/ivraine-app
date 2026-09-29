import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../config/theme.dart';
import '../../providers/space_provider.dart';
import '../../models/entry.dart';
import 'photo_lightbox_screen.dart';

class GalleryTab extends StatelessWidget {
  const GalleryTab({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<SpaceProvider>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final entries = provider.getFilteredEntries('gallery');
    final isMapMode = provider.galleryViewMode == 'map';

    return Column(
      children: [
        // Controls: Grid vs Map toggle + Chapter filter
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
            border: Border(
              bottom: BorderSide(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  // Segmented view toggle
                  Container(
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.darkElevated : AppColors.lightBg,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.all(3),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _buildModeTab('▧ Grid', !isMapMode, () => provider.setGalleryViewMode('grid')),
                        _buildModeTab('⌖ Map', isMapMode, () => provider.setGalleryViewMode('map')),
                      ],
                    ),
                  ),
                  const Spacer(),
                  FilterChip(
                    label: const Text('♡ Favorites', style: TextStyle(fontSize: 12)),
                    selected: provider.favoritesOnly,
                    onSelected: provider.setFavoritesOnly,
                    selectedColor: AppColors.roseSoft,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              // Chapter horizontal list
              if (provider.availableChapters.isNotEmpty)
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      ActionChip(
                        label: const Text('All chapters', style: TextStyle(fontSize: 11)),
                        backgroundColor: provider.chapterFilter.isEmpty
                            ? AppColors.roseSoft
                            : (isDark ? AppColors.darkElevated : AppColors.lightBg),
                        onPressed: () => provider.setChapterFilter(''),
                      ),
                      const SizedBox(width: 6),
                      ...provider.availableChapters.map((c) {
                        final isSel = provider.chapterFilter == c;
                        return Container(
                          margin: const EdgeInsets.only(right: 6),
                          child: ActionChip(
                            label: Text(c, style: const TextStyle(fontSize: 11)),
                            backgroundColor: isSel
                                ? AppColors.roseSoft
                                : (isDark ? AppColors.darkElevated : AppColors.lightBg),
                            onPressed: () => provider.setChapterFilter(c),
                          ),
                        );
                      }),
                    ],
                  ),
                ),
            ],
          ),
        ),

        // Body: Map or Grid
        Expanded(
          child: isMapMode
              ? _buildMapView(context, entries, isDark)
              : _buildGridView(context, entries, isDark),
        ),
      ],
    );
  }

  Widget _buildModeTab(String text, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: active ? AppColors.rose : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          text,
          style: TextStyle(
            fontSize: 12,
            fontWeight: active ? FontWeight.bold : FontWeight.normal,
            color: active ? Colors.white : AppColors.lightMuted,
          ),
        ),
      ),
    );
  }

  Widget _buildGridView(BuildContext context, List<Entry> entries, bool isDark) {
    if (entries.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('▧', style: TextStyle(fontSize: 48, color: AppColors.roseSoft)),
            const SizedBox(height: 12),
            Text(
              'No photographs yet.',
              style: TextStyle(
                fontFamily: AppTheme.serifFont,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Memories with photos will appear here in our gallery.',
              style: TextStyle(fontSize: 12, color: AppColors.lightMuted),
            ),
          ],
        ),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: entries.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 0.85,
      ),
      itemBuilder: (ctx, idx) {
        final e = entries[idx];
        final firstUrl = e.photoUrls.firstWhere((u) => u != null, orElse: () => null);

        return GestureDetector(
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => PhotoLightboxScreen(
                  photoUrls: e.photoUrls.whereType<String>().toList(),
                  title: e.title,
                  date: e.eventDate,
                ),
              ),
            );
          },
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
              border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (firstUrl != null)
                  CachedNetworkImage(
                    imageUrl: firstUrl,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(color: AppColors.roseSoft.withOpacity(0.3)),
                    errorWidget: (_, __, ___) => const Center(child: Icon(Icons.broken_image)),
                  )
                else
                  Container(color: AppColors.roseSoft),
                // Gradient overlay at bottom
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Colors.transparent, Colors.black.withOpacity(0.8)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          e.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          e.eventDate,
                          style: const TextStyle(color: Colors.white70, fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                ),
                // Photos count pill
                if (e.photoUrls.length > 1)
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '+${e.photoUrls.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildMapView(BuildContext context, List<Entry> entries, bool isDark) {
    // Collect memories that have valid locations
    final memoriesWithLoc = entries.where((e) => e.location.isNotEmpty).toList();

    // Default center (Metro Manila, Philippines)
    LatLng initialCenter = const LatLng(14.5995, 120.9842);

    return FlutterMap(
      options: MapOptions(
        initialCenter: initialCenter,
        initialZoom: 11.0,
      ),
      children: [
        TileLayer(
          urlTemplate: isDark
              ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          subdomains: const ['a', 'b', 'c'],
          userAgentPackageName: 'com.ivraine.app',
        ),
        MarkerLayer(
          markers: memoriesWithLoc.map((e) {
            // Pseudo coords or fallback to default coordinates
            return Marker(
              point: initialCenter,
              width: 44,
              height: 44,
              child: GestureDetector(
                onTap: () {
                  showModalBottomSheet(
                    context: context,
                    builder: (ctx) => Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(e.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 4),
                          Text('${e.eventDate} · ⌖ ${e.location}', style: const TextStyle(color: AppColors.lightMuted, fontSize: 12)),
                          if (e.body.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(e.body, style: const TextStyle(fontSize: 13)),
                          ],
                          const SizedBox(height: 16),
                          if (e.photoUrls.isNotEmpty)
                            ElevatedButton(
                              onPressed: () {
                                Navigator.pop(ctx);
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => PhotoLightboxScreen(
                                      photoUrls: e.photoUrls.whereType<String>().toList(),
                                      title: e.title,
                                      date: e.eventDate,
                                    ),
                                  ),
                                );
                              },
                              child: const Text('View Photos ♡'),
                            ),
                        ],
                      ),
                    ),
                  );
                },
                child: Container(
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.roseAccent,
                    boxShadow: [
                      BoxShadow(color: Colors.black26, blurRadius: 6, offset: Offset(0, 3)),
                    ],
                  ),
                  child: const Center(
                    child: Text('♥', style: TextStyle(color: Colors.white, fontSize: 20)),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}
