# Cordova Test App for audioinput Plugin

This is a minimal Cordova app for testing the cordova-plugin-audioinput on real devices.

## Prerequisites

- Node.js and npm installed
- Cordova CLI: `npm install -g cordova`
- For Android: Android Studio and Android SDK
- For iOS: Xcode (macOS only)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Add platform(s):**
   ```bash
   # For Android
   cordova platform add android

   # For iOS (macOS only)
   cordova platform add ios
   ```

3. **Install the plugin from your branch:**
   ```bash
   # Replace with your actual branch name
   cordova plugin add https://github.com/exelerus/cordova-plugin-audioinput.git#claude/analyze-plugin-capacitor-011CUyE1dcag6xBDyjquHEBY
   ```

   **Note:** To test a different branch, just change the branch name after the `#` symbol.

## Build and Run

### Android

1. **Connect your Android device** via USB with USB debugging enabled

2. **Run the app:**
   ```bash
   cordova run android
   ```

   Or build and install manually:
   ```bash
   cordova build android
   # APK will be in: platforms/android/app/build/outputs/apk/debug/
   ```

### iOS (macOS only)

1. **Connect your iOS device** via USB

2. **Run the app:**
   ```bash
   cordova run ios --device
   ```

   Or open in Xcode:
   ```bash
   cordova build ios
   open platforms/ios/*.xcworkspace
   ```

## Testing the Plugin

The test app provides buttons to:

1. **Request Permission** - Request microphone access
2. **Check Permission** - Verify current permission status
3. **Start Capture** - Begin audio capture
4. **Stop Capture** - Stop audio capture
5. **Play Recording** - Play back captured audio from manual mode
6. **Run Benchmark** - Run timed on-device capture benchmarks
7. **Stop Benchmark** - Stop an active benchmark early

The status area will show:
- Plugin loading status
- Permission status
- Audio capture events
- Benchmark summary metrics and JSON result payload
- Any errors that occur

## On-Device Benchmarking

Use the **On-Device Benchmark** panel to compare plugin behavior with different runtime settings.

1. Choose benchmark config:
   - `sampleRate`
   - `bufferSize`
   - `channels`
   - `normalize`
   - `duration`
2. Tap **Run Benchmark**
3. Wait for completion (or tap **Stop Benchmark**)
4. Copy JSON output from the benchmark panel for regression tracking

Key metrics:
- `intervals.expectedMs`: expected chunk interval from config
- `intervals.avgMs` / `p95Ms` / `stdDevMs`: observed chunk scheduling behavior
- `intervals.p95JitterMs`: tail jitter relative to expected timing
- `handler.busyRatioPct`: JS callback processing load proxy
- `totals.effectiveSampleRate`: practical delivered sample rate
- `totals.driftMs`: timing drift compared to sample-count duration

## Updating the Plugin

To test changes to the plugin:

1. **Remove the old plugin:**
   ```bash
   cordova plugin remove cordova-plugin-audioinput
   ```

2. **Re-add from your branch:**
   ```bash
   cordova plugin add https://github.com/exelerus/cordova-plugin-audioinput.git#YOUR_BRANCH_NAME
   ```

3. **Rebuild and run:**
   ```bash
   cordova run android  # or ios
   ```

## Troubleshooting

### Android Issues

- **Permission denied:** Make sure to grant microphone permission in the app
- **Build errors:** Ensure Android SDK and build tools are properly installed
- **Plugin not loading:** Check `platforms/android/app/src/main/assets/www/plugins/` for the plugin files

### iOS Issues

- **Signing errors:** Configure your development team in Xcode
- **Permission errors:** Check Info.plist for microphone usage description
- **Plugin not loading:** Clean and rebuild the project

## Clean Build

If you encounter issues, try a clean build:

```bash
cordova clean
rm -rf platforms/ plugins/ node_modules/
npm install
cordova platform add android  # or ios
cordova plugin add https://github.com/exelerus/cordova-plugin-audioinput.git#YOUR_BRANCH_NAME
cordova run android  # or ios
```
