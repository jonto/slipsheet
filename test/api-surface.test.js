// ARCHITECTURE.md commits the plugin to a fixed list of editor APIs. That list
// is the entire reason one codebase runs on both HugeRTE 1.x and TinyMCE 6, and
// it is the kind of promise that erodes silently: a convenient undocumented call
// works today and strands adopters two releases later. This test is the guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PERMITTED = new Set([
  'PluginManager.add',
  'ui.registry.addButton',
  'ui.registry.addIcon',
  'windowManager.open',
  'notificationManager.open',
  'insertContent',
  'options.get',
  'options.register',
]);

const src = readFileSync(
  fileURLToPath(new URL('../packages/hugerte/src/index.js', import.meta.url)),
  'utf8',
);

test('the plugin calls no editor API outside the documented list', () => {
  // Match calls on the editor instance or the editor global, e.g.
  // editor.insertContent(...) or editor.ui.registry.addButton(...)
  const calls = [...src.matchAll(/\beditor\.((?:\w+\.)*\w+)\s*\(/g)].map((m) => m[1]);
  const unexpected = [...new Set(calls)].filter((c) => !PERMITTED.has(c));

  assert.deepEqual(
    unexpected,
    [],
    `Unpermitted editor API used: ${unexpected.join(', ')}.\n` +
      'Either drop it, or open an issue to discuss changing the compatibility ' +
      'commitment in ARCHITECTURE.md. Do not silently widen the surface.',
  );
});

test('the documented list and ARCHITECTURE.md have not drifted apart', () => {
  const arch = readFileSync(
    fileURLToPath(new URL('../ARCHITECTURE.md', import.meta.url)),
    'utf8',
  );
  const section = arch.split('### Compatibility commitments')[1]?.split('---')[0] ?? '';
  assert.ok(section, 'could not find the Compatibility commitments section');

  for (const api of PERMITTED) {
    const leaf = api.split('.').pop();
    assert.ok(
      section.includes(leaf),
      `${api} is permitted by this test but absent from ARCHITECTURE.md`,
    );
  }
});

test('the plugin registers against both editor globals', () => {
  // HugeRTE and TinyMCE 6 expose the same plugin API under different globals.
  // Losing either branch silently drops support for that editor.
  assert.match(src, /window\.hugerte/, 'lost the HugeRTE global');
  assert.match(src, /window\.tinymce/, 'lost the TinyMCE 6 global');
});

test('the plugin declares no npm dependencies', () => {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL('../packages/hugerte/package.json', import.meta.url)), 'utf8'),
  );
  assert.equal(pkg.dependencies, undefined, 'the plugin must stay dependency-free');
});

test('the viewer declares no npm dependencies', () => {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL('../packages/viewer/package.json', import.meta.url)), 'utf8'),
  );
  assert.equal(pkg.dependencies, undefined, 'PDF.js is loaded at runtime, never installed');
});
