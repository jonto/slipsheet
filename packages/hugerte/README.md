# @slipsheet/hugerte

> **Status: pre-1.0 (`0.x`).** Functional with working examples; the public API may still change before `1.0`. HugeRTE 1.x is the primary target; TinyMCE 6 compatibility is verified as a bonus.

[HugeRTE](https://hugerte.org/) plugin: adds a toolbar button that uploads a PDF via a user-provided handler and inserts standardized `.slipsheet` markup into the editor. Has no opinion about the upload backend — you bring your own.

API-compatible with TinyMCE 6 (the last MIT-licensed TinyMCE). The same plugin code works in both editors; only the init function name differs (`hugerte.init` vs `tinymce.init`).

## Quick start

```html
<script src="https://cdn.jsdelivr.net/npm/hugerte@1/hugerte.min.js"></script>
<script type="module" src="https://cdn.jsdelivr.net/npm/@slipsheet/hugerte/dist/plugin.min.js"></script>
<script>
  hugerte.init({
    selector: '#editor',
    license_key: 'gpl',
    plugins: 'lists link image slipsheet',
    toolbar: 'undo redo | bold italic | link image slipsheet | code',
    slipsheet_upload_handler: function (file, progress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/your/upload/endpoint');
        xhr.upload.onprogress = (e) => progress((e.loaded / e.total) * 100);
        xhr.onload = () => {
          const r = JSON.parse(xhr.responseText);
          resolve({ src: r.url, pages: r.pages, filename: file.name });
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        const fd = new FormData();
        fd.append('file', file);
        xhr.send(fd);
      });
    },
  });
</script>
```

For TinyMCE 6, replace `hugerte.init({...})` with `tinymce.init({...})`. Every other option is identical. The plugin auto-detects which editor is loaded.

## Configuration

| Option | Default | Description |
|---|---|---|
| `slipsheet_upload_handler` | — (required) | Async `(file, progress) => { src, pages?, filename? }`. Receives the `File` object and a `progress(percent)` callback. Resolve with the public URL of the uploaded PDF, optionally with page count and filename. |
| `slipsheet_max_size` | `30 * 1024 * 1024` (30 MB) | Client-side size limit. Friendly error notification if exceeded. Server should enforce its own limit. |
| `slipsheet_accept` | `.pdf,application/pdf` | File picker filter. |
| `slipsheet_button_tooltip` | `Insert PDF` | i18n hook for the toolbar button tooltip. |

## Inserted markup

Matches the [`@slipsheet/viewer`](../viewer/) contract:

```html
<div class="slipsheet" data-src="https://..." data-pages="12" data-filename="report.pdf">
  <a href="https://..." download="report.pdf">Download report.pdf (12 pages)</a>
</div>
```

User-provided strings (`src`, `filename`) are HTML-escaped before insertion to prevent injection. `pages` is validated as a positive integer or omitted.

## Editor compatibility

- **Primary target**: HugeRTE 1.x
- **Bonus compatibility**: TinyMCE 6.x (the last MIT-licensed TinyMCE — for anyone stuck on legacy versions for license reasons)
- **Not supported**: TinyMCE 7+ (different license, different community trajectory; see [Why HugeRTE and not TinyMCE](../../ARCHITECTURE.md#why-hugerte-and-not-tinymce) for the reasoning)

The plugin uses only documented stable APIs that are present and identical in both HugeRTE 1.x and TinyMCE 6: `PluginManager.add`, `editor.ui.registry.{addButton,addIcon}`, `editor.notificationManager.open`, `editor.insertContent`, `editor.options.{register,get}`.

## Required editor configuration

Two settings. Without them the editor quietly damages the markup on save, and
the damage only shows up for readers.

```js
// 1. The editor sanitizes content by default and will strip the contract's
//    data-* attributes and the contenteditable hint unless they are allowed.
extended_valid_elements: 'div[class|data-src|data-pages|data-filename|contenteditable],a[href|download|target]',
valid_children: '+div[a]',

// 2. URL conversion is on by default. It rewrites the fallback link's href to
//    be document-relative but leaves data-src untouched, so after a save the
//    two point at different files: the viewer renders one PDF while the
//    no-JS download link fetches another (usually a 404).
convert_urls: false,
```

`relative_urls: false` also fixes the second problem if you need URL conversion
elsewhere in your content; `convert_urls: false` is the blunter, safer default.

Both are verified in CI against HugeRTE 1.x and TinyMCE 6 by round-tripping the
markup through each editor's serializer.

## Demo

`examples/editor.html` in this repo shows the full round-trip — editor + plugin + viewer, with a fake upload handler that works offline (uses `URL.createObjectURL`).

## See also

- Full architecture: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- Why HugeRTE and not TinyMCE: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md#why-hugerte-and-not-tinymce)
- Sibling package: [`../viewer/`](../viewer/) — the standalone PDF.js viewer that hydrates the markup we emit
