// Loads a real editor from a CDN, registers the built plugin against it, and
// checks the plugin's public surface actually came up. This is the test behind
// the compatibility claim in ARCHITECTURE.md: one plugin build, two editors.
//
// Usage:  EDITOR_GLOBAL=hugerte EDITOR_CDN=https://... node editor-compat.mjs

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GLOBAL = process.env.EDITOR_GLOBAL || 'hugerte';
const CDN = process.env.EDITOR_CDN || 'https://cdn.jsdelivr.net/npm/hugerte@1/hugerte.min.js';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.pdf': 'application/pdf', '.map': 'application/json',
};

const PAGE = `<!doctype html><meta charset="utf-8"><title>compat</title>
<textarea id="ed"></textarea>
<script src="${CDN}" referrerpolicy="origin"></script>
<script type="module" src="/packages/hugerte/dist/plugin.min.js"></script>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(PAGE);
  }
  try {
    const path = join(ROOT, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));

let failure = null;
try {
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

  const result = await page.evaluate(async ({ g }) => {
    const editorApi = window[g];
    if (!editorApi) return { ok: false, why: `global "${g}" never loaded` };
    if (!editorApi.PluginManager?.get('slipsheet')) {
      return { ok: false, why: 'plugin did not register with PluginManager' };
    }

    const editors = await editorApi.init({
      selector: '#ed',
      license_key: 'gpl',
      plugins: 'slipsheet',
      toolbar: 'slipsheet',
      slipsheet_upload_handler: async () => ({ src: '/x.pdf', pages: 2, filename: 'x.pdf' }),
      extended_valid_elements:
        'div[class|data-src|data-pages|data-filename|contenteditable],a[href|download|target]',
      // Required. Without it the editor rewrites the fallback link's href to be
      // document-relative while leaving data-src alone, so the two disagree and
      // the no-JS download points at the wrong path.
      convert_urls: false,
    });

    const ed = editors[0];
    if (!ed) return { ok: false, why: 'editor did not initialise' };

    const buttons = ed.ui.registry.getAll().buttons;
    if (!buttons.slipsheet) return { ok: false, why: 'toolbar button was not registered' };

    // Round-trip the contract through the editor's own serializer: this is
    // where extended_valid_elements mistakes and attribute stripping surface.
    ed.setContent(
      '<div class="slipsheet" contenteditable="false" data-src="/x.pdf" data-pages="2" ' +
        'data-filename="x.pdf"><a href="/x.pdf" download="x.pdf">Download x.pdf (2 pages)</a></div>',
    );
    const saved = ed.getContent();

    return {
      ok: true,
      version: editorApi.majorVersion + '.' + editorApi.minorVersion,
      buttonTooltip: buttons.slipsheet.tooltip,
      saved,
    };
  }, { g: GLOBAL });

  if (!result.ok) throw new Error(result.why);

  const required = ['class="slipsheet"', 'data-src="/x.pdf"', 'data-pages="2"', 'contenteditable="false"'];
  const missing = required.filter((frag) => !result.saved.includes(frag));
  if (missing.length) {
    throw new Error(
      `editor serializer dropped part of the contract: ${missing.join(', ')}\nsaved: ${result.saved}`,
    );
  }

  // The invariant that actually matters: whatever the viewer renders is what
  // the fallback link downloads. The editor's URL conversion breaks this
  // silently, rewriting href while leaving data-src alone.
  const savedSrc = result.saved.match(/data-src="([^"]+)"/)?.[1];
  const savedHref = result.saved.match(/<a[^>]*href="([^"]+)"/)?.[1];
  if (savedSrc !== savedHref) {
    throw new Error(
      `after saving, the fallback link and the viewer disagree:\n` +
        `  data-src = ${savedSrc}\n  href     = ${savedHref}\n` +
        'Set convert_urls: false in the editor config.',
    );
  }

  console.log(`✓ ${GLOBAL} ${result.version}: plugin registered, button "${result.buttonTooltip}", contract survives save`);
} catch (err) {
  failure = err;
} finally {
  await browser.close();
  server.close();
}

if (consoleErrors.length) {
  console.error('Page errors:\n  ' + consoleErrors.join('\n  '));
  if (!failure) failure = new Error('the page raised errors');
}

if (failure) {
  console.error(`✗ ${GLOBAL}: ${failure.message}`);
  process.exit(1);
}
