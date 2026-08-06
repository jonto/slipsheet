/*
 * @slipsheet/viewer — standalone PDF.js wrapper.
 *
 * Hydrates .slipsheet markup into an interactive PDF viewer. Editor-agnostic:
 * does not depend on HugeRTE, TinyMCE, or any rich-text framework. Markup
 * contract: <div class="slipsheet" data-src="..." data-pages="..." data-filename="...">
 * with a child <a href="..." download="...">fallback link</a>.
 *
 * v0.0.3 — Phase 1 polish round 2:
 *   - Fullscreen via HTML5 Fullscreen API + CSS-modal fallback for browsers
 *     that don't support it. Re-renders at fit-to-viewport scale on enter,
 *     restores normal scale on exit. Esc exits.
 *   - Jump-to-page input (replaces the static "Page N of M" with editable
 *     input + " of N" suffix). Validates and clamps to range. Enter or blur
 *     commits the change.
 *   - Mobile cellular tap-to-load: when NetworkInformation API reports
 *     saveData=true OR effectiveType in {slow-2g, 2g}, defer hydration and
 *     show a "Tap to load PDF" placeholder. Bandwidth-respectful default.
 *   - Hidden visually-hidden aria-live span for screen-reader announcements
 *     (separate from the editable input so input value-changes don't double-fire).
 *
 * v0.0.2: chrome (toolbar), keyboard nav, IntersectionObserver lazy gate,
 * render-any-page with in-flight cancellation.
 *
 * v0.0.1: discovery + lazy PDF.js + first-page render.
 *
 * Coming next: cross-browser pass, dist/ minified bundle build.
 */

const DEFAULT_PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs';
const DEFAULT_PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs';

let pdfjsPromise = null;

function loadPdfJs(url, workerUrl) {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ url).then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = workerUrl;
      return mod;
    });
  }
  return pdfjsPromise;
}

const ICONS = {
  prev: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M10.5 3.5 6 8l4.5 4.5 1-1L8 8l3.5-3.5z"/></svg>',
  next: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M5.5 3.5 10 8l-4.5 4.5-1-1L8 8 4.5 4.5z"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 1v8.59l3-3 1 1L8 11.59 3.5 7.09l1-1L7 8.59V1zM2 14h12v1H2z"/></svg>',
  fullscreen: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2 2v4h1V3h3V2H2zm12 0h-4v1h3v3h1V2zM2 10v4h4v-1H3v-3H2zm12 0h-1v3h-3v1h4v-4z"/></svg>',
  exitFullscreen: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M6 2v3H3v1h4V2H6zm4 0v4h4V5h-3V2h-1zM2 10v1h3v3h1v-4H2zm12 0h-4v4h1v-3h3v-1z"/></svg>',
};

function shouldDeferToTap(opts) {
  if (!opts.tapToLoadOnSlow) return false;
  // NetworkInformation API: Chromium implements navigator.connection;
  // Safari + Firefox don't. When unavailable, assume the connection is fine.
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false;
  if (conn.saveData === true) return true;
  if (conn.effectiveType && ['slow-2g', '2g'].includes(conn.effectiveType)) return true;
  return false;
}

function fullscreenAvailable() {
  return typeof document !== 'undefined' && (
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled
  );
}

function requestFullscreen(el) {
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  return Promise.reject(new Error('Fullscreen API unavailable'));
}

function exitFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  return Promise.resolve();
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function createChrome(doc, filename, totalPages, src, options) {
  const chrome = doc.createElement('div');
  chrome.className = 'slipsheet__chrome';

  const prev = doc.createElement('button');
  prev.type = 'button';
  prev.className = 'slipsheet__btn';
  prev.setAttribute('aria-label', 'Previous page');
  prev.innerHTML = ICONS.prev;

  // Editable jump-to-page input + " of N" suffix.
  const indicator = doc.createElement('span');
  indicator.className = 'slipsheet__indicator';

  const pageInput = doc.createElement('input');
  pageInput.type = 'number';
  pageInput.className = 'slipsheet__page-input';
  pageInput.min = '1';
  pageInput.max = String(totalPages);
  pageInput.value = '1';
  pageInput.setAttribute('aria-label', 'Current page (editable)');
  // Auto-size to fit total-pages digit count.
  pageInput.style.width = `${Math.max(2, String(totalPages).length + 1)}ch`;

  const ofTotal = doc.createElement('span');
  ofTotal.className = 'slipsheet__page-total';
  ofTotal.textContent = ` of ${totalPages}`;

  indicator.append('Page ', pageInput, ofTotal);

  const next = doc.createElement('button');
  next.type = 'button';
  next.className = 'slipsheet__btn';
  next.setAttribute('aria-label', 'Next page');
  next.innerHTML = ICONS.next;

  const spacer = doc.createElement('span');
  spacer.className = 'slipsheet__spacer';
  spacer.setAttribute('aria-hidden', 'true');

  const download = doc.createElement('a');
  download.className = 'slipsheet__btn';
  download.setAttribute('aria-label', filename ? `Download ${filename}` : 'Download PDF');
  download.href = src;
  if (filename) download.download = filename;
  download.innerHTML = ICONS.download;

  let fullscreen = null;
  if (options.fullscreen) {
    fullscreen = doc.createElement('button');
    fullscreen.type = 'button';
    fullscreen.className = 'slipsheet__btn slipsheet__btn--fullscreen';
    fullscreen.setAttribute('aria-label', 'Enter fullscreen');
    fullscreen.innerHTML = ICONS.fullscreen;
  }

  // Hidden visually-hidden span for screen-reader announcements. Separate
  // from the editable input so input value-changes don't double-announce.
  const announce = doc.createElement('span');
  announce.className = 'slipsheet__sr-only';
  announce.setAttribute('aria-live', 'polite');
  announce.setAttribute('aria-atomic', 'true');
  announce.textContent = `Page 1 of ${totalPages}`;

  chrome.append(prev, indicator, next, spacer, download);
  if (fullscreen) chrome.append(fullscreen);
  chrome.append(announce);

  return { chrome, prev, pageInput, next, download, fullscreen, announce };
}

async function renderPage(state, pageNum) {
  if (state.renderTask) {
    try { state.renderTask.cancel(); } catch (_) { /* noop */ }
  }

  const page = await state.pdf.getPage(pageNum);
  const scale = state.fitScale ?? state.scale;
  const viewport = page.getViewport({ scale });

  const dpr = window.devicePixelRatio || 1;
  state.canvas.width = viewport.width * dpr;
  state.canvas.height = viewport.height * dpr;
  // Set only style.width as the design-size hint. CSS handles `max-width:
  // 100%` + `height: auto` to keep the aspect ratio when the container is
  // narrower than the natural width (e.g., landscape PDFs, narrow columns).
  // Setting style.height explicitly would override `height: auto` and
  // produce a distorted canvas.
  state.canvas.style.width = `${viewport.width}px`;
  state.canvas.style.height = '';

  const ctx = state.canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  state.renderTask = page.render({ canvasContext: ctx, viewport });
  try {
    await state.renderTask.promise;
    state.currentPage = pageNum;
    state.pageInput.value = String(pageNum);
    state.announce.textContent = `Page ${pageNum} of ${state.totalPages}`;
    state.el.dataset.slipsheetCurrentPage = String(pageNum);
    state.prev.disabled = pageNum <= 1;
    state.next.disabled = pageNum >= state.totalPages;
  } catch (err) {
    if (err && err.name !== 'RenderingCancelledException') throw err;
  } finally {
    state.renderTask = null;
  }
}

function commitPageInput(state) {
  const requested = parseInt(state.pageInput.value, 10);
  if (Number.isNaN(requested)) {
    state.pageInput.value = String(state.currentPage);
    return;
  }
  const clamped = Math.max(1, Math.min(state.totalPages, requested));
  state.pageInput.value = String(clamped);
  if (clamped !== state.currentPage) renderPage(state, clamped);
}

function attachKeyboard(state) {
  if (!state.el.hasAttribute('tabindex')) state.el.tabIndex = 0;

  state.el.addEventListener('keydown', (e) => {
    // Don't hijack typing inside the jump-to-page input or future text fields.
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
        if (state.currentPage > 1) renderPage(state, state.currentPage - 1);
        break;
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        if (state.currentPage < state.totalPages) renderPage(state, state.currentPage + 1);
        break;
      case 'Home':
        if (state.currentPage !== 1) renderPage(state, 1);
        break;
      case 'End':
        if (state.currentPage !== state.totalPages) renderPage(state, state.totalPages);
        break;
      case 'f':
      case 'F':
        if (state.fullscreenBtn) toggleFullscreen(state);
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  });
}

async function computeFitScale(state) {
  const page = await state.pdf.getPage(state.currentPage);
  const baseViewport = page.getViewport({ scale: 1 });
  // Available space inside .slipsheet when fullscreen: viewport minus
  // chrome height (~3rem) and stage padding (~2rem total).
  const availWidth = window.innerWidth - 32; // 1rem padding each side
  const availHeight = window.innerHeight - 80; // chrome (~48px) + padding
  return Math.min(availWidth / baseViewport.width, availHeight / baseViewport.height);
}

async function toggleFullscreen(state) {
  if (state.fullscreenMode) {
    await leaveFullscreen(state);
  } else {
    await enterFullscreen(state);
  }
}

async function enterFullscreen(state) {
  if (fullscreenAvailable()) {
    try {
      await requestFullscreen(state.el);
    } catch (err) {
      console.warn('Slipsheet: fullscreen request rejected, using modal fallback', err);
      state.el.classList.add('slipsheet--modal-fullscreen');
    }
  } else {
    state.el.classList.add('slipsheet--modal-fullscreen');
  }
  state.fullscreenMode = true;
  state.el.dataset.slipsheetFullscreen = 'true';
  if (state.fullscreenBtn) {
    state.fullscreenBtn.setAttribute('aria-label', 'Exit fullscreen');
    state.fullscreenBtn.innerHTML = ICONS.exitFullscreen;
  }
  state.fitScale = await computeFitScale(state);
  await renderPage(state, state.currentPage);
}

async function leaveFullscreen(state) {
  if (fullscreenElement()) {
    try { await exitFullscreen(); } catch (_) { /* noop */ }
  }
  state.el.classList.remove('slipsheet--modal-fullscreen');
  state.fullscreenMode = false;
  delete state.el.dataset.slipsheetFullscreen;
  if (state.fullscreenBtn) {
    state.fullscreenBtn.setAttribute('aria-label', 'Enter fullscreen');
    state.fullscreenBtn.innerHTML = ICONS.fullscreen;
  }
  state.fitScale = null;
  await renderPage(state, state.currentPage);
}

function attachFullscreenListeners(state) {
  if (!state.fullscreenBtn) return;

  state.fullscreenBtn.addEventListener('click', () => toggleFullscreen(state));

  // Detect browser-driven fullscreen exit (Esc key, browser controls).
  const onChange = () => {
    if (!fullscreenElement() && state.fullscreenMode) {
      // Browser exited fullscreen; sync our state.
      leaveFullscreen(state);
    }
  };
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);

  // Modal-fallback: Esc exits.
  state.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.fullscreenMode && !fullscreenElement()) {
      e.preventDefault();
      leaveFullscreen(state);
    }
  });
}

function renderTapToLoadPlaceholder(el, options, onTap) {
  const filename = el.dataset.filename || 'PDF';
  const pages = el.dataset.pages ? `${el.dataset.pages} pages` : '';

  const placeholder = document.createElement('button');
  placeholder.type = 'button';
  placeholder.className = 'slipsheet__tap-to-load';
  placeholder.setAttribute('aria-label', `Load ${filename}${pages ? ` (${pages})` : ''}`);

  const heading = document.createElement('span');
  heading.className = 'slipsheet__tap-heading';
  heading.textContent = `Load ${filename}`;

  const meta = document.createElement('span');
  meta.className = 'slipsheet__tap-meta';
  meta.textContent = pages
    ? `${pages} · You're on a slow or metered connection. Tap to load.`
    : `You're on a slow or metered connection. Tap to load.`;

  placeholder.append(heading, meta);
  placeholder.addEventListener('click', () => {
    el.dataset.slipsheetState = 'loading';
    onTap();
  });

  el.dataset.slipsheetState = 'awaiting-tap';
  el.replaceChildren(placeholder);
}

async function hydrate(el, options) {
  if (el.dataset.slipsheetHydrated === 'true') return;

  const src = el.dataset.src;
  if (!src) {
    console.warn('Slipsheet: missing data-src on', el);
    return;
  }

  el.dataset.slipsheetState = 'loading';

  try {
    const pdfjs = await loadPdfJs(options.pdfJsUrl, options.pdfJsWorkerUrl);
    const pdf = await pdfjs.getDocument(src).promise;

    const filename = el.dataset.filename || '';
    const totalPages = pdf.numPages;

    const wrapper = document.createElement('div');
    wrapper.className = 'slipsheet__viewer';

    const { chrome, prev, pageInput, next, fullscreen, announce } =
      createChrome(document, filename, totalPages, src, options);

    const stage = document.createElement('div');
    stage.className = 'slipsheet__stage';

    const canvas = document.createElement('canvas');
    canvas.className = 'slipsheet__canvas';
    canvas.setAttribute('aria-label', filename ? `${filename} preview` : 'PDF preview');

    stage.appendChild(canvas);
    wrapper.append(chrome, stage);

    const state = {
      el, pdf, canvas, pageInput, prev, next, announce,
      fullscreenBtn: fullscreen,
      currentPage: 1,
      totalPages,
      scale: options.scale,
      fitScale: null,
      fullscreenMode: false,
      renderTask: null,
    };

    prev.addEventListener('click', () => {
      if (state.currentPage > 1) renderPage(state, state.currentPage - 1);
    });
    next.addEventListener('click', () => {
      if (state.currentPage < state.totalPages) renderPage(state, state.currentPage + 1);
    });

    pageInput.addEventListener('change', () => commitPageInput(state));
    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitPageInput(state);
        pageInput.blur();
      }
    });

    attachKeyboard(state);
    attachFullscreenListeners(state);

    el.replaceChildren(wrapper);
    el.dataset.slipsheetHydrated = 'true';
    el.dataset.slipsheetState = 'ready';
    el.dataset.slipsheetPages = String(totalPages);
    el.dataset.slipsheetCurrentPage = '1';

    await renderPage(state, 1);
  } catch (err) {
    console.error('Slipsheet: render failed', err);
    el.dataset.slipsheetState = 'error';
  }
}

const Slipsheet = {
  defaults: {
    selector: '.slipsheet',
    pdfJsUrl: DEFAULT_PDFJS_URL,
    pdfJsWorkerUrl: DEFAULT_PDFJS_WORKER_URL,
    scale: 1.5,
    lazy: true,
    lazyMargin: '200px',
    fullscreen: true,
    tapToLoadOnSlow: true,
  },

  async init(options = {}) {
    const opts = { ...Slipsheet.defaults, ...options };
    const els = document.querySelectorAll(opts.selector);
    return Promise.all(Array.from(els).map((el) => Slipsheet.attach(el, opts)));
  },

  attach(el, options = {}) {
    const opts = { ...Slipsheet.defaults, ...options };

    // Cellular / save-data path: render a "Tap to load" placeholder; only
    // hydrate on user gesture. Independent of the lazy-scroll gate.
    if (shouldDeferToTap(opts)) {
      return new Promise((resolve) => {
        renderTapToLoadPlaceholder(el, opts, () => {
          hydrate(el, opts).then(resolve);
        });
      });
    }

    // Eager path: hydrate now. Used for above-fold elements or when
    // IntersectionObserver isn't available.
    if (!opts.lazy || typeof IntersectionObserver === 'undefined') {
      return hydrate(el, opts);
    }

    // Lazy path: wait until the element scrolls into the viewport (with a
    // configurable rootMargin headroom) before fetching the PDF. Saves
    // bandwidth on long pages with multiple embeds.
    return new Promise((resolve) => {
      const observer = new IntersectionObserver((entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            obs.disconnect();
            hydrate(entry.target, opts).then(resolve);
            return;
          }
        }
      }, { rootMargin: opts.lazyMargin });
      observer.observe(el);
    });
  },
};

if (typeof window !== 'undefined') {
  window.Slipsheet = Slipsheet;
}

export { Slipsheet };
export default Slipsheet;
