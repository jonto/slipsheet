# @slipsheet/viewer

> **Status: pre-1.0 (`0.x`).** Functional with working examples; the public API may still change before `1.0`. Coming next: a cross-browser test pass.

Standalone JavaScript + CSS that scans the document for `.slipsheet` elements and hydrates each into a polished, accessible, mobile-friendly PDF viewer powered by [PDF.js](https://mozilla.github.io/pdf.js/). Has no dependency on any rich-text editor.

## Markup contract

```html
<div class="slipsheet"
     data-src="https://cdn.example.com/report.pdf"
     data-pages="12"
     data-filename="quarterly-report.pdf">
  <a href="https://cdn.example.com/report.pdf"
     download="quarterly-report.pdf">
    Download quarterly-report.pdf (12 pages)
  </a>
</div>
```

The child `<a>` is the no-JS / pre-hydration fallback. Always present, always functional.

## Usage (today)

```js
// Bundler path: gets the minified dist by default
import { Slipsheet } from '@slipsheet/viewer';
import '@slipsheet/viewer/style';   // viewer.min.css

Slipsheet.init();  // hydrates all .slipsheet elements
```

Or via global `<script>`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@slipsheet/viewer/dist/viewer.min.css">
<script type="module">
  import { Slipsheet } from 'https://cdn.jsdelivr.net/npm/@slipsheet/viewer/dist/viewer.min.js';
  Slipsheet.init();
</script>
```

(Both URLs go live with the first npm publish.)

For adopters who want the unminified source (debugging, custom bundling), it's available via subpath exports: `@slipsheet/viewer/src/index.js` + `@slipsheet/viewer/src/viewer.css`.

## Build

```bash
git clone <this repo> && cd slipsheet
npm install              # installs esbuild
npm run build            # produces packages/viewer/dist/viewer.min.{js,css} + source maps
```

The build does NOT bundle PDF.js. The viewer's `import(PDFJS_URL)` stays a runtime dynamic fetch, so adopters get lazy loading and PDF.js updates without re-releasing slipsheet.

## Configuration

```js
Slipsheet.init({
  selector: '.slipsheet',                                                          // CSS selector for .slipsheet elements
  pdfJsUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs',         // override PDF.js source
  pdfJsWorkerUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs',
  scale: 1.5,                                                                      // canvas render scale
  lazy: true,                                                                      // IntersectionObserver-gated load
  lazyMargin: '200px',                                                             // root margin for lazy
  fullscreen: true,                                                                // show ⛶ button in chrome
  tapToLoadOnSlow: true,                                                           // defer hydration on cellular / save-data
});
```

Adopters who want to self-host PDF.js (privacy / offline / GDPR) override the two `pdfJsUrl` options. Defaults point at jsdelivr, which mirrors npm and is widely cached.

## Keyboard navigation

When the embed is focused (`tabindex="0"` is set automatically):

| Key | Action |
|---|---|
| `←` / `PageUp` | Previous page |
| `→` / `PageDown` / `Space` | Next page |
| `Home` | First page |
| `End` | Last page |
| `F` | Toggle fullscreen |
| `Esc` | Exit fullscreen |
| `Tab` | Move focus through chrome (prev → page input → next → download → fullscreen) |

The page-number input is editable. Type a page number and press Enter or click outside to jump. Out-of-range values clamp.

## Cellular / save-data behavior

When `navigator.connection.saveData === true` OR `effectiveType` is `slow-2g` / `2g`, the viewer renders a "Load `<filename>`" placeholder instead of auto-fetching the PDF. User taps to hydrate. Independent of the scroll-based `lazy` gate.

Browsers without NetworkInformation (Safari, Firefox as of mid-2026) skip this check and hydrate per the normal `lazy` path. Disable entirely with `tapToLoadOnSlow: false`.

## State attributes (set by the viewer on `.slipsheet`)

- `data-slipsheet-state="awaiting-tap"` while the cellular tap-to-load placeholder is visible
- `data-slipsheet-state="loading"` while PDF.js fetches and renders the first page
- `data-slipsheet-state="ready"` after first paint
- `data-slipsheet-state="error"` if PDF.js failed (the embedded `<a>` download link remains visible as fallback)
- `data-slipsheet-hydrated="true"` once the viewer is in place
- `data-slipsheet-fullscreen="true"` while in either native or modal fullscreen
- `data-slipsheet-pages="N"` (PDF page count, populated after fetch)
- `data-slipsheet-current-page="N"` (currently displayed page, starts at 1)

These are stable hooks for adopter CSS + analytics; treat them as part of the public API.

## Browser support

PDF.js v4 baseline: modern Chromium, Firefox, Safari 16+, Edge. ES modules required; uses dynamic `import()` for lazy PDF.js loading.

## See also

- Full architecture: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- Sibling package: [`../hugerte/`](../hugerte/) — the HugeRTE editor plugin that emits this markup
