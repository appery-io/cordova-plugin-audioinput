import { Capacitor } from '@capacitor/core';
import { AudioInput } from 'cordova-plugin-audioinput';

let captureStarted = false;
let audioDataCount = 0;
let audioBuffer = [];
let audioContext = null;
let sampleRate = 44100;
let startTime = null;
let audioDataListener = null;
let audioErrorListener = null;

window.log = function (message, type = 'info') {
  const status = document.getElementById('status');
  const timestamp = new Date().toLocaleTimeString();
  const icon =
    {
      success: '✓',
      error: '✗',
      info: 'ℹ',
      warning: '⚠',
    }[type] || '';

  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.textContent = `[${timestamp}] ${icon} ${message}`;
  status.appendChild(entry);
  status.scrollTop = status.scrollHeight;

  console.log(`[${type}] ${message}`);
};

window.clearLog = function () {
  document.getElementById('status').innerHTML = '';
  log('Log cleared', 'info');
};

function updateButtons() {
  document.getElementById('startBtn').disabled = captureStarted;
  document.getElementById('stopBtn').disabled = !captureStarted;
  document.getElementById('playBtn').disabled = audioBuffer.length === 0;
}

function updateStats() {
  document.getElementById('chunkCount').textContent = audioDataCount;
  if (startTime && captureStarted) {
    const duration = (Date.now() - startTime) / 1000;
    document.getElementById('duration').textContent = duration.toFixed(1) + 's';
  }
}

function updateLevel(data) {
  if (!data || data.length === 0) return;

  // Calculate RMS level
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  const rms = Math.sqrt(sum / data.length);
  const level = Math.min(100, Math.round(rms * 100));

  document.getElementById('levelFill').style.width = level + '%';
  document.getElementById('levelValue').textContent = level + '%';
}

window.getPermission = async function () {
  log('Requesting microphone permission...', 'info');

  try {
    const result = await AudioInput.checkMicrophonePermission();
    if (result.granted) {
      log('Permission already granted', 'success');
    } else {
      log('Requesting permission...', 'info');
      const permResult = await AudioInput.getMicrophonePermission();
      log(
        permResult.granted ? 'Permission granted' : 'Permission denied',
        permResult.granted ? 'success' : 'error',
      );
    }
  } catch (error) {
    log('Error with permissions: ' + error.message, 'error');
  }
};

window.checkMicrophonePermission = async function () {
  log('Checking microphone permission...', 'info');

  try {
    const result = await AudioInput.checkMicrophonePermission();
    log(
      result.granted ? 'Has microphone permission' : 'No microphone permission',
      result.granted ? 'success' : 'warning',
    );
  } catch (error) {
    log('Error checking permission: ' + error.message, 'error');
  }
};

window.startCapture = async function () {
  log('Starting audio capture...', 'info');
  audioDataCount = 0;
  audioBuffer = [];
  startTime = Date.now();
  document.getElementById('duration').textContent = '0.0s';
  document.getElementById('chunkCount').textContent = '0';

  // Initialize Web Audio API
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      log('Web Audio API initialized', 'success');
    } catch (e) {
      log('Web Audio API not available: ' + e.message, 'error');
    }
  }

  const captureCfg = {
    sampleRate: 44100,
    bufferSize: 4096,
    channels: 1,
    format: 'PCM_16BIT',
    normalize: true,
    normalizationFactor: 32767.0,
  };
  sampleRate = captureCfg.sampleRate;

  try {
    // Remove old listeners if any
    if (audioDataListener) {
      await audioDataListener.remove();
    }
    if (audioErrorListener) {
      await audioErrorListener.remove();
    }

    // Add event listeners
    audioDataListener = await AudioInput.addListener('audioData', event => {
      onAudioInput(event);
    });

    audioErrorListener = await AudioInput.addListener('audioError', event => {
      onAudioInputError(event);
    });

    // Start capture
    await AudioInput.start(captureCfg);

    captureStarted = true;
    updateButtons();
    log('Capture started (44.1kHz, Mono, 16-bit)', 'success');
  } catch (error) {
    log('Failed to start capture: ' + error.message, 'error');
  }
};

window.stopCapture = async function () {
  log('Stopping audio capture...', 'info');

  try {
    await AudioInput.stop();

    // Remove listeners
    if (audioDataListener) {
      await audioDataListener.remove();
      audioDataListener = null;
    }
    if (audioErrorListener) {
      await audioErrorListener.remove();
      audioErrorListener = null;
    }

    const duration = audioBuffer.length / sampleRate;
    log('Capture stopped', 'success');
    log(`  Received ${audioDataCount} chunks`, 'info');
    log(`  Duration: ${duration.toFixed(2)} seconds`, 'info');
    log(`  Samples: ${audioBuffer.length}`, 'info');
    log('  Ready for playback!', 'info');

    captureStarted = false;
    startTime = null;
    updateButtons();

    // Reset level meter
    document.getElementById('levelFill').style.width = '0%';
    document.getElementById('levelValue').textContent = '0%';
  } catch (error) {
    log('Failed to stop capture: ' + error.message, 'error');
  }
};

function onAudioInput(event) {
  audioDataCount++;

  if (event.data) {
    // Store audio data for playback
    audioBuffer = audioBuffer.concat(Array.from(event.data));

    // Update level meter
    updateLevel(event.data);

    // Update stats
    updateStats();

    // Log periodically
    if (audioDataCount % 20 === 0) {
      const duration = audioBuffer.length / sampleRate;
      log(
        `Recording: ${duration.toFixed(1)}s (${audioDataCount} chunks)`,
        'info',
      );
    }
  }
}

function onAudioInputError(event) {
  log(
    'Audio input error: ' + (event.message || JSON.stringify(event)),
    'error',
  );
}

window.playback = function () {
  if (audioBuffer.length === 0) {
    log('No audio data to play', 'error');
    return;
  }

  if (!audioContext) {
    log('Web Audio API not available', 'error');
    return;
  }

  log('Playing back recorded audio...', 'info');

  try {
    // Create audio buffer
    const buffer = audioContext.createBuffer(1, audioBuffer.length, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Copy audio data
    for (let i = 0; i < audioBuffer.length; i++) {
      channelData[i] = audioBuffer[i];
    }

    // Create source and play
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    source.onended = function () {
      log('Playback finished', 'success');
    };

    source.start(0);
    log(
      'Playing ' +
        (audioBuffer.length / sampleRate).toFixed(2) +
        ' seconds of audio',
      'success',
    );
  } catch (e) {
    log('Playback error: ' + e.message, 'error');
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async function () {
  log('DOM Content Loaded', 'info');
  log(`Platform: ${Capacitor.getPlatform()}`, 'info');
  log(`Native: ${Capacitor.isNativePlatform()}`, 'info');

  // Check for plugin
  setTimeout(async () => {
    try {
      // Try to check permissions to verify plugin is loaded
      await AudioInput.checkMicrophonePermission();
      log('AudioInput plugin loaded', 'success');
    } catch (error) {
      log('AudioInput plugin NOT found!', 'error');
      log('Make sure to install the plugin and sync platforms', 'warning');
      log('Error: ' + error.message, 'error');
    }
  }, 500);
});
