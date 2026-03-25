const assert = require('assert');
const test = require('node:test');
const Module = require('module');

function withAudioInput(testFn) {
  const originalLoad = Module._load;
  const originalWindow = global.window;
  const originalCordova = global.cordova;

  const events = [];
  const execCalls = [];

  Module._load = function (request, parent, isMain) {
    if (request === 'cordova/exec') {
      return function exec(success, error, service, action, args) {
        execCalls.push({ success, error, service, action, args });
      };
    }
    return originalLoad.apply(this, arguments);
  };

  global.window = {
    Int16Array,
    Float32Array,
    atob: b64 => Buffer.from(b64, 'base64').toString('binary'),
  };
  global.cordova = {
    fireWindowEvent: (name, payload) => {
      events.push({ name, payload });
    },
  };

  const modulePath = require.resolve('../www/audioInputCapture.js');
  delete require.cache[modulePath];
  const audioinput = require(modulePath);

  try {
    testFn({ audioinput, events, execCalls });
  } finally {
    delete require.cache[modulePath];
    Module._load = originalLoad;
    global.window = originalWindow;
    global.cordova = originalCordova;
  }
}

test('handles raw ArrayBuffer payload from native bridge', () => {
  withAudioInput(({ audioinput, events }) => {
    audioinput._handleInputParameters({ normalize: false });

    const pcm = new Int16Array([1000, -1000, 123, -321]);
    audioinput._audioInputEvent(pcm.buffer);

    const evt = events.find(e => e.name === 'audioinput');
    assert.ok(evt, 'audioinput event should be emitted');
    assert.ok(evt.payload.data instanceof Int16Array);
    assert.deepStrictEqual(Array.from(evt.payload.data), [1000, -1000, 123, -321]);
  });
});

test('keeps compatibility with legacy JSON payload from native bridge', () => {
  withAudioInput(({ audioinput, events }) => {
    audioinput._handleInputParameters({ normalize: false });

    audioinput._audioInputEvent({ data: '[1,-2,3,-4]' });

    const evt = events.find(e => e.name === 'audioinput');
    assert.ok(evt, 'audioinput event should be emitted');
    assert.ok(evt.payload.data instanceof Int16Array);
    assert.deepStrictEqual(Array.from(evt.payload.data), [1, -2, 3, -4]);
  });
});

test('emits state change events on start and stop', () => {
  withAudioInput(({ audioinput, events }) => {
    audioinput.start({
      normalize: true,
      streamToWebAudio: false,
    });
    audioinput.stop();

    const stateEvents = events.filter(e => e.name === 'audioinputstatechange');
    assert.deepStrictEqual(
      stateEvents.map(e => e.payload.state),
      ['capturing', 'stopped'],
    );
  });
});

test('uses metadata from structured binary payload events', () => {
  withAudioInput(({ audioinput, events }) => {
    audioinput._handleInputParameters({ normalize: false });

    const pcm = new Int16Array([11, 22, 33, 44]);
    audioinput._audioInputEvent({
      data: pcm.buffer,
      sampleRate: 16000,
      channels: 1,
      format: 'PCM_16BIT',
      timestamp: 1234,
    });

    const evt = events.find(e => e.name === 'audioinput');
    assert.ok(evt, 'audioinput event should be emitted');
    assert.strictEqual(evt.payload.sampleRate, 16000);
    assert.strictEqual(evt.payload.channels, 1);
    assert.strictEqual(evt.payload.format, 'PCM_16BIT');
    assert.strictEqual(evt.payload.timestamp, 1234);
  });
});

test('preserves FIFO order with queue compaction strategy', () => {
  withAudioInput(({ audioinput }) => {
    audioinput._audioDataQueue = [];
    audioinput._audioDataReadIndex = 0;

    const total = 300;
    for (let i = 0; i < total; i++) {
      audioinput._enqueueAudioData(new Int16Array([i]));
    }
    assert.strictEqual(audioinput._getAudioDataQueueLength(), total);

    for (let i = 0; i < total; i++) {
      const chunk = audioinput._dequeueAudioData();
      assert.ok(chunk, `chunk ${i} should exist`);
      assert.strictEqual(chunk[0], i);
    }

    assert.strictEqual(audioinput._getAudioDataQueueLength(), 0);
    assert.strictEqual(audioinput._dequeueAudioData(), null);
  });
});
