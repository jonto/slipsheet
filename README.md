# slipsheet

**LinkedIn-style inline PDF embeds for the web.** Two small, MIT-licensed JavaScript libraries that work together — or independently.

In offset printing, a *slipsheet* is a clean sheet slipped between freshly printed pages to keep the ink from transferring. On the web, it's a plain-HTML markup contract for slipping a PDF panel *between* pieces of content — and a viewer that turns that markup into a polished, accessible reading experience.

```html
<div class="slipsheet"
     data-src="https://cdn.example.com/report.pdf"
     data-pages="12"
     data-filename="quarterly-report.pdf">
  <a href="https://cdn.example.com/report.pdf" download="quarterly-report.pdf">Download quarterly-report.pdf (12 pages)</a>
</div>
```

That child `<a>` is the whole trick: with no JavaScript, it's a working download link. With the viewer loaded, it becomes an inline PDF reader. **Every failure mode degrades gracefully.**

## The two packages

| Package | What it is | Size (min) |
|---|---|---|
| [`@slipsheet/viewer`](packages/viewer/) | Standalone [PDF.js](https://mozilla.github.io/pdf.js/) wrapper. Hydrates `.slipsheet` markup into an interactive viewer — page navigation, jump-to-page, fullscreen, keyboard nav, screen-reader announcements, mobile cellular tap-to-load, and download. **No editor dependency.** | ~9 KB JS + ~6 KB CSS, PDF.js lazy-loaded on demand |
| [`@slipsheet/hugerte`](packages/hugerte/) | [HugeRTE](https://hugerte.org/) editor plugin (API-compatible with **TinyMCE 6**, the last MIT-licensed TinyMCE). A toolbar button uploads a PDF through *your* handler and inserts the standardized markup. | ~3 KB JS |

The viewer is useful without the plugin (any HTML page with the markup works). The plugin is useful without the viewer (the markup is a working download link on its own). They're joined only by the markup contract — no shared runtime.

## Quick start

### Viewer — via CDN

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@slipsheet/viewer/dist/viewer.min.css">
<script type="module">
  import { Slipsheet } from 'https://cdn.jsdelivr.net/npm/@slipsheet/viewer/dist/viewer.min.js';
  Slipsheet.init();   // hydrates every .slipsheet element on the page
</script>
```

### Viewer — via npm

```js
import { Slipsheet } from '@slipsheet/viewer';
import '@slipsheet/viewer/style';   // viewer.min.css
Slipsheet.init();
```

### Editor plugin

```js
hugerte.init({           // or tinymce.init on TinyMCE 6
  selector: '#editor',
  plugins: 'slipsheet',
  toolbar: 'slipsheet',
  slipsheet_upload_handler: async (file, progress) => {
    // upload `file` wherever you like; return where it lives
    const { url, pages } = await myUpload(file, progress);
    return { src: url, pages, filename: file.name };
  },
  // required so the editor keeps the embed's contenteditable="false" hint on save:
  extended_valid_elements: 'div[class|data-src|data-pages|data-filename|contenteditable],a[href|download|target]',
});
```

The upload handler is yours — slipsheet never talks to a backend. See [`packages/hugerte/`](packages/hugerte/) for all options (max size, accept types, tooltip).

## Why it's built this way

- **Editor-agnostic by design.** The viewer knows nothing about any editor; the plugin knows nothing about rendering. A plain-HTML markup contract is the only coupling.
- **Graceful degradation at every layer** — no JS, no viewer, or a broken PDF all fall back to a normal download link.
- **PDF.js is loaded on demand, not bundled.** Adopters get lazy loading *and* PDF.js updates without waiting on a slipsheet release.

## Status

**Pre-1.0 (`0.x`).** Both packages are functional with working examples end-to-end; the public APIs may still change before `1.0`. Issues and feedback are welcome — that's what the `0.x` window is for.

## Examples

```bash
npm run serve                       # static server on :8003
# then open:
#   examples/basic.html   — viewer, minimum working demo
#   examples/editor.html  — full editor round-trip (HugeRTE + plugin + viewer)
#   examples/dist.html    — same as basic, loading the bundled dist/
```

## Architecture

The full three-layer design, the plugin and viewer APIs, the editor-upgrade resilience strategy, and the locked design decisions live in **[ARCHITECTURE.md](ARCHITECTURE.md)**. Start there if you want to understand or extend the internals.

## License

MIT — see [LICENSE](LICENSE).

---

*slipsheet powers inline PDF reading on [SignalK.it](https://signalk.it). It's built to be host-agnostic — no adopter is a dependency.*
