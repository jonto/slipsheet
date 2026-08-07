// The markup contract is the only thing the two packages share, and once it is
// written into a host application's database it is effectively permanent. These
// tests pin its shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkup } from '../packages/hugerte/src/index.js';

test('emits the required contract: .slipsheet class and data-src', () => {
  const html = renderMarkup({ src: 'https://cdn.example.com/a.pdf' });
  assert.match(html, /<div class="slipsheet"/);
  assert.match(html, /data-src="https:\/\/cdn\.example\.com\/a\.pdf"/);
});

test('always nests a download link, the no-JS fallback', () => {
  const html = renderMarkup({ src: '/r.pdf', pages: 3, filename: 'r.pdf' });
  assert.match(html, /<a href="\/r\.pdf" download="r\.pdf">/);
  assert.match(html, /<\/a><\/div>$/);
});

test('link href always matches data-src', () => {
  const src = '/deep/path/report.pdf';
  const html = renderMarkup({ src, filename: 'report.pdf' });
  const dataSrc = html.match(/data-src="([^"]+)"/)[1];
  const href = html.match(/<a href="([^"]+)"/)[1];
  assert.equal(href, dataSrc, 'a mismatch would download a different file than the viewer renders');
});

test('marks the embed non-editable so the editor cannot corrupt it', () => {
  // Without this the caret can enter the embed and subsequent typing nests
  // body content inside it, which the viewer then wipes via replaceChildren.
  assert.match(renderMarkup({ src: '/a.pdf' }), /contenteditable="false"/);
});

test('omits optional attributes rather than emitting empty ones', () => {
  const html = renderMarkup({ src: '/a.pdf' });
  assert.doesNotMatch(html, /data-pages=/);
  assert.doesNotMatch(html, /data-filename=/);
  assert.doesNotMatch(html, /download=/);
});

test('rejects non-positive-integer page counts instead of emitting them', () => {
  for (const pages of [0, -1, 2.5, '12', null, undefined, NaN]) {
    assert.doesNotMatch(
      renderMarkup({ src: '/a.pdf', pages }),
      /data-pages=/,
      `page count ${String(pages)} should not reach the markup`,
    );
  }
  assert.match(renderMarkup({ src: '/a.pdf', pages: 12 }), /data-pages="12"/);
});

test('link text reports the page count when known', () => {
  assert.match(renderMarkup({ src: '/a.pdf', pages: 12, filename: 'q3.pdf' }), />Download q3\.pdf \(12 pages\)</);
  assert.match(renderMarkup({ src: '/a.pdf', filename: 'q3.pdf' }), />Download q3\.pdf</);
  assert.match(renderMarkup({ src: '/a.pdf' }), />Download PDF</);
});

// Values reaching renderMarkup come from an upload handler, which in most
// deployments means a user-supplied filename. Escaping is a security boundary.

test('escapes HTML in the filename', () => {
  const html = renderMarkup({ src: '/a.pdf', filename: '"><script>alert(1)</script>' });
  assert.doesNotMatch(html, /<script>/, 'filename must not break out into markup');
  assert.match(html, /&lt;script&gt;/);
});

test('escapes HTML in the src', () => {
  const html = renderMarkup({ src: '"><img src=x onerror=alert(1)>' });
  assert.doesNotMatch(html, /<img/, 'src must not break out of the attribute');
});

test('escapes quotes so attributes cannot be terminated early', () => {
  const html = renderMarkup({ src: '/a.pdf', filename: 'a"b' });
  const attrCount = (html.match(/"/g) || []).length;
  assert.equal(attrCount % 2, 0, 'unbalanced quotes mean an attribute was terminated early');
  assert.doesNotMatch(html, /filename="a"b"/);
});
