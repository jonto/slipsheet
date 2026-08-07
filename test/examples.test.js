// Every example shipped a data-pages="6" for a 14-page PDF until it was caught
// by eye, months later. Declared metadata that nothing verifies will drift.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const pages = new Map();

function pageCount(pdfPath) {
  if (pages.has(pdfPath)) return pages.get(pdfPath);
  const buf = readFileSync(pdfPath);
  // /Type /Page objects, excluding /Type /Pages tree nodes.
  const n = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  pages.set(pdfPath, n);
  return n;
}

const htmlFiles = ['index.html', ...readdirSync(resolve(root, 'examples'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => `examples/${f}`)];

for (const rel of htmlFiles) {
  const file = resolve(root, rel);
  const html = readFileSync(file, 'utf8');

  // Only embeds pointing at a real local file can be checked; the docs use
  // fictional cdn.example.com URLs on purpose.
  const embeds = [...html.matchAll(/<div class="slipsheet"[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /data-src="\.\/?[^"]*\.pdf"/.test(tag));

  if (!embeds.length) continue;

  test(`${rel}: declared page counts match the actual PDF`, () => {
    for (const tag of embeds) {
      const src = tag.match(/data-src="([^"]+)"/)[1];
      const declared = tag.match(/data-pages="(\d+)"/)?.[1];
      if (!declared) continue;

      const pdf = resolve(dirname(file), src);
      const actual = pageCount(pdf);

      assert.equal(
        Number(declared),
        actual,
        `${rel}: data-pages="${declared}" but ${src} has ${actual} pages. ` +
          'The viewer reserves layout space from this number.',
      );
    }
  });

  test(`${rel}: fallback link text agrees with the declared page count`, () => {
    for (const [, declared, label] of html.matchAll(
      /data-pages="(\d+)"[\s\S]*?<a[^>]*>([^<]+)<\/a>/g,
    )) {
      const claimed = label.match(/\((\d+) pages?\)/)?.[1];
      if (!claimed) continue;
      assert.equal(
        claimed,
        declared,
        `${rel}: link says "${claimed} pages" but data-pages="${declared}". ` +
          'A reader with JavaScript off sees the link text.',
      );
    }
  });
}

test('every local data-src in the examples resolves to a file that exists', () => {
  for (const rel of htmlFiles) {
    const file = resolve(root, rel);
    const html = readFileSync(file, 'utf8');
    for (const [, src] of html.matchAll(/data-src="(\.[^"]+)"/g)) {
      const target = resolve(dirname(file), src);
      assert.doesNotThrow(
        () => readFileSync(target),
        `${rel} points at ${src}, which does not exist`,
      );
    }
  }
});
