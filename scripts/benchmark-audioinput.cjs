const { performance } = require('perf_hooks');
const Module = require('module');

function loadAudioInput() {
  const originalLoad = Module._load;
  const originalWindow = global.window;
  const originalCordova = global.cordova;

  Module._load = function (request, parent, isMain) {
    if (request === 'cordova/exec') {
      return function noopExec() {};
    }
    return originalLoad.apply(this, arguments);
  };

  global.window = {
    Int16Array,
    Float32Array,
    atob: b64 => Buffer.from(b64, 'base64').toString('binary'),
  };
  global.cordova = {
    fireWindowEvent: () => {},
  };

  const modulePath = require.resolve('../www/audioInputCapture.js');
  delete require.cache[modulePath];
  const audioinput = require(modulePath);

  return {
    audioinput,
    teardown() {
      delete require.cache[modulePath];
      Module._load = originalLoad;
      global.window = originalWindow;
      global.cordova = originalCordova;
    },
  };
}

function bench(name, fn, warmupRuns = 3, runs = 8) {
  for (let i = 0; i < warmupRuns; i++) fn();

  const samples = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  return { name, avg, min, max };
}

function printResult(result, unit) {
  const pad = n => n.toFixed(2).padStart(8);
  console.log(
    `${result.name.padEnd(40)} avg=${pad(result.avg)}ms min=${pad(result.min)}ms max=${pad(result.max)}ms ${unit || ''}`,
  );
}

function run() {
  const { audioinput, teardown } = loadAudioInput();
  try {
    const CHUNK_SIZE = 4096;
    const CHUNKS = 1200;
    const SAMPLE_RATE = 44100;

    console.log('audioinput JS benchmark');
    console.log(
      `config: chunkSize=${CHUNK_SIZE}, chunks=${CHUNKS}, sampleRate=${SAMPLE_RATE}`,
    );
    console.log('');

    audioinput._handleInputParameters({
      normalize: true,
      normalizationFactor: 32767.0,
      channels: 1,
      sampleRate: SAMPLE_RATE,
      bufferSize: CHUNK_SIZE,
      concatenateMaxChunks: 10,
    });

    const source = new Int16Array(CHUNK_SIZE);
    for (let i = 0; i < CHUNK_SIZE; i++) {
      source[i] = ((i * 1103) % 65536) - 32768;
    }

    const normalizeRes = bench('normalize Int16 -> Float32', () => {
      for (let i = 0; i < CHUNKS; i++) {
        const out = audioinput._normalizeToTyped(source);
        audioinput._releaseBuffer('float32', out);
      }
    });
    const normalizedSamplesPerSec =
      (CHUNKS * CHUNK_SIZE) / (normalizeRes.avg / 1000);
    printResult(
      normalizeRes,
      `~${Math.round(normalizedSamplesPerSec).toLocaleString()} samples/s`,
    );

    const queueRes = bench('queue enqueue+dequeue', () => {
      audioinput._audioDataQueue = [];
      audioinput._audioDataReadIndex = 0;
      for (let i = 0; i < CHUNKS; i++) {
        audioinput._enqueueAudioData(source);
      }
      while (audioinput._getAudioDataQueueLength() > 0) {
        audioinput._dequeueAudioData();
      }
    });
    const queueOpsPerSec = (CHUNKS * 2) / (queueRes.avg / 1000);
    printResult(
      queueRes,
      `~${Math.round(queueOpsPerSec).toLocaleString()} queue ops/s`,
    );

    audioinput._audioContext = {
      createBuffer: (channels, frames, sampleRate) => {
        const channelData = Array.from({ length: channels }, () => new Float32Array(frames));
        return {
          duration: frames / sampleRate,
          getChannelData: channel => channelData[channel],
        };
      },
      createBufferSource: () => ({
        connect: () => {},
        start: () => {},
      }),
    };
    audioinput._micGainNode = {};
    audioinput._cfg.channels = 2;

    const stereoFrames = CHUNK_SIZE;
    const stereoData = new Float32Array(stereoFrames * 2);
    for (let i = 0; i < stereoFrames; i++) {
      stereoData[i * 2] = Math.sin((i / stereoFrames) * Math.PI * 2);
      stereoData[i * 2 + 1] = Math.cos((i / stereoFrames) * Math.PI * 2);
    }

    const playRes = bench('stereo deinterleave+buffer copy', () => {
      for (let i = 0; i < CHUNKS; i++) {
        audioinput._playAudio(stereoData);
      }
    });
    const framesPerSec = (CHUNKS * stereoFrames) / (playRes.avg / 1000);
    printResult(playRes, `~${Math.round(framesPerSec).toLocaleString()} frames/s`);
  } finally {
    teardown();
  }
}

run();
