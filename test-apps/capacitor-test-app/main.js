import { Capacitor } from '@capacitor/core';
import { AudioInput } from 'cordova-plugin-audioinput';

const MANUAL_CAPTURE_CFG = {
  sampleRate: 44100,
  bufferSize: 4096,
  channels: 1,
  format: 'PCM_16BIT',
  normalize: true,
  normalizationFactor: 32767.0,
};

let captureStarted = false;
let activeMode = null;
let audioDataCount = 0;
let audioBuffer = [];
let audioContext = null;
let sampleRate = MANUAL_CAPTURE_CFG.sampleRate;
let startTime = null;
let audioDataListener = null;
let audioErrorListener = null;
let benchmarkRunId = 0;
let benchmarkState = emptyBenchmarkState();

function emptyBenchmarkState() {
  return {
    runId: 0,
    running: false,
    config: null,
    durationSec: 0,
    timerId: null,
    totalChunks: 0,
    totalSamples: 0,
    firstChunkAtMs: 0,
    lastChunkAtMs: 0,
    intervalsMs: [],
    handlerDurationsMs: [],
  };
}

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
  const benchmarkRunning = benchmarkState.running;
  const manualRunning = captureStarted && activeMode === 'manual';

  document.getElementById('startBtn').disabled = captureStarted;
  document.getElementById('stopBtn').disabled = !manualRunning;
  document.getElementById('playBtn').disabled =
    captureStarted || audioBuffer.length === 0;
  document.getElementById('benchmarkStartBtn').disabled = captureStarted;
  document.getElementById('benchmarkStopBtn').disabled = !benchmarkRunning;
}

function updateStats() {
  document.getElementById('chunkCount').textContent = audioDataCount;

  if (captureStarted && startTime) {
    const duration = (Date.now() - startTime) / 1000;
    document.getElementById('duration').textContent = `${duration.toFixed(1)}s`;
  }
}

function resetLevelMeter() {
  document.getElementById('levelFill').style.width = '0%';
  document.getElementById('levelValue').textContent = '0%';
}

function updateLevel(data) {
  if (!data || data.length === 0) {
    return;
  }

  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i] * data[i];
  }

  const rms = Math.sqrt(sum / data.length);
  const level = Math.min(100, Math.round(rms * 100));

  document.getElementById('levelFill').style.width = `${level}%`;
  document.getElementById('levelValue').textContent = `${level}%`;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function avg(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) {
    return 0;
  }

  const mean = avg(values);
  const variance =
    values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const pos = ((p / 100) * (sorted.length - 1));
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) {
    return sorted[lower];
  }

  const weight = pos - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function extractAudioData(event) {
  if (!event) {
    return null;
  }

  const payload = event.data || event.detail?.data;
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload) || ArrayBuffer.isView(payload)) {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return new Float32Array(payload);
  }

  return null;
}

function chunkLength(data) {
  return data && typeof data.length === 'number' ? data.length : 0;
}

async function removeAudioListeners() {
  if (audioDataListener) {
    await audioDataListener.remove();
    audioDataListener = null;
  }

  if (audioErrorListener) {
    await audioErrorListener.remove();
    audioErrorListener = null;
  }
}

async function initAudioListeners() {
  await removeAudioListeners();

  audioDataListener = await AudioInput.addListener('audioData', event => {
    onAudioInput(event);
  });

  audioErrorListener = await AudioInput.addListener('audioError', event => {
    onAudioInputError(event);
  });
}

async function startCaptureEngine(captureCfg) {
  await initAudioListeners();
  await AudioInput.start(captureCfg);
  captureStarted = true;
  sampleRate = captureCfg.sampleRate;
  startTime = Date.now();
  updateButtons();
}

async function stopCaptureEngine() {
  await AudioInput.stop();
  await removeAudioListeners();
  captureStarted = false;
  activeMode = null;
  startTime = null;
  updateButtons();
}

function parseBenchmarkCfg() {
  const sampleRateInput = document.getElementById('benchSampleRate');
  const bufferSizeInput = document.getElementById('benchBufferSize');
  const channelsInput = document.getElementById('benchChannels');
  const durationInput = document.getElementById('benchDuration');
  const normalizeInput = document.getElementById('benchNormalize');

  const sampleRateValue = safeNumber(sampleRateInput.value);
  const bufferSizeValue = safeNumber(bufferSizeInput.value);
  const channelsValue = safeNumber(channelsInput.value);
  const durationSecValue = safeNumber(durationInput.value);

  if (
    sampleRateValue <= 0 ||
    bufferSizeValue <= 0 ||
    (channelsValue !== 1 && channelsValue !== 2)
  ) {
    throw new Error('Invalid benchmark capture settings');
  }

  if (durationSecValue < 3 || durationSecValue > 120) {
    throw new Error('Benchmark duration must be between 3 and 120 seconds');
  }

  return {
    durationSec: durationSecValue,
    captureCfg: {
      sampleRate: sampleRateValue,
      bufferSize: bufferSizeValue,
      channels: channelsValue,
      format: 'PCM_16BIT',
      normalize: normalizeInput.checked,
      normalizationFactor: 32767.0,
    },
  };
}

function expectedChunkMs(captureCfg) {
  return (captureCfg.bufferSize / captureCfg.sampleRate) * 1000;
}

function renderBenchmarkOutput(text) {
  document.getElementById('benchmarkOutput').textContent = text;
}

function renderBenchmarkRunning() {
  const cfg = benchmarkState.config;
  const expectedMs = expectedChunkMs(cfg);
  const observedMs = Math.max(
    benchmarkState.lastChunkAtMs - benchmarkState.firstChunkAtMs,
    0,
  );
  const intervalP95 = percentile(benchmarkState.intervalsMs, 95);
  const jitterP95 = percentile(
    benchmarkState.intervalsMs.map(value => Math.abs(value - expectedMs)),
    95,
  );

  const lines = [
    `Running benchmark #${benchmarkState.runId}`,
    `Config: ${cfg.sampleRate}Hz, buffer ${cfg.bufferSize}, channels ${cfg.channels}, normalize=${cfg.normalize}`,
    `Chunks: ${benchmarkState.totalChunks}, samples: ${benchmarkState.totalSamples}`,
    `Elapsed: ${(observedMs / 1000).toFixed(2)}s / target ${benchmarkState.durationSec}s`,
    `Expected chunk interval: ${expectedMs.toFixed(2)}ms`,
  ];

  if (benchmarkState.intervalsMs.length) {
    lines.push(
      `Observed interval avg/p95: ${avg(benchmarkState.intervalsMs).toFixed(2)}ms / ${intervalP95.toFixed(2)}ms`,
    );
    lines.push(`p95 absolute jitter: ${jitterP95.toFixed(2)}ms`);
  }

  renderBenchmarkOutput(lines.join('\n'));
}

function buildBenchmarkResult() {
  const cfg = benchmarkState.config;
  const expectedMs = expectedChunkMs(cfg);
  const observedMs = Math.max(
    benchmarkState.lastChunkAtMs - benchmarkState.firstChunkAtMs,
    0,
  );
  const expectedFromSamplesMs =
    (benchmarkState.totalSamples / cfg.sampleRate) * 1000;
  const absJitter = benchmarkState.intervalsMs.map(value =>
    Math.abs(value - expectedMs),
  );
  const handlerTotalMs = benchmarkState.handlerDurationsMs.reduce(
    (acc, value) => acc + value,
    0,
  );

  const lateChunkThresholdMs = expectedMs * 1.5;
  const lateChunks = benchmarkState.intervalsMs.filter(
    value => value > lateChunkThresholdMs,
  ).length;
  const minIntervalMs = benchmarkState.intervalsMs.length
    ? Math.min(...benchmarkState.intervalsMs)
    : 0;
  const maxIntervalMs = benchmarkState.intervalsMs.length
    ? Math.max(...benchmarkState.intervalsMs)
    : 0;

  return {
    runId: benchmarkState.runId,
    platform: Capacitor.getPlatform(),
    recordedAt: new Date().toISOString(),
    config: {
      sampleRate: cfg.sampleRate,
      bufferSize: cfg.bufferSize,
      channels: cfg.channels,
      normalize: cfg.normalize,
      durationSec: benchmarkState.durationSec,
    },
    totals: {
      chunks: benchmarkState.totalChunks,
      samples: benchmarkState.totalSamples,
      observedDurationMs: Number(observedMs.toFixed(2)),
      expectedFromSamplesMs: Number(expectedFromSamplesMs.toFixed(2)),
      driftMs: Number((observedMs - expectedFromSamplesMs).toFixed(2)),
      effectiveSampleRate: Number(
        (observedMs > 0
          ? benchmarkState.totalSamples / (observedMs / 1000)
          : 0
        ).toFixed(2),
      ),
    },
    intervals: {
      expectedMs: Number(expectedMs.toFixed(2)),
      avgMs: Number(avg(benchmarkState.intervalsMs).toFixed(2)),
      minMs: Number(minIntervalMs.toFixed(2)),
      maxMs: Number(maxIntervalMs.toFixed(2)),
      p50Ms: Number(percentile(benchmarkState.intervalsMs, 50).toFixed(2)),
      p95Ms: Number(percentile(benchmarkState.intervalsMs, 95).toFixed(2)),
      stdDevMs: Number(stdDev(benchmarkState.intervalsMs).toFixed(2)),
      avgJitterMs: Number(avg(absJitter).toFixed(2)),
      p95JitterMs: Number(percentile(absJitter, 95).toFixed(2)),
      lateChunks,
      lateChunkThresholdMs: Number(lateChunkThresholdMs.toFixed(2)),
    },
    handler: {
      avgMs: Number(avg(benchmarkState.handlerDurationsMs).toFixed(3)),
      p95Ms: Number(percentile(benchmarkState.handlerDurationsMs, 95).toFixed(3)),
      totalMs: Number(handlerTotalMs.toFixed(3)),
      busyRatioPct: Number(
        (observedMs > 0 ? (handlerTotalMs / observedMs) * 100 : 0).toFixed(2),
      ),
    },
  };
}

function renderBenchmarkResult(result, reason) {
  const summaryLines = [
    `Benchmark #${result.runId} finished${reason ? ` (${reason})` : ''}`,
    `Config: ${result.config.sampleRate}Hz / buffer ${result.config.bufferSize} / channels ${result.config.channels} / normalize=${result.config.normalize}`,
    `Chunks: ${result.totals.chunks}, samples: ${result.totals.samples}`,
    `Observed duration: ${result.totals.observedDurationMs}ms`,
    `Effective sample rate: ${result.totals.effectiveSampleRate} samples/s`,
    `Interval avg/p95/std: ${result.intervals.avgMs} / ${result.intervals.p95Ms} / ${result.intervals.stdDevMs} ms`,
    `Jitter avg/p95: ${result.intervals.avgJitterMs} / ${result.intervals.p95JitterMs} ms`,
    `Callback busy ratio: ${result.handler.busyRatioPct}%`,
    `Drift vs expected samples: ${result.totals.driftMs}ms`,
    '',
    JSON.stringify(result, null, 2),
  ];

  renderBenchmarkOutput(summaryLines.join('\n'));
}

window.getPermission = async function () {
  log('Requesting microphone permission...', 'info');

  try {
    const result = await AudioInput.checkMicrophonePermission();
    if (result.granted) {
      log('Permission already granted', 'success');
      return;
    }

    log('Requesting permission...', 'info');
    const permResult = await AudioInput.getMicrophonePermission();
    log(
      permResult.granted ? 'Permission granted' : 'Permission denied',
      permResult.granted ? 'success' : 'error',
    );
  } catch (error) {
    log(`Error with permissions: ${error.message}`, 'error');
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
    log(`Error checking permission: ${error.message}`, 'error');
  }
};

window.startCapture = async function () {
  if (captureStarted) {
    log('Capture or benchmark is already running', 'warning');
    return;
  }

  log('Starting audio capture...', 'info');
  activeMode = 'manual';
  audioDataCount = 0;
  audioBuffer = [];
  document.getElementById('duration').textContent = '0.0s';
  document.getElementById('chunkCount').textContent = '0';

  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      log('Web Audio API initialized', 'success');
    } catch (error) {
      log(`Web Audio API not available: ${error.message}`, 'error');
    }
  }

  try {
    await startCaptureEngine(MANUAL_CAPTURE_CFG);
    log('Capture started (44.1kHz, Mono, 16-bit)', 'success');
  } catch (error) {
    activeMode = null;
    captureStarted = false;
    updateButtons();
    log(`Failed to start capture: ${error.message}`, 'error');
  }
};

window.stopCapture = async function () {
  if (!captureStarted || activeMode !== 'manual') {
    log('Manual capture is not running', 'warning');
    return;
  }

  log('Stopping audio capture...', 'info');

  try {
    await stopCaptureEngine();

    const duration = audioBuffer.length / sampleRate;
    log('Capture stopped', 'success');
    log(`  Received ${audioDataCount} chunks`, 'info');
    log(`  Duration: ${duration.toFixed(2)} seconds`, 'info');
    log(`  Samples: ${audioBuffer.length}`, 'info');
    log('  Ready for playback!', 'info');

    resetLevelMeter();
  } catch (error) {
    log(`Failed to stop capture: ${error.message}`, 'error');
  }
};

window.runBenchmark = async function () {
  if (captureStarted) {
    log('Stop current capture before running a benchmark', 'warning');
    return;
  }

  let benchmarkCfg;
  try {
    benchmarkCfg = parseBenchmarkCfg();
  } catch (error) {
    log(error.message, 'error');
    return;
  }

  benchmarkState = emptyBenchmarkState();
  benchmarkRunId += 1;
  benchmarkState.runId = benchmarkRunId;
  benchmarkState.running = true;
  benchmarkState.config = benchmarkCfg.captureCfg;
  benchmarkState.durationSec = benchmarkCfg.durationSec;

  activeMode = 'benchmark';
  audioDataCount = 0;
  document.getElementById('chunkCount').textContent = '0';
  document.getElementById('duration').textContent = '0.0s';
  resetLevelMeter();
  updateButtons();

  renderBenchmarkOutput('Starting benchmark...');
  log(
    `Starting benchmark with ${benchmarkCfg.captureCfg.sampleRate}Hz / ${benchmarkCfg.captureCfg.bufferSize} buffer / ${benchmarkCfg.captureCfg.channels}ch for ${benchmarkCfg.durationSec}s`,
    'info',
  );

  try {
    await startCaptureEngine(benchmarkCfg.captureCfg);
    benchmarkState.timerId = window.setTimeout(() => {
      window.stopBenchmark('duration-reached');
    }, benchmarkCfg.durationSec * 1000);
    renderBenchmarkRunning();
    log('Benchmark capture started', 'success');
  } catch (error) {
    benchmarkState.running = false;
    activeMode = null;
    captureStarted = false;
    updateButtons();
    renderBenchmarkOutput('Benchmark failed to start.');
    log(`Failed to start benchmark: ${error.message}`, 'error');
  }
};

async function stopBenchmark(reason = 'manual-stop') {
  if (!benchmarkState.running || activeMode !== 'benchmark') {
    if (reason === 'manual-stop') {
      log('Benchmark is not running', 'warning');
    }
    return;
  }

  benchmarkState.running = false;
  if (benchmarkState.timerId) {
    clearTimeout(benchmarkState.timerId);
    benchmarkState.timerId = null;
  }

  log('Stopping benchmark...', 'info');

  try {
    await stopCaptureEngine();
  } catch (error) {
    log(`Failed to stop benchmark capture cleanly: ${error.message}`, 'error');
  }

  const result = buildBenchmarkResult();
  renderBenchmarkResult(result, reason);

  log(`Benchmark finished (${reason})`, 'success');
  log(
    `  Interval p95: ${result.intervals.p95Ms}ms, jitter p95: ${result.intervals.p95JitterMs}ms`,
    'info',
  );
  log(
    `  Busy ratio: ${result.handler.busyRatioPct}%, drift: ${result.totals.driftMs}ms`,
    'info',
  );

  resetLevelMeter();
  document.getElementById('duration').textContent = `${(
    result.totals.observedDurationMs / 1000
  ).toFixed(1)}s`;
  document.getElementById('chunkCount').textContent = String(result.totals.chunks);
}

window.stopBenchmark = stopBenchmark;

function onAudioInput(event) {
  const callbackStartedAt = performance.now();
  const data = extractAudioData(event);
  if (!data) {
    return;
  }

  if (activeMode === 'benchmark' && benchmarkState.running) {
    const now = performance.now();

    if (benchmarkState.firstChunkAtMs === 0) {
      benchmarkState.firstChunkAtMs = now;
    }

    if (benchmarkState.lastChunkAtMs !== 0) {
      benchmarkState.intervalsMs.push(now - benchmarkState.lastChunkAtMs);
    }

    benchmarkState.lastChunkAtMs = now;
    benchmarkState.totalChunks += 1;
    benchmarkState.totalSamples += chunkLength(data);

    audioDataCount = benchmarkState.totalChunks;
    document.getElementById('chunkCount').textContent = String(audioDataCount);

    const durationMs = Math.max(
      benchmarkState.lastChunkAtMs - benchmarkState.firstChunkAtMs,
      0,
    );
    document.getElementById('duration').textContent = `${(durationMs / 1000).toFixed(1)}s`;

    updateLevel(data);

    if (benchmarkState.totalChunks % 20 === 0) {
      renderBenchmarkRunning();
      log(
        `Benchmark chunk ${benchmarkState.totalChunks} (${(
          benchmarkState.totalSamples / benchmarkState.config.sampleRate
        ).toFixed(2)}s audio)`,
        'info',
      );
    }

    benchmarkState.handlerDurationsMs.push(performance.now() - callbackStartedAt);
    return;
  }

  if (activeMode !== 'manual') {
    return;
  }

  audioDataCount += 1;
  audioBuffer = audioBuffer.concat(Array.from(data));
  updateLevel(data);
  updateStats();

  if (audioDataCount % 20 === 0) {
    const duration = audioBuffer.length / sampleRate;
    log(`Recording: ${duration.toFixed(1)}s (${audioDataCount} chunks)`, 'info');
  }
}

function onAudioInputError(event) {
  const message = event.message || JSON.stringify(event);
  log(`Audio input error: ${message}`, 'error');

  if (benchmarkState.running && activeMode === 'benchmark') {
    window.stopBenchmark('audio-error');
  }
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
    const buffer = audioContext.createBuffer(1, audioBuffer.length, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < audioBuffer.length; i += 1) {
      channelData[i] = audioBuffer[i];
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    source.onended = function () {
      log('Playback finished', 'success');
    };

    source.start(0);
    log(
      `Playing ${(audioBuffer.length / sampleRate).toFixed(2)} seconds of audio`,
      'success',
    );
  } catch (error) {
    log(`Playback error: ${error.message}`, 'error');
  }
};

document.addEventListener('DOMContentLoaded', async function () {
  log('DOM Content Loaded', 'info');
  log(`Platform: ${Capacitor.getPlatform()}`, 'info');
  log(`Native: ${Capacitor.isNativePlatform()}`, 'info');
  updateButtons();

  setTimeout(async () => {
    try {
      await AudioInput.checkMicrophonePermission();
      log('AudioInput plugin loaded', 'success');
    } catch (error) {
      log('AudioInput plugin NOT found!', 'error');
      log('Make sure to install the plugin and sync platforms', 'warning');
      log(`Error: ${error.message}`, 'error');
    }
  }, 500);
});
