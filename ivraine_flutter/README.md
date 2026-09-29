# Ivraine — Our Little Space (Android Flutter App)

A private, mobile-first Android app built with Flutter & Dart for Ivan & Loraine. Official date: September 2, 2026.

This app faithfully replicates the entire romantic theme, features, and functionality of the web app and integrates with the existing Express/Railway backend and Supabase Auth database.

---

## 🎨 Theme & Styling

The app uses the exact same romantic theme colors, typography, and card designs as the web application:

- **Romantic Rose Accent:** `#803B4F` (Primary), `#4B3540` (Deep Rose), `#CE3B5F` / `#E64A72` (Rose Pink)
- **Soft Romantic Pink:** `#F4E0E3` / `#F6EBEE`
- **Ivory & Gold:** `#E5B869` / `#FDF2D0`
- **Dark Romantic Canvas:** `#17141D` (Scaffold background), `#241E2B` (Cards), `#3E3349` (Borders)
- **Light Warm Canvas:** `#F8F5F3` (Scaffold background), `#FFFFFF` (Cards), `#E8DFDF` (Borders)
- **Partner Live Green:** `#4ADE80` (With pulsing animation for online partner presence)
- **Typography:** Georgia serif headers and clean Inter/system sans-serif body.

---

## ✨ Features Included

| Feature | Working Mobile Behavior |
| --- | --- |
| **Our Story Timeline** | Chronological memories with polaroid hero card, days together counter since Sept 2, 2026, photo counts, audio voice players, favorite hearts, edit, and delete. Up to 12 photos per memory. |
| **Open When Letters** | Grid of envelopes with interactive wax seals (intact red wax, locked gold wax, cracked rose wax). Tap wax seal to unseal with haptic feedback, read letters with paper styling and voice memo playback. |
| **Memory Gallery** | ▧ Grid view and ⌖ Travel Map view with OpenStreetMap Leaflet tiles! Heart pins for pinned places visited together, chapter filtering, and fullscreen photo lightbox with pinch-to-zoom. |
| **Milestone Calendar** | Month grid with milestone dots, daily agenda, annual birthdays, and a live ticking countdown hero timer (Days : Hours : Mins : Secs) to our anniversary. |
| **Shared Bucket List** | Shared dreams with target dates and places, progress bar ("X of Y dreams checked off"), completion checkboxes with confetti particle explosion 🎉, and "Make this a photo memory +" converter. |
| **Our Playlist** | Couple Soundtrack with animated spinning vinyl record for Theme Song of the Month, track list, and instant launch into Spotify, Apple Music, or YouTube via `url_launcher`. |
| **Voice Keepsakes** | Record voice memos, upload to `/api/voice`, and play back with scrubber and duration. |
| **“I Miss You” Touch** | Romantic heart button with vibration patterns and quick love note chips sent across to the partner via `/api/track`. |
| **1st Monthsary & Quiz** | Floating "💌 Open This" pill with celebration love letter, promises/vows, and interactive quiz with answers submitted to `/api/monthsary/answers`. |
| **Mystery Date & Pin** | Date idea generator wheel with GPS location sharing sent to `/api/date-location`. |
| **Settings & Connection** | Configurable Railway Backend URL and Supabase credentials in a bottom sheet, JSON memories export, and secure space locking. |

---

## 📁 Directory Structure

```
ivraine_flutter/
├── android/
│   ├── app/
│   │   ├── build.gradle (minSdkVersion 21, targetSdkVersion 34, compileSdkVersion 34)
│   │   └── src/main/
│   │       ├── AndroidManifest.xml (Internet, Location, Camera, Audio permissions)
│   │       └── kotlin/com/ivraine/app/MainActivity.kt
│   ├── build.gradle
│   └── settings.gradle
├── assets/
│   └── icons/ (Couple photos & notification badges from web app)
├── lib/
│   ├── config/
│   │   ├── api_config.dart (Backend URL & Supabase config with persistence)
│   │   └── theme.dart (Exact matching color palette & themes)
│   ├── models/
│   │   ├── entry.dart (Story, Letter, Dream, Milestone, Song, Voice)
│   │   ├── book.dart
│   │   ├── member.dart
│   │   ├── book_response.dart
│   │   └── app_config.dart
│   ├── services/
│   │   ├── api_service.dart (Full integration with existing Railway & Supabase API)
│   │   ├── auth_service.dart (SharedPreferences persistent session)
│   │   └── location_service.dart (GPS acquisition for date generator)
│   ├── providers/
│   │   ├── theme_provider.dart (Dark/Light toggle)
│   │   ├── auth_provider.dart (Login, Auto-login, Password reset)
│   │   └── space_provider.dart (CRUD, 60s Heartbeat, Presence, Filters)
│   ├── widgets/
│   │   ├── presence_badge.dart (Pulsing green live dot)
│   │   ├── heart_tap_dialog.dart (Vibration & quick love notes)
│   │   ├── voice_note_player.dart (Audio player with progress)
│   │   ├── spinning_vinyl.dart (Spinning vinyl disc animation)
│   │   ├── wax_seal_widget.dart (Wax seal unsealing)
│   │   └── confetti_overlay.dart (Confetti particle explosion)
│   ├── screens/
│   │   ├── splash_screen.dart
│   │   ├── login_screen.dart (With connection settings sheet)
│   │   ├── home_screen.dart (6 tabs + top presence bar + floating pills)
│   │   ├── story/ (StoryTab & EntryEditorScreen)
│   │   ├── letters/ (LettersTab, LetterReaderDialog & LetterEditorScreen)
│   │   ├── gallery/ (GalleryTab with Map/Grid & PhotoLightboxScreen)
│   │   ├── calendar/ (CalendarTab with Live Timer & DateEditorScreen)
│   │   ├── plans/ (BucketListTab with Progress & PlanEditorScreen)
│   │   ├── playlist/ (PlaylistTab with Vinyl & SongEditorScreen)
│   │   ├── special/ (MonthsaryModal & MysteryDateModal)
│   │   └── settings/ (SettingsScreen & JSON export)
│   └── main.dart
└── pubspec.yaml
```

---

## 🚀 How to Run & Build

### Prerequisites
- Flutter SDK (>= 3.10.0)
- Android Studio / Android SDK

### Steps to Run
1. Open terminal in the app directory:
   ```bash
   cd ivraine_flutter
   ```
2. Install dependencies:
   ```bash
   flutter pub get
   ```
3. Run on connected Android device or emulator:
   ```bash
   flutter run
   ```
4. Build release APK:
   ```bash
   flutter build apk --release
   ```
   The APK will be generated at:
   `ivraine_flutter/build/app/outputs/flutter-apk/app-release.apk`

---

## 🔗 Backend & Connection Setup

In the Login screen (or Settings Screen), tap the ⚙ icon to adjust your Backend URL:
- **Android Emulator:** `http://10.0.2.2:3001`
- **Real Device / Local WiFi:** `http://YOUR_LOCAL_IP:3001` (e.g. `http://192.168.1.10:3001`)
- **Production Railway:** `https://your-service.up.railway.app`
- **Supabase URL & Anon Key:** Matches your Supabase project settings.
