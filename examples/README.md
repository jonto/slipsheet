# Examples

Hand-authored demo pages used to drive viewer development. No editor, no upload, no build step — just the viewer hydrating realistic markup.

## Run locally

From the repo root:

```bash
npm run serve              # python3 -m http.server 8003
```

Then open http://localhost:8003/examples/basic.html in a browser. The server is rooted at the slipsheet directory (one level above this) so the example's relative imports of `../packages/viewer/src/{index.js,viewer.css}` resolve.

## Pages

- **`basic.html`** — minimum working demo. One `.slipsheet` block pointing at `./sample.pdf`. Loads `@slipsheet/viewer` from the local `packages/viewer/src/index.js` (relative path, no build needed) and PDF.js v4 from jsdelivr.
- **`multi.html`** — two embeds on one page. First hydrates immediately (above the fold); second is below the fold and waits for IntersectionObserver to fire before fetching anything. Demonstrates multi-instance state independence and the lazy gate. Use prev/next buttons or arrow keys / Home / End to navigate.
- **`dist.html`** — same content as basic.html, but loads `viewer.min.{js,css}` from `packages/viewer/dist/` instead of `src/`. Verifies the production build is functionally equivalent. Requires `npm run build` to have run first.
- **`editor.html`** — full round trip: HugeRTE editor + the `@slipsheet/hugerte` plugin + the `@slipsheet/viewer` rendering the preview. Click the document icon in the toolbar to insert a PDF; the demo's upload handler returns a local blob URL so it works offline. Hit "Render preview" to see how the standardized markup hydrates. Toggle "HTML source" to inspect what the editor saves.

## Assets

- **`sample.pdf`** — Mozilla's canonical PDF.js test PDF (the tracemonkey paper, ~1MB, 14 pages). Bundled here so the examples work offline.
