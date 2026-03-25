const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');

test('index.d.ts supports AudioInput value and AudioInputOptions type for source installs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audioinput-types-'));
  const moduleRoot = path.join(tmpDir, 'node_modules', 'cordova-plugin-audioinput');

  fs.mkdirSync(path.join(moduleRoot, 'src'), { recursive: true });
  fs.copyFileSync(
    path.resolve(__dirname, '..', 'index.d.ts'),
    path.join(moduleRoot, 'index.d.ts'),
  );
  fs.copyFileSync(
    path.resolve(__dirname, '..', 'src', 'definitions.ts'),
    path.join(moduleRoot, 'src', 'definitions.ts'),
  );

  fs.writeFileSync(
    path.join(tmpDir, 'consumer.ts'),
    [
      "import { AudioInput } from 'cordova-plugin-audioinput';",
      "import type { AudioInputOptions } from 'cordova-plugin-audioinput';",
      '',
      'const options: AudioInputOptions = { sampleRate: 44100 };',
      '',
      'async function run() {',
      '  await AudioInput.start(options);',
      '}',
      '',
      'void run;',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(tmpDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'es2020',
          module: 'esnext',
          moduleResolution: 'node',
          strict: true,
          noEmit: true,
          lib: ['es2020', 'dom'],
        },
        files: ['consumer.ts'],
      },
      null,
      2,
    ),
  );

  const tscPath = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsc');
  const result = spawnSync(tscPath, ['-p', path.join(tmpDir, 'tsconfig.json')], {
    encoding: 'utf8',
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.strictEqual(
    result.status,
    0,
    `TypeScript compile failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
});
