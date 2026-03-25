# cordova-plugin-audioinput

[![npm version](https://img.shields.io/npm/v/cordova-plugin-audioinput?logo=npm)](https://www.npmjs.com/package/cordova-plugin-audioinput)
[![npm downloads](https://img.shields.io/npm/dm/cordova-plugin-audioinput?logo=npm)](https://www.npmjs.com/package/cordova-plugin-audioinput)
[![license](https://img.shields.io/npm/l/cordova-plugin-audioinput)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/edimuj/cordova-plugin-audioinput?style=social)](https://github.com/edimuj/cordova-plugin-audioinput)

Real-time microphone capture for **Cordova** and **Capacitor** with a single package.

Use this plugin when you need low-latency PCM chunks in JavaScript (streaming, VAD, waveform analysis, custom DSP) and when `MediaRecorder` is too high-level or too delayed.

## Why This Plugin Exists

Mobile apps often need raw, continuous microphone frames, not just encoded audio blobs.

This plugin gives you:
- low-latency PCM chunk streaming to JS
- file recording support (WAV)
- one package for Cordova + Capacitor
- Android, iOS, and web implementations

## Features

- Real-time PCM streaming (`audioData` / `audioinput` events)
- Cordova native bridge now streams binary PCM payloads (ArrayBuffer) for lower bridge overhead
- Optional normalization (`-1.0 .. 1.0`) for easier JS DSP
- Optional WAV recording via `fileUrl`
- Microphone permission helpers
- TypeScript definitions for Capacitor
- Cordova Web Audio integration (`streamToWebAudio`, `connect`, `disconnect`)

## Platform Support

| Platform | Cordova | Capacitor |
| --- | --- | --- |
| Android | ✅ | ✅ |
| iOS | ✅ | ✅ |
| Browser | ✅ | ✅ |

Notes:
- Capacitor Android build config defaults to `minSdkVersion 24`.
- Capacitor iOS podspec uses deployment target `14.0`.
- Web support is intended for development/lightweight browser use-cases.

## Installation

### Cordova

```bash
cordova plugin add cordova-plugin-audioinput
```

### Capacitor

```bash
npm install cordova-plugin-audioinput
npx cap sync
```

## iOS Permission String

Ensure `NSMicrophoneUsageDescription` exists in your app `Info.plist`.

Example:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access to capture audio.</string>
```

## Quick Start (Capacitor)

```ts
import { AudioInput } from 'cordova-plugin-audioinput';

await AudioInput.initialize({
  sampleRate: 44100,
  bufferSize: 16384,
  channels: 1,
  format: 'PCM_16BIT',
  normalize: true,
});

const permission = await AudioInput.checkMicrophonePermission();
if (!permission.granted) {
  const requested = await AudioInput.getMicrophonePermission();
  if (!requested.granted) throw new Error('Microphone permission denied');
}

const audioDataHandle = await AudioInput.addListener('audioData', event => {
  // event.data is number[]
  console.log('samples:', event.data.length);
});

const errorHandle = await AudioInput.addListener('audioError', event => {
  console.error('audio error:', event.message);
});

await AudioInput.start();

// ... later
await AudioInput.stop();
await audioDataHandle.remove();
await errorHandle.remove();
```

### Capacitor File Recording

```ts
import { AudioInput } from 'cordova-plugin-audioinput';

await AudioInput.addListener('audioInputFinished', event => {
  console.log('WAV file:', event.fileUrl);
});

await AudioInput.start({
  sampleRate: 16000,
  channels: 1,
  format: 'PCM_16BIT',
  fileUrl: 'file:///path/to/recording.wav',
});

// stop() resolves when capture stops.
// fileUrl is delivered via audioInputFinished event.
await AudioInput.stop();
```

## Quick Start (Cordova)

```js
function onAudioInput(event) {
  console.log('samples:', event.data.length);
}

function onAudioInputError(event) {
  console.error('audio error:', event.message);
}

window.addEventListener('audioinput', onAudioInput, false);
window.addEventListener('audioinputerror', onAudioInputError, false);

audioinput.checkMicrophonePermission(function (hasPermission) {
  if (hasPermission) {
    startCapture();
    return;
  }

  audioinput.getMicrophonePermission(function (granted) {
    if (granted) startCapture();
  });
});

function startCapture() {
  audioinput.start({
    sampleRate: 44100,
    bufferSize: 16384,
    channels: 1,
    format: audioinput.FORMAT.PCM_16BIT,
    normalize: true,
  });
}

function stopCapture() {
  audioinput.stop(function (fileUrl) {
    if (fileUrl) console.log('Saved file:', fileUrl);
  });
}
```

## API (Capacitor)

### Methods

- `initialize(options: AudioInputOptions): Promise<void>`
- `checkMicrophonePermission(): Promise<{ granted: boolean }>`
- `getMicrophonePermission(): Promise<{ granted: boolean }>`
- `start(options?: AudioInputOptions): Promise<void>`
- `stop(): Promise<{ fileUrl?: string }>`
- `isCapturing(): Promise<{ capturing: boolean }>`
- `getCfg(): Promise<AudioInputOptions>`
- `removeAllListeners(): Promise<void>`

### Events

- `audioData` → `{ data: number[], sampleRate?, channels?, format?, timestamp? }`
- `audioError` → `{ message: string, code?: string }`
- `audioInputFinished` → `{ fileUrl: string, timestamp?: number }`
- `stateChange` → `{ state: 'idle' | 'capturing' | 'stopped' | 'error', message?, timestamp? }`

## API (Cordova)

### Methods

- `audioinput.initialize(captureCfg, onComplete)`
- `audioinput.checkMicrophonePermission(callback)`
- `audioinput.getMicrophonePermission(callback)`
- `audioinput.start(captureCfg)`
- `audioinput.stop(onStopped)`
- `audioinput.isCapturing()`
- `audioinput.getCfg()`
- `audioinput.connect(audioNode)`
- `audioinput.disconnect()`
- `audioinput.getAudioContext()`

### Events

- `audioinput` → `{ data, sampleRate?, channels?, format?, timestamp? }`
- `audioinputerror` → `{ message }`
- `audioinputfinished` → `{ file, timestamp? }`
- `audioinputstatechange` → `{ state, message?, timestamp? }`

## Configuration (`AudioInputOptions` / `captureCfg`)

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `sampleRate` | `number` | `44100` | Common values: `8000`, `16000`, `22050`, `44100`, `48000` |
| `bufferSize` | `number` | `16384` | Power-of-two is recommended |
| `channels` | `1 \| 2` | `1` | Mono or stereo |
| `format` | `'PCM_16BIT' \| 'PCM_8BIT'` | `'PCM_16BIT'` | `PCM_16BIT` recommended |
| `normalize` | `boolean` | `true` | Normalize to float range `-1..1` |
| `normalizationFactor` | `number` | `32767.0` | Used when `normalize=true` |
| `audioSourceType` | `number` | `0` | See source constants |
| `fileUrl` | `string` | `undefined` | Record to WAV file instead of streaming events |

Cordova-only additions:

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `streamToWebAudio` | `boolean` | `false` | Pipe captured audio through Web Audio API |
| `audioContext` | `AudioContext` | auto | Provide your own context |
| `concatenateMaxChunks` | `number` | `10` | Queue merge tuning |

## Constants

### Capacitor

```ts
import { SampleRate, AudioSourceType } from 'cordova-plugin-audioinput';
```

### Cordova

```js
audioinput.SAMPLERATE
audioinput.CHANNELS
audioinput.FORMAT
audioinput.AUDIOSOURCE_TYPE
```

## Performance Tips

- Prefer `PCM_16BIT` unless you have a hard requirement for `PCM_8BIT`.
- Start with mono (`channels: 1`) and `sampleRate: 16000` for speech workloads.
- Use larger `bufferSize` for lower CPU usage and smaller `bufferSize` for lower latency.
- If you only need files, set `fileUrl` and skip streaming processing.
- Run `npm run bench:js` for a quick synthetic JS hot-path benchmark.

## Known Limitations

- Device support for sample-rate/channel combinations varies.
- Bluetooth microphone routing behavior varies by OS/device.
- `streamToWebAudio` is a Cordova API surface (via `window.audioinput`).
- Web implementation does not persist `fileUrl` recordings (it emits an `audioError` warning and continues streaming).

## Demo / Test Apps

- [app-audioinput-demo](https://github.com/edimuj/app-audioinput-demo)
- Local harnesses in [`test-apps`](test-apps):
  - `test-apps/cordova-test-app`
  - `test-apps/capacitor-test-app`

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Contributing

PRs are welcome. Please keep backward compatibility for existing Cordova integrations.

## License

MIT — see [LICENSE](LICENSE).
