# Changelog

All notable changes to this project will be documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-08-06 — first public release

Initial publish of both packages to npm, and the first release from the public
repository at https://github.com/jonto/slipsheet.

- **`@slipsheet/viewer` 0.1.0** — supersedes the unpublished `0.0.1`–`0.0.5`
  development line documented below. No functional change from `0.0.5`.
- **`@slipsheet/hugerte` 0.1.0** — supersedes the unpublished `0.0.1`–`0.0.2`
  development line. No functional change from `0.0.2`.

Both packages start at the same version so the compatibility story stays simple:
`0.1.x` of one is designed against `0.1.x` of the other. They remain independently
useful and share no runtime — only the Layer 2 markup contract.

Public APIs may still change before `1.0`; see the Status note in the README.

---

## Development history (pre-publication)

The entries below document the incubation versions. They were never published to
npm; they are kept for provenance.

### 2026-05-12 — `@slipsheet/hugerte` v0.0.2 — embed is non-editable

- **Bug fix:** the inserted `<div class="slipsheet">` was fully editable in HugeRTE. If the user clicked into it (or had the caret land inside it after `insertContent`), subsequent typing/pasting/AI-autofill `setContent` could nest body content inside the slipsheet div and overwrite the fallback `<a>Download …</a>` link. At read time the viewer calls `replaceChildren(wrapper)` on the host element, wiping any nested content — so the reader sees the PDF panel with the surrounding article text gone.
- **Fix:** `renderMarkup()` now emits `contenteditable="false"` on the wrapper div. The editor treats the embed as a single atomic block — caret cannot enter, content cannot be modified or merged. The fallback `<a>` is safe.
- **Adopter action required:** add `contenteditable` to the editor's `extended_valid_elements` rule for `div`, otherwise HugeRTE's serializer strips the attribute on save. Example:
  ```js
  extended_valid_elements: 'div[class|data-src|data-pages|data-filename|contenteditable],a[href|download|target]',
  ```
  Host applications should ALSO strip `contenteditable` in their public-render HTML sanitizer — it's an editor-side hint and is not part of the standardized markup contract that `@slipsheet/viewer` reads.
- Updated `examples/editor.html` accordingly.

### 2026-05-12 — `@slipsheet/viewer` v0.0.5 — aspect-ratio fix

- **Bug fix:** the viewer was setting both `canvas.style.width` AND `canvas.style.height` inline. When a container was narrower than the natural page width (common: landscape PDFs in a 700-800px content column), CSS `max-width: 100%` capped the displayed width — but the inline `style.height` stayed at the original height, distorting the aspect ratio (landscape PDFs were rendered as portrait, portrait PDFs were stretched vertically).
- **Fix:** drop the inline `style.height`. Keep only `style.width` as the design-size hint; CSS `max-width: 100%` + `height: auto` handles proportional scaling automatically. The canvas's HTML width/height attributes (the backing buffer) still give the browser the natural aspect ratio to compute from.
- Fullscreen mode unaffected — `fitScale` already computes both dimensions to fit the viewport, so the inline height removal makes no behavioral difference there.

### 2026-05-11 — `@slipsheet/hugerte` v0.0.1 — first real implementation (Phase 2)

- Plugin registers via `hugerte.PluginManager.add('slipsheet', fn)` with TinyMCE-6 fallback (`window.tinymce || window.hugerte`).
- **Options** (all configurable via `hugerte.init`):
  - `slipsheet_upload_handler` (required, async `(file, progress) => { src, pages?, filename? }`)
  - `slipsheet_max_size` (default 30 MB)
  - `slipsheet_accept` (default `.pdf,application/pdf`)
  - `slipsheet_button_tooltip` (default `Insert PDF`)
- **Toolbar button** registered as `slipsheet`. Custom SVG icon (document-with-text), no dependency on editor's built-in icon set. Use in `toolbar:` config like any other plugin.
- **File picker** — hidden `<input type="file">`, user-gesture triggered (works under modern browser security). Cancellation handled via `window.focus` fallback.
- **Validation** — client-side size + MIME check before invoking the handler. Friendly error notification when the file is too large.
- **Progress UI** — `editor.notificationManager.open({ progressBar: true })`. Handler receives a `progress(percent)` callback.
- **Markup insertion** — emits the standardized `.slipsheet` contract at the cursor. User-provided strings are HTML-escaped to prevent injection.
- **`getMetadata`** returned for the plugin (TinyMCE 6 plugin contract) — populates the editor's "About" listing.
- **Built dist:** `packages/hugerte/dist/plugin.min.js` is 3.2 KB minified. Source map alongside. The build script generalized to handle both packages.
- **New example:** `examples/editor.html` — full round trip. HugeRTE 1.0.10 + slipsheet plugin + viewer. Click the document icon in the toolbar to insert a PDF; demo handler uses `URL.createObjectURL(file)` so it works offline. "Render preview" hydrates the standardized markup; "Toggle HTML source" reveals what the editor saved.

### 2026-05-11 — `@slipsheet/viewer` v0.0.4 — dist/ minified bundle + build script

- **Build script** (`bin/build.mjs`, invoked via `npm run build`) uses esbuild to produce minified + source-mapped output. Does NOT bundle PDF.js — the viewer's dynamic import is preserved, so adopters get lazy loading and PDF.js updates without re-releasing slipsheet.
- **`packages/viewer/dist/`** now contains:
  - `viewer.min.js` (9.1 KB, was 17.1 KB source — 47% reduction)
  - `viewer.min.js.map`
  - `viewer.min.css` (6.4 KB, was 8.5 KB source — 24% reduction)
  - `viewer.min.css.map`
- **`packages/viewer/package.json`** publishing fields:
  - `main` / `module` point at `dist/viewer.min.js` (default for npm consumers)
  - `style` points at `dist/viewer.min.css` (semi-standard CSS field)
  - `exports` map exposes both `dist/` (default) and `src/` (for adopters who want unminified)
- **Dist files are committed** so jsdelivr can serve them from GitHub before the first npm publish, and so `examples/dist.html` works without requiring `npm install`. Reconsider this policy after the first npm publish (the usual convention is to gitignore build artifacts and rely on the release pipeline).
- **`devDependencies`:** `esbuild ^0.25.0`. Workspace root `package.json` runs `node bin/build.mjs` for `npm run build`.
- **New example:** `examples/dist.html` — same content as basic.html but loads from `dist/` to verify the bundled version is functionally equivalent.

### 2026-05-11 — `@slipsheet/viewer` v0.0.3 — fullscreen, jump-to-page, cellular tap-to-load

- **Fullscreen** (default `fullscreen: true`). New ⛶ button in the chrome. Uses HTML5 Fullscreen API (with `webkit*` fallback for Safari); falls back to a CSS-only modal overlay (`position: fixed; inset: 0; z-index: 9999`) when the API is unavailable or the request is rejected. On enter, computes a fit-to-viewport scale and re-renders the current page at higher resolution; on exit, restores the original scale. Esc exits in both modes; browser-driven exit (chrome controls, system gesture) is detected via `fullscreenchange` and synced. Dark theme in fullscreen (warm-charcoal background) so the white PDF stands out. New keyboard binding: `F` toggles fullscreen.
- **Jump-to-page input.** The static "Page N of M" indicator becomes editable: a `<input type="number" min=1 max=N>` for the current page + " of N" suffix. Width auto-sized to the digit count. Clamps to range on commit. Enter or blur commits; the keyboard nav handler skips when the focus is in an INPUT, so typing doesn't hijack arrow keys.
- **Mobile cellular / save-data tap-to-load** (default `tapToLoadOnSlow: true`). Detects via NetworkInformation API (`navigator.connection.saveData === true` OR `effectiveType` in {`slow-2g`, `2g`}). When triggered, renders a "Load `<filename>`" button with metered-connection meta-text instead of auto-fetching. On user tap, hydrates normally. Independent of the lazy-scroll gate. Browsers without NetworkInformation (Safari, Firefox) get the normal hydration path.
- **Screen-reader announcements** moved to a dedicated visually-hidden `aria-live="polite"` span in the chrome (separate from the now-editable page input). Avoids double-firing announcements on input value changes triggered by JS vs user.
- **State attributes:** `data-slipsheet-state="awaiting-tap"` while waiting on cellular gesture; `data-slipsheet-fullscreen="true"` while in either fullscreen mode. Joins the existing `loading | ready | error` and the existing `data-slipsheet-hydrated`, `-pages`, `-current-page` attributes as part of the public API.

### 2026-05-10 — `@slipsheet/viewer` v0.0.2 — chrome, keyboard nav, lazy load

- **Chrome (toolbar)** above the canvas: prev / next buttons, page indicator, download link. SVG icons inline in the JS (no icon-font dependency). Buttons disable correctly at boundaries (page 1 → prev disabled; last page → next disabled).
- **Keyboard navigation:** ArrowLeft/PageUp = previous, ArrowRight/PageDown/Space = next, Home = first page, End = last page. Element is `tabindex="0"` so it can be focused; typing inside future input fields won't hijack the keys.
- **IntersectionObserver lazy gate** (default `lazy: true`, `lazyMargin: '200px'`): the PDF and PDF.js are not fetched until the embed scrolls within 200px of the viewport. Bandwidth savings compound on long pages with multiple embeds. Falls back to eager hydration when IntersectionObserver isn't available.
- **Render any page** (was: only first page). `renderPage(state, pageNum)` handles arbitrary navigation. In-flight renders are cancelled via PDF.js's `RenderTask.cancel()` to avoid flicker on rapid nav.
- **Accessibility:** `aria-live="polite"` + `aria-atomic="true"` on the page indicator (announces page changes to screen readers); `aria-label` on every interactive element; `aria-hidden="true"` on the chrome spacer. Indicator text is "Page N of M" rather than just "N / M" so it reads naturally.
- **`prefers-reduced-motion`:** all transitions and animations disabled when the user has it set.
- **New example: `examples/multi.html`** — two embeds on one page. First hydrates immediately (above fold); second is lazy (below fold). Demonstrates multi-instance state independence + the lazy gate.

### 2026-05-10 — Project named slipsheet; Phase 1 first slice

- **Project named:** unanimous decision on `slipsheet`. The metaphor: in offset printing, a slipsheet is a clean sheet inserted between freshly printed pages to prevent ink transfer. On the web, our markup contract inserts a PDF panel between pieces of editor content. Name selected from a 20-candidate brainstorm with collision check; finalists were `pagewell`, `slipsheet`, `pdfpane`.
- **npm scope:** `@slipsheet` (subject to availability check at first publish; clean as of 2026-05-10).
- **Renamed:** `packages/hugerte-plugin/` → `packages/hugerte/`; package names from `pdf-embed-*` to `@slipsheet/*`.
- **Markup class:** finalized as `class="slipsheet"` (was `class="pdf-embed"` in the architecture draft). Matches convention from similar libraries (Plyr's `js-plyr`, Splide's `splide`, Embla's `embla`) and gives end-to-end brand consistency. Adopters can override via the `selector` option if they want a generic class.

### 2026-05-10 — `@slipsheet/viewer` v0.0.1 first slice

- Discovery: scans the document for `.slipsheet` elements
- Lazy PDF.js load: deferred dynamic `import()` from configurable URL (defaults to jsdelivr)
- First-page render: canvas-based, devicePixelRatio-aware, configurable scale
- State attributes: `data-slipsheet-state` (`loading` / `ready` / `error`), `data-slipsheet-hydrated`, `data-slipsheet-pages`, `data-slipsheet-current-page`
- CSS: scoped to `.slipsheet` and `.slipsheet__*` BEM-like names; integrates with Bootstrap 5.3 CSS variables when host has them, falls back to neutral defaults otherwise
- Error fallback: leaves the embedded `<a>` download link in place if PDF.js fails

Not yet: page navigation, fullscreen, mobile tap-to-load on cellular, keyboard nav, screen-reader announcements, IntersectionObserver lazy gate, download-button UI.
