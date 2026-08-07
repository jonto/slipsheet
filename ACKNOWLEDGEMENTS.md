# Acknowledgements

slipsheet is a thin layer over other people's work. This file records what it
depends on, what it borrows from, and who made those things.

## Runtime

**[PDF.js](https://mozilla.github.io/pdf.js/)** — Mozilla, Apache License 2.0.
Does all of the actual PDF parsing and rendering. `@slipsheet/viewer` is, in
honest terms, a set of controls and an accessibility layer wrapped around it.
slipsheet does not bundle or redistribute PDF.js; the viewer loads
`pdfjs-dist@4` at runtime from a URL you control, defaulting to jsDelivr. That
means Apache 2.0 code is never mixed into this MIT-licensed distribution, and
you get PDF.js security updates without waiting on a release here.

**[HugeRTE](https://hugerte.org/)** — HugeRTE contributors, MIT. The editor
`@slipsheet/hugerte` plugs into, declared as a peer dependency rather than
bundled. HugeRTE is a community fork of the last MIT-licensed TinyMCE, and it
exists because someone did the unglamorous work of maintaining a permissively
licensed editor after that option went away commercially. This project would
not exist without it.

**[TinyMCE 6](https://www.tiny.cloud/)** — Ephox Corporation DBA Tiny
Technologies, MIT (through version 6). The plugin API slipsheet targets was
designed by the TinyMCE team; HugeRTE inherits it, and this plugin is
API-compatible with both as a direct consequence. The `images_upload_handler`
pattern that `slipsheet_upload_handler` mirrors is theirs.

## Build

**[esbuild](https://esbuild.github.io/)** — Evan Wallace, MIT. Produces the
minified bundles and source maps.

**[jsDelivr](https://www.jsdelivr.com/)** — serves the packages and PDF.js to
anyone using the no-build installation path, for free.

## The demo site

**[Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont)** —
Braille Institute of America, SIL Open Font License 1.1. Drawn to maximize
character distinction for readers with low vision. It is used here because a
page arguing for accessible PDF rendering should be set in a face that makes
the same argument, not as decoration.

**[Literata](https://github.com/googlefonts/literata)** — Google Fonts, SIL
Open Font License 1.1. Display type. Originally commissioned for Google Play
Books, which is why it holds up as a screen-first book serif.

Both license texts ship alongside the font files in
[`assets/fonts/`](assets/fonts/), as the OFL requires.

**[Tufte CSS](https://edwardtufte.github.io/tufte-css/)** — Dave Liepmann, and
Edward Tufte's book design before it. The landing page's arrangement, a fixed
text column with figures breaking measure to the right, is taken from there. No
code was copied; the debt is to the idea.

## The sample document

The PDF used throughout the examples is
**"Trace-based Just-in-Time Type Specialization for Dynamic Languages"** by
Andreas Gal et al. (PLDI 2009). It is the canonical test fixture in the PDF.js
repository, which is why it appears here: it is a real document with real
typography, footnotes, and figures, rather than a synthetic file that would
flatter the renderer.

## Prior art

The interaction model is openly borrowed from **LinkedIn's document embeds**,
which solved the "read a PDF without leaving the page" problem well enough that
users now expect it. slipsheet exists because that experience is not otherwise
available to people running their own publishing stack.

The markup contract owes its shape to the **progressive enhancement** tradition
more broadly: the idea that stored content should degrade to something useful
without JavaScript is not original, just unfashionable.

---

If you believe your work belongs on this list and is not here, that is an
oversight rather than a position. Please
[open an issue](https://github.com/jonto/slipsheet/issues).
