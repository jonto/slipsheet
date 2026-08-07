// The plugin's correctness depends on two editor settings the plugin itself
// cannot enforce. If the docs stop mentioning them, adopters ship broken
// fallback links and never find out. These assertions keep the docs honest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const SNIPPET_FILES = [
  ['README.md', '../README.md'],
  ['packages/hugerte/README.md', '../packages/hugerte/README.md'],
  ['examples/editor.html', '../examples/editor.html'],
  ['index.html', '../index.html'],
];

for (const [label, rel] of SNIPPET_FILES) {
  test(`${label}: editor config snippet requires convert_urls: false`, () => {
    const text = read(rel);
    // Only check files that actually show an editor init snippet.
    if (!/slipsheet_upload_handler|extended_valid_elements/.test(text)) return;
    assert.match(
      text,
      /convert_urls:\s*false/,
      `${label} shows an editor config without convert_urls: false. ` +
        'Without it the editor rewrites the fallback href but not data-src, ' +
        'so the download link and the viewer disagree after a save.',
    );
  });

  test(`${label}: editor config snippet allows contenteditable through the serializer`, () => {
    const text = read(rel);
    if (!/extended_valid_elements/.test(text)) return;
    // The value is often wrapped onto its own line, so look ahead a bounded
    // distance rather than restricting the match to a single line.
    assert.match(
      text,
      /extended_valid_elements[\s\S]{0,200}?contenteditable/,
      `${label} lists extended_valid_elements without contenteditable, ` +
        'so the editor will strip the attribute that keeps the embed atomic.',
    );
  });
}

test('ARCHITECTURE.md documents both required editor settings', () => {
  const arch = read('../ARCHITECTURE.md');
  assert.match(arch, /convert_urls/, 'host integration section omits convert_urls');
  assert.match(arch, /extended_valid_elements/, 'host integration section omits extended_valid_elements');
});
