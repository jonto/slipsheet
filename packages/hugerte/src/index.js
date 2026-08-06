/*
 * @slipsheet/hugerte — HugeRTE editor plugin.
 *
 * Adds a toolbar button that uploads a PDF via a user-provided handler
 * and inserts standardized .slipsheet markup at the cursor. The viewer
 * (@slipsheet/viewer) hydrates that markup at view time.
 *
 * API-compatible with TinyMCE 6 (the last MIT-licensed TinyMCE). Uses
 * only documented stable plugin APIs:
 *
 *   - PluginManager.add(name, fn)
 *   - editor.options.register(name, spec) + editor.options.get(name)
 *   - editor.ui.registry.addIcon(name, svg)
 *   - editor.ui.registry.addButton(name, spec)
 *   - editor.notificationManager.open(spec) + the returned handle
 *   - editor.insertContent(html)
 *
 * No private APIs. No bundled dependencies. Plain ES module.
 *
 * v0.0.1 — first real implementation. Configuration:
 *   - slipsheet_upload_handler (required, async (file, progress) => {src, pages?, filename?})
 *   - slipsheet_max_size (default 30MB)
 *   - slipsheet_accept (default '.pdf,application/pdf')
 *   - slipsheet_button_tooltip (default 'Insert PDF')
 */

const ICON_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
  'd="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 14h6 M9 17h6 M9 11h2"/>' +
  '</svg>';

// HTML-escape user-provided strings so we don't open an injection vector
// when concatenating into the inserted markup.
function escapeHtml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function renderMarkup(result) {
  const src = escapeHtml(result.src);
  const filename = result.filename ? escapeHtml(result.filename) : '';
  const pages = Number.isInteger(result.pages) && result.pages > 0 ? result.pages : null;

  // contenteditable="false" prevents the editor from placing the caret
  // inside the embed. Without it the user can type into the slipsheet div,
  // which (a) corrupts the standardized markup contract and (b) gets wiped
  // by the viewer at hydration time (replaceChildren on the host element),
  // leaving the reader staring at a PDF panel with no surrounding text.
  // The attribute is editor-side only — host applications should strip it
  // from the public render via their HTML sanitizer (it's not in the
  // standardized contract; the viewer doesn't read it).
  const attrs = ['contenteditable="false"', `data-src="${src}"`];
  if (pages) attrs.push(`data-pages="${pages}"`);
  if (filename) attrs.push(`data-filename="${filename}"`);

  const linkLabel = pages
    ? `Download ${filename || 'PDF'} (${pages} pages)`
    : `Download ${filename || 'PDF'}`;
  const downloadAttr = filename ? ` download="${filename}"` : '';

  return (
    `<div class="slipsheet" ${attrs.join(' ')}>` +
    `<a href="${src}"${downloadAttr}>${linkLabel}</a>` +
    `</div>`
  );
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    let resolved = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.addEventListener('change', () => {
      resolved = true;
      const file = input.files && input.files[0];
      cleanup();
      resolve(file || null);
    });

    // If the user dismisses the dialog without picking, no 'change' fires.
    // We resolve null after the window regains focus to clean up the input.
    const onFocus = () => {
      setTimeout(() => {
        if (!resolved) {
          cleanup();
          window.removeEventListener('focus', onFocus);
          resolve(null);
        }
      }, 200);
    };
    window.addEventListener('focus', onFocus);

    input.click();
  });
}

async function handleAction(editor) {
  const handler = editor.options.get('slipsheet_upload_handler');
  if (typeof handler !== 'function') {
    editor.notificationManager.open({
      text: 'Slipsheet: slipsheet_upload_handler must be configured. See @slipsheet/hugerte README.',
      type: 'error',
    });
    return;
  }

  const accept = editor.options.get('slipsheet_accept');
  const maxSize = editor.options.get('slipsheet_max_size');

  const file = await pickFile(accept);
  if (!file) return; // user cancelled

  if (file.size > maxSize) {
    const limitMB = (maxSize / (1024 * 1024)).toFixed(1);
    const fileMB = (file.size / (1024 * 1024)).toFixed(1);
    editor.notificationManager.open({
      text: `File too large (${fileMB} MB). Maximum is ${limitMB} MB.`,
      type: 'error',
    });
    return;
  }

  const progressNotif = editor.notificationManager.open({
    text: `Uploading ${file.name}…`,
    type: 'info',
    progressBar: true,
    closeButton: false,
  });

  const updateProgress = (percent) => {
    if (progressNotif && progressNotif.progressBar) {
      progressNotif.progressBar.value(Math.max(0, Math.min(100, Math.round(percent))));
    }
  };

  try {
    const result = await handler(file, updateProgress);
    progressNotif.close();

    if (!result || typeof result.src !== 'string') {
      throw new Error('slipsheet_upload_handler must resolve with an object containing a "src" string');
    }

    editor.insertContent(renderMarkup({
      src: result.src,
      pages: result.pages,
      filename: result.filename || file.name,
    }));
  } catch (err) {
    progressNotif.close();
    editor.notificationManager.open({
      text: `Upload failed: ${(err && err.message) || 'unknown error'}`,
      type: 'error',
    });
  }
}

function registerPlugin(editor) {
  // Options. Each gets a processor (TinyMCE 6 / HugeRTE 1.x API) for
  // validation; defaults fire when the option is unset.
  editor.options.register('slipsheet_upload_handler', { processor: 'function' });
  editor.options.register('slipsheet_max_size', {
    processor: 'number',
    default: 30 * 1024 * 1024,
  });
  editor.options.register('slipsheet_accept', {
    processor: 'string',
    default: '.pdf,application/pdf',
  });
  editor.options.register('slipsheet_button_tooltip', {
    processor: 'string',
    default: 'Insert PDF',
  });

  editor.ui.registry.addIcon('slipsheet', ICON_SVG);

  editor.ui.registry.addButton('slipsheet', {
    icon: 'slipsheet',
    tooltip: editor.options.get('slipsheet_button_tooltip'),
    onAction: () => handleAction(editor),
  });

  return {
    getMetadata: () => ({
      name: 'Slipsheet PDF embed',
      url: 'https://github.com/jonto/slipsheet',
    }),
  };
}

(function () {
  if (typeof window === 'undefined') return;
  const editor = window.hugerte || window.tinymce;
  if (!editor || !editor.PluginManager) return;
  editor.PluginManager.add('slipsheet', registerPlugin);
})();

export { registerPlugin, renderMarkup };
