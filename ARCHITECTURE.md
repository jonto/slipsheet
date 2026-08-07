# Slipsheet: architecture spec

Status: **pre-1.0 (`0.x`)**. Both `@slipsheet/viewer` and `@slipsheet/hugerte` are functional with working examples; the public APIs may still change before `1.0`. The plugin targets [HugeRTE](https://hugerte.org/) while staying API-compatible with TinyMCE 6 (the last MIT-licensed TinyMCE) — see "Editor upgrade resilience" below for the rationale.

**Why "slipsheet":** in offset printing, a slipsheet is a clean sheet inserted between freshly printed pages to prevent ink transfer — a sheet you slide *into* a stack of other pages. On the web, that's exactly what our markup contract does: insert a PDF panel between pieces of editor content. The metaphor is mechanically apt; the indieweb register rewards earned references.

---

## Mission

Provide a LinkedIn-style inline PDF reading experience for web content authored in [HugeRTE](https://hugerte.org/), packaged as community-grade open-source so other HugeRTE shops can adopt it. Because HugeRTE's editor API is fully compatible with TinyMCE 6 (the last MIT-licensed version of TinyMCE), the plugin is also usable in TinyMCE 6 installs without modification — a useful bonus for anyone stuck on legacy versions for license reasons. The originating use case (inline PDF reports in blog posts) is the proving ground, but the design must not depend on any single host's specifics.

Reader experience target: scroll through a story, encounter an embedded PDF, page through it without leaving the article, expand to fullscreen, optionally download. Mobile users can tap to load on demand instead of paying the bandwidth automatically.

### Why HugeRTE and not TinyMCE

TinyMCE 7+ moved from MIT to GPLv2+ in 2024, which makes it awkward to embed in proprietary applications without paying for a commercial license. HugeRTE is a community fork of the last MIT-licensed TinyMCE (6.8.4 + pre-license-switch portions of TinyMCE 7) and is actively maintained under MIT with no commercial path. Targeting HugeRTE keeps the plugin permissively licensed for everyone and rides the community wave of users actively migrating away from TinyMCE.

---

## Three-layer architecture

The deliberate goal is **maximum decoupling**. Every layer is independently shippable and independently useful. Failure or upgrade churn in one layer never breaks the others.

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: @slipsheet/hugerte       (open-source, MIT)            │
│  HugeRTE editor plugin. Toolbar button. Upload dialog.          │
│  Calls user-provided upload handler. Inserts standardized       │
│  markup into the editor. NO knowledge of S3, NO rendering       │
│  logic, NO PDF.js dependency. API-compatible with TinyMCE 6.    │
└─────────────────────────────────────────────────────────────────┘
                            ▼ inserts ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: standardized markup     (the contract)                │
│                                                                 │
│  <div class="slipsheet"                                         │
│       data-src="https://cdn.example.com/report.pdf"             │
│       data-pages="12"                                           │
│       data-filename="quarterly-report.pdf">                     │
│    <a href="https://cdn.example.com/report.pdf"                 │
│       download="quarterly-report.pdf">                          │
│      Download quarterly-report.pdf (12 pages)                   │
│    </a>                                                         │
│  </div>                                                         │
│                                                                 │
│  Progressive enhancement: works as a download link with no JS.  │
│  Survives plugin upgrades, viewer upgrades, editor upgrades,    │
│  even total renderer absence. Content NEVER depends on JS.      │
│  Editor-agnostic by design.                                     │
└─────────────────────────────────────────────────────────────────┘
                            ▼ hydrated by ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: @slipsheet/viewer        (open-source, MIT)            │
│  Standalone JavaScript + CSS. Scans the document for            │
│  .slipsheet elements, hydrates each with PDF.js. Page nav,      │
│  fullscreen, mobile tap-to-load, keyboard navigation,           │
│  download button. Editor-agnostic; does not know HugeRTE,       │
│  TinyMCE, or any rich-text editor exists.                       │
└─────────────────────────────────────────────────────────────────┘
                            ▼ used by ▼
┌─────────────────────────────────────────────────────────────────┐
│  HOST INTEGRATION                 (private, per-project)        │
│  Each adopter wires up: an upload endpoint, server-side         │
│  rendering of stored content, conditional admin UI.             │
│  Outside this repo's scope — see "Host integration" below       │
│  for the checklist every adopter works through.                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why this layering pays off

**For the open-source community.** Layer 1 and Layer 3 are useful independently. Some shops have their own PDF viewer and want only the editor plugin. Some have a different rich-text editor and want only the viewer. Two GitHub stars per project instead of one.

**For editor upgrade resilience.** Layer 1 uses only documented stable APIs that exist in both HugeRTE 1.x and TinyMCE 6. The API is identical between them; HugeRTE inherits the same plugin contract. When HugeRTE ships a new version, the plugin probably works untouched. The markup (Layer 2) and the viewer (Layer 3) are entirely editor-agnostic; they don't break even if the editor itself disappears.

**For adopters.** Integration is just configuration. Upgrading HugeRTE means changing the version pin in your editor templates; the plugin auto-loads against the new version. Nobody forks HugeRTE, nobody patches its internals.

---

## Layer 1: @slipsheet/hugerte (editor plugin)

### Public API

Mirrors HugeRTE's idiomatic `images_upload_handler` pattern (inherited from TinyMCE 6). Adopters who have already configured image uploads will find this familiar.

```js
hugerte.init({
  plugins: 'slipsheet',
  toolbar: 'undo redo | bold italic | image slipsheet | code',

  // Required: async function. Receives File + progress callback. Resolves with metadata.
  slipsheet_upload_handler: function (file, progress) {
    return new Promise((resolve, reject) => {
      // Implementer's upload logic. Could be S3, R2, GCS, local, anything.
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => progress(e.loaded / e.total * 100);
      xhr.onload = () => {
        const r = JSON.parse(xhr.responseText);
        resolve({ src: r.url, pages: r.pages, filename: file.name });
      };
      xhr.onerror = reject;
      const fd = new FormData();
      fd.append('file', file);
      xhr.open('POST', '/admin/upload/pdf');
      xhr.send(fd);
    });
  },

  // Optional: defaults shown
  slipsheet_max_size: 30 * 1024 * 1024,         // bytes
  slipsheet_accept: '.pdf,application/pdf',     // file picker filter
  slipsheet_button_tooltip: 'Insert PDF',       // i18n hook
  slipsheet_button_icon: 'embed-page'           // any registered editor icon
});
```

For TinyMCE 6 installs, replace `hugerte.init({...})` with `tinymce.init({...})` — every other option is identical.

### What the plugin does

1. Registers a toolbar button (`slipsheet`).
2. On click: opens a file picker dialog filtered to PDFs (`<input type="file" accept=".pdf">`).
3. Validates client-side: size against `slipsheet_max_size`, MIME type.
4. Calls `slipsheet_upload_handler(file, progress)`. Shows an editor notification with progress.
5. On resolution: inserts the standardized markup at the cursor (Layer 2 contract). On rejection: shows an editor error notification with the rejection reason.

### What the plugin does NOT do

- Does not upload anywhere itself. Implementer owns the upload pipeline entirely.
- Does not render the PDF in the editor preview. Editor shows the inserted markup as a placeholder card with the filename and page count; full rendering happens at view time via Layer 3.
- Does not know about S3, signed URLs, authentication, content-disposition headers, or any backend specifics.
- Does not include PDF.js. Adopters who don't render anywhere just store the markup.

### Dependencies

- HugeRTE 1.x (peer dependency). API-compatible with TinyMCE 6 if anyone needs that.
- No build-time dependency on the editor; the plugin registers via `hugerte.PluginManager.add()` (or `tinymce.PluginManager.add()` in TinyMCE 6) at runtime.
- No npm dependencies. Plain JS, ES2017 baseline.

### Compatibility commitments

The plugin uses ONLY these APIs, all of which are stable in HugeRTE 1.x and identical in TinyMCE 6:

- `hugerte.PluginManager.add(name, fn)` (alias: `tinymce.PluginManager.add`)
- `editor.ui.registry.addButton(name, spec)`
- `editor.ui.registry.addIcon(name, svg)` (optional)
- `editor.windowManager.open(spec)` for the upload progress dialog
- `editor.notificationManager.open(spec)` for error/progress toasts
- `editor.insertContent(html)`
- `editor.options.get(name)` and `editor.options.register(name, spec)`

Anything not on this list is forbidden. If a future feature requires a less-stable API, document the version dependency explicitly.

---

## Layer 2: standardized markup contract

The HTML schema. This is the most important boundary in the design because it is the only thing that lives forever in stored content.

```html
<div class="slipsheet"
     data-src="<absolute or root-relative URL to the PDF>"
     data-pages="<integer page count, optional>"
     data-filename="<original filename, optional>">
  <a href="<same as data-src>"
     download="<same as data-filename>">
    Download <filename> (<pages> pages)
  </a>
</div>
```

### Required attributes

- `class="slipsheet"` — selector hook for Layer 3
- `data-src` — absolute or root-relative URL to the PDF

### Optional attributes

- `data-pages` — integer; lets the renderer reserve correct vertical space before fetch (eliminates layout shift)
- `data-filename` — string; used in download UX and accessibility labels
- `data-thumbnail` — URL to a JPG/WebP first-page preview (future enhancement)
- `data-poster` — URL to a custom poster image (future enhancement)

### Why a child download link

Three reasons:

1. **No-JS rendering.** Visitors with JavaScript disabled (less common but real) get a working download. The author's intent is preserved.
2. **Search engine fallback.** Crawlers can follow the link and index the PDF.
3. **Pre-hydration UX.** Before Layer 3 runs (or if it never runs), users see a clear, clickable affordance, not a broken empty box.

### What the markup is NOT

- Not an iframe. Iframes invoke browser default PDF rendering, which is inconsistent and ugly.
- Not an `<embed>` or `<object>`. Same reason.
- Not a custom element. Custom elements require a registration step at page load; a plain class+data-attributes pattern works in any HTML context with zero setup.

---

## Layer 3: @slipsheet/viewer (renderer library)

The piece other people will actually want.

### What it does

On page load (or on explicit invocation), scans the document for `.slipsheet` elements and hydrates each into a polished interactive viewer:

- **Page navigation**: prev/next buttons, jump-to-page input, scroll-through within the viewer
- **Page indicator**: "Page 3 of 12" with semantic `aria-live`
- **Fullscreen**: HTML5 Fullscreen API; falls back to full-viewport modal where unsupported
- **Download button**: properly attributes the `download` filename and content-disposition
- **Lazy load**: IntersectionObserver; PDF only fetched when within viewport (configurable threshold)
- **Mobile tap-to-load**: on mobile + cellular, render a poster + "Tap to load PDF (5.4 MB)" instead of auto-fetching
- **Keyboard navigation**: arrow keys, Page Up/Down, Home/End, F for fullscreen, Esc to exit
- **Screen reader support**: page changes announced via `aria-live="polite"`; viewer landmark labeled
- **Reduced motion**: respects `prefers-reduced-motion` for page-flip animations
- **Error states**: failed fetch falls back to the embedded download link gracefully

### Public API

```js
import { Slipsheet } from '@slipsheet/viewer';

// Auto-hydrate everything matching .slipsheet
Slipsheet.init();

// Or with options
Slipsheet.init({
  selector: '.slipsheet',                    // override default selector
  lazy: true,                                // IntersectionObserver-gated load
  lazyMargin: '200px',                       // root margin for lazy
  mobileTapToLoad: true,                     // tap-gate on mobile cellular
  mobileTapToLoadConnection: 'cellular',     // 'cellular' | 'slow' | 'always' | 'never'
  pdfJsUrl: '/vendor/pdfjs/build/pdf.min.js', // override PDF.js source
  pdfJsWorkerUrl: '/vendor/pdfjs/build/pdf.worker.min.js',
  onPageChange: (el, page, total) => {},     // analytics hook
  onFullscreenEnter: (el) => {},
  onDownload: (el) => {}
});

// Or hydrate a specific element
Slipsheet.attach(element);
```

### Dependencies

- **PDF.js** (Mozilla, Apache 2.0, ~3MB). Loaded lazily on first viewer activation, never blocking page load.
- No other runtime dependencies. ES2017 baseline.

### Bundle strategy

Two artifacts:

- `@slipsheet/viewer.min.js` (~10KB minified+gzipped, NOT counting PDF.js)
- `@slipsheet/viewer.css` (~3KB minified+gzipped)

PDF.js is loaded on demand from a CDN by default (Mozilla's pinned release URL), but adopters can self-host and override via `pdfJsUrl`.

---

## Host integration

Everything above is shipped by this repo. This section is the part *you* own — it lives in
your application, not here. It's short by design: slipsheet deliberately has no opinion
about your storage, auth, or templating.

### Backend

1. **Accept PDFs in your upload pipeline.** Add `application/pdf` to whatever MIME allow-list
   your existing image upload uses, add a `pdf` extension mapping, and raise the max upload
   size (30 MB is a reasonable ceiling for a report).
2. **Expose an upload endpoint** that stores the file and returns JSON:
   `{ url, pages, filename }`. Reuse your image-upload endpoint's authorization, CSRF, and
   rate-limiting — a PDF upload is not a special case.
3. **Determine the page count** server-side if you can (Imagick, `pdfinfo`, or any PDF
   library). It's optional: `data-pages` only lets the viewer reserve vertical space ahead
   of the fetch to avoid layout shift. Degrade gracefully when it's unknown.

### Frontend (authoring)

4. **Load `@slipsheet/hugerte`** — CDN or vendored — and add `slipsheet` to your editor's
   `plugins` and `toolbar` config.
5. **Wire `slipsheet_upload_handler`** to POST at your endpoint from step 2.
6. **Configure the editor so it does not damage the markup on save.** Two settings, both
   required, both documented in the plugin README:
   - `extended_valid_elements` — otherwise the serializer strips the `data-*` and
     `contenteditable` attributes.
   - `convert_urls: false` — otherwise the editor rewrites the fallback link's `href` to be
     document-relative while leaving `data-src` alone. The viewer then renders one file
     while the no-JS download link points at another. This breaks the degradation guarantee
     that the whole design rests on, and it breaks it silently, for exactly the readers who
     depend on it most.
7. *Optional:* show the toolbar button conditionally, if only some content types should
   accept PDFs.

### Frontend (reading)

8. **Include `viewer.min.js` and `viewer.min.css`** on the pages that render stored content.
   Scoping this to the templates that actually display embeds avoids loading PDF.js machinery
   site-wide.
9. **Call `Slipsheet.init()`** on `DOMContentLoaded` with your config.
10. *Optional:* the viewer reads Bootstrap 5.3 `--bs-*` CSS variables when present, so it
    inherits your theme's accent and surface colors automatically. It falls back to neutral
    defaults otherwise.

### Data model

**No schema change required.** The markup is inline HTML and lives wherever your editor
content already lives — a TEXT column, a document store, flat files. Nothing about slipsheet
needs its own table.

One thing to verify: if you sanitize stored HTML before rendering (you should), your
allow-list must permit `div` with `class` and `data-*` attributes, plus the child `<a>`.
Confirm this before your first upload — a sanitizer that strips `data-src` leaves the
download-link fallback working but the viewer with nothing to hydrate.

Strip `contenteditable` in your public-render sanitizer. It is an editor-side hint and is
not part of the Layer 2 contract.

---

## Editor upgrade resilience strategy

Concrete plan, not platitudes.

1. **Pin HugeRTE in host codebases.** Pin a specific patch version in your editor templates rather than tracking a floating major. Upgrades should be deliberate, never automatic.
2. **Stable-API-only commitment for the plugin** (see "Compatibility commitments" in Layer 1). The chosen APIs are documented stable in TinyMCE since v5 and inherit unchanged into HugeRTE 1.x.
3. **CI matrix in the open-source repo.** Test the plugin against HugeRTE 1.x latest, plus TinyMCE 6.x latest as a compatibility check. When HugeRTE N+1 drops, we know within hours if anything broke.
4. **Documented compatibility table in README.** "v1.x supports HugeRTE 1.x and TinyMCE 6.x. v2.x will support HugeRTE 2.x." Etc.
5. **Branch-per-major-incompatibility.** If HugeRTE 2 ships and breaks something, `main` continues for 1.x, `hugerte-2` branch for new compatibility. We publish two npm tags (`@latest` and `@hugerte-2`).
6. **Markup contract is the safety net.** Even if the plugin breaks against a future HugeRTE, every existing PDF in every existing post still renders correctly via Layer 3 (which doesn't know any editor exists). Worst case: editors temporarily lose the toolbar button until we ship a patch; existing content keeps working.

---

## Design decisions

The reasoning behind choices that are otherwise easy to second-guess.

### Bundle / build strategy

Ship both a vanilla drop-in and an npm package. Source is plain JS / ES modules; the release
pipeline produces minified + source-mapped files for direct CDN or vendored use *and*
publishes to npm. Adopters with a bundler get the conventional path; adopters with no build
step at all get a `curl`-and-go file. Neither audience is a second-class citizen.

### Should the plugin auto-load the viewer?

**No — independent by default.** When someone installs `@slipsheet/hugerte`, it does not
pull in `@slipsheet/viewer` for them. Adopters who already have a PDF renderer shouldn't pay
for a download they discard, and the two packages are only joined by the markup contract.

A `slipsheet_auto_render: true` convenience flag that loads the viewer JS+CSS on demand is
the planned middle ground for people who *do* want the drop-in experience.

### PDF.js delivery

Default to a known-good CDN with an explicit `pdfJsUrl` override, and document the tradeoff.
A third-party CDN request has real privacy implications — it discloses your readers to
another host — so adopters who care must be able to self-host in one line. The default
optimizes for getting started; the override exists because the default is not right for
everyone.

PDF.js is loaded lazily on first viewer activation, never bundled. Adopters get PDF.js
security updates without waiting on a slipsheet release.

### License: MIT

MIT is the overwhelming default for JS editor plugins — no copyleft, business-friendly, and
it matches HugeRTE's own license, which is the natural community signal. PDF.js is Apache
2.0, but slipsheet depends on it at runtime rather than bundling it, so there is no
license-mixing concern.

### Why the markup class is `slipsheet`

End-to-end brand consistency, matching the convention in comparable libraries (Plyr's
`js-plyr`, Splide's `splide`, Embla's `embla`). Adopters who want a generic class can
override it with the `selector` option — the contract is the attributes, not the name.

---

## Anti-goals (what this is explicitly NOT)

- Not a PDF EXPORT feature (TinyMCE has those plugins; this is the inverse)
- Not a generic file attachment system (PDFs only; future expansion possible but out of scope for v1)
- Not a PDF editor or annotator (read-only)
- Not server-side rendering (PDF.js runs in the browser; reduces server load and surface area)
- Not a wrapper around a SaaS PDF viewer (DocSend, Issuu, Scribd) — those have privacy / cost / attribution concerns and defeat the purpose of an open library

---

## Success criteria

Implementation considered done when:

1. An author can upload a PDF in HugeRTE, hit insert, and see a placeholder card in the editor
2. The published blog post renders that PDF inline with page navigation, fullscreen, and download
3. Mobile users on cellular see a tap-to-load placeholder
4. Keyboard-only users can navigate every viewer affordance
5. Screen-reader users hear page changes announced
6. The plugin works against HugeRTE 1.x in CI; verified API-compatible against TinyMCE 6
7. README enables a stranger to drop the plugin into their HugeRTE setup in under 10 minutes (and notes that TinyMCE 6 works the same way)
8. PDF.js never blocks initial page render (lazy)
9. The viewer survives the plugin being uninstalled (markup-only fallback works)
10. A real published post with an embedded PDF matches the LinkedIn-quality reading target end to end

---

## References

- HugeRTE: https://hugerte.org/ and https://github.com/hugerte/hugerte
- HugeRTE docs (separate repo): https://github.com/hugerte/hugerte-docs
- HugeRTE CDN: `https://cdn.jsdelivr.net/npm/hugerte@1/hugerte.min.js`
- TinyMCE 6 plugin docs (HugeRTE inherits this API surface): https://www.tiny.cloud/docs/tinymce/6/creating-a-custom-plugin/
- TinyMCE upload handlers (idiomatic pattern we mirror): https://www.tiny.cloud/docs/tinymce/6/upload-images/
- PDF.js documentation: https://mozilla.github.io/pdf.js/
- LinkedIn's PDF viewer (UX reference): observe behavior on a feed post that includes a PDF
