// The two packages ship independently and share no runtime. Nothing but these
// assertions stops them drifting apart between releases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkup } from '../packages/hugerte/src/index.js';
import { Slipsheet } from '../packages/viewer/src/index.js';

test('the viewer selector matches the class the plugin writes', () => {
  const html = renderMarkup({ src: '/a.pdf' });
  const cls = Slipsheet.defaults.selector.replace(/^\./, '');
  assert.match(
    html,
    new RegExp(`class="[^"]*\\b${cls}\\b`),
    `viewer looks for "${Slipsheet.defaults.selector}" but the plugin does not emit it`,
  );
});

test('the plugin emits every attribute the viewer reads', () => {
  const viewerSrc = readViewer();
  const html = renderMarkup({ src: '/a.pdf', pages: 5, filename: 'a.pdf' });

  // Attributes the viewer reads off the host element, as opposed to the
  // data-slipsheet-* attributes it writes back as state.
  const consumed = [...viewerSrc.matchAll(/dataset\.(src|pages|filename)\b/g)].map((m) => m[1]);
  assert.ok(consumed.length > 0, 'expected the viewer to read some data-* attributes');

  for (const attr of new Set(consumed)) {
    assert.match(
      html,
      new RegExp(`data-${attr}=`),
      `viewer reads data-${attr} but the plugin never writes it`,
    );
  }
});

test('the viewer never overwrites a contract attribute with its own state', () => {
  const viewerSrc = readViewer();

  // Everything the viewer assigns to dataset. State must live under the
  // data-slipsheet-* namespace; the contract owns the bare data-src,
  // data-pages and data-filename, and hydration must leave them intact so
  // the markup still means the same thing if the viewer is removed.
  const written = [...viewerSrc.matchAll(/dataset\.(\w+)\s*=/g)].map((m) => m[1]);
  assert.ok(written.length > 0, 'expected the viewer to write state attributes');

  const contractOwned = ['src', 'pages', 'filename'];
  for (const name of new Set(written)) {
    assert.ok(
      !contractOwned.includes(name),
      `viewer writes dataset.${name}, clobbering the stored contract attribute data-${name}`,
    );
    assert.match(
      name,
      /^slipsheet[A-Z]/,
      `viewer writes dataset.${name}, which is outside the data-slipsheet-* namespace`,
    );
  }
});

function readViewer() {
  return require$('../packages/viewer/src/index.js');
}

// Small helper: read source text rather than importing, so we can assert on
// how the viewer uses the DOM without needing a DOM.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
function require$(rel) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}
