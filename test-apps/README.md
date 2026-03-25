# Test Apps for cordova-plugin-audioinput

This directory contains minimal test applications for testing the cordova-plugin-audioinput on real mobile devices.

## Available Test Apps

### 1. Cordova Test App (`cordova-test-app/`)
A traditional Apache Cordova application for testing the plugin.

**Quick Start:**
```bash
cd cordova-test-app
npm install
cordova platform add android  # or ios
cordova plugin add https://github.com/exelerus/cordova-plugin-audioinput.git#YOUR_BRANCH_NAME
cordova run android  # or ios
```

See [cordova-test-app/README.md](cordova-test-app/README.md) for detailed instructions.

### 2. Capacitor Test App (`capacitor-test-app/`)
A modern Capacitor application for testing the plugin.

**Quick Start:**
```bash
cd capacitor-test-app
npm install
npm run build
npx cap add android  # or ios
npm install https://github.com/exelerus/cordova-plugin-audioinput.git#YOUR_BRANCH_NAME
npx cap sync
npm run android  # or ios
```

See [capacitor-test-app/README.md](capacitor-test-app/README.md) for detailed instructions.

## Which Test App Should I Use?

### Use Cordova Test App if:
- You're familiar with traditional Cordova development
- Your main app uses Cordova
- You want to test the classic Cordova plugin behavior

### Use Capacitor Test App if:
- You're using or planning to use Capacitor
- You want a modern development experience
- You need better integration with native IDEs
- You want faster build times

## Testing a Specific Branch

Both test apps can install the plugin directly from a GitHub branch:

**For Cordova:**
```bash
cordova plugin add https://github.com/exelerus/cordova-plugin-audioinput.git#BRANCH_NAME
```

**For Capacitor:**
```bash
npm install https://github.com/exelerus/cordova-plugin-audioinput.git#BRANCH_NAME
npx cap sync
```

Replace `BRANCH_NAME` with your actual branch name, for example:
```
claude/analyze-plugin-capacitor-011CUyE1dcag6xBDyjquHEBY
```

## Testing Workflow

1. **Make changes** to your plugin in a feature branch
2. **Push the branch** to GitHub
3. **Install the plugin** from the branch in a test app
4. **Build and run** on a real device
5. **Test the functionality** using the test UI
6. **Iterate:** Make more changes, push, and reinstall

For performance-focused work, run the on-device benchmark panel in either app and compare JSON outputs between branches/devices.

## Features of the Test Apps

Both test apps include:

- ✅ **Permission Testing** - Request and check microphone permissions
- ✅ **Audio Capture** - Start and stop audio capture
- ✅ **Playback Check** - Play manual recording output
- ✅ **On-Device Benchmarking** - Timed benchmark runs with configurable capture settings
- ✅ **Real-time Feedback** - See audio data events in real-time
- ✅ **Error Handling** - Display any errors that occur
- ✅ **Plugin Detection** - Verify the plugin is loaded correctly
- ✅ **Simple UI** - Easy-to-use interface for testing

## Benchmark Workflow

Use the **On-Device Benchmark** panel in either test app to measure practical runtime behavior:

1. Select `sampleRate`, `bufferSize`, `channels`, `normalize`, and `duration`
2. Run benchmark and wait for completion
3. Collect benchmark JSON payload from the UI
4. Compare key metrics across plugin branches and devices:
   - chunk interval avg/p95/stddev
   - p95 jitter
   - effective sample rate
   - callback busy ratio
   - drift vs sample-count-derived duration

## Requirements

### For Android Development:
- Node.js (v16 or higher)
- Java JDK 17
- Android Studio with Android SDK
- Android device or emulator

### For iOS Development (macOS only):
- Node.js (v16 or higher)
- Xcode 14 or higher
- CocoaPods
- iOS device or simulator

## Troubleshooting

### Plugin Not Loading
```bash
# For Cordova
cordova plugin remove cordova-plugin-audioinput
cordova plugin add https://github.com/exelerus/cordova-plugin-audioinput.git#YOUR_BRANCH
cordova clean

# For Capacitor
npm uninstall cordova-plugin-audioinput
npm install https://github.com/exelerus/cordova-plugin-audioinput.git#YOUR_BRANCH
npm run build
npx cap sync
```

### Build Errors
```bash
# For Cordova
rm -rf platforms/ plugins/ node_modules/
npm install
cordova platform add android  # or ios
# ... re-add plugin and rebuild

# For Capacitor
rm -rf dist/ android/ ios/ node_modules/
npm install
npm run build
npx cap add android  # or ios
# ... re-add plugin and sync
```

### Permission Issues
Make sure to:
1. Grant microphone permission when prompted
2. Check device settings if permission was denied
3. For iOS, verify the Info.plist has the microphone usage description

## Notes

- These are **test apps only** - not production examples
- Keep them updated when the plugin API changes
- Both apps test the same plugin functionality
- Results should be consistent across both platforms

## Need Help?

- Check the individual README files in each test app directory
- Review the plugin's main README.md
- Check the plugin source code in the `src/` directory
- Look at the demo HTML files in the `demo/` directory

## Contributing

If you find issues with these test apps or want to improve them:
1. Test your changes with both apps
2. Update the documentation
3. Submit a pull request

---

**Happy Testing! 🎤**
