# Contributing

Thanks for looking. This is a small project with a few unusual constraints, and
most of them are not guessable from reading the code. This document is mainly
about those.

If you only read one section, read [The rules](#the-rules).

## Getting set up

```bash
git clone https://github.com/jonto/slipsheet.git
cd slipsheet
npm install          # installs esbuild, the only dev dependency
npm run build        # builds both packages into packages/*/dist/
npm run serve        # static server on :8003
```

Then open `examples/basic.html` for the viewer alone, or `examples/editor.html`
for the full editor round trip. The editor demo fakes its upload handler with
`URL.createObjectURL`, so it works offline.

## How the pieces fit

Three layers, decoupled on purpose. `ARCHITECTURE.md` has the long version;
this is the part that matters when you are changing something:

1. **`@slipsheet/hugerte`** writes markup. It cannot render.
2. **The markup contract** is a plain `div` with `data-*` attributes and a
   nested download link. It is the only thing the two packages share.
3. **`@slipsheet/viewer`** reads markup and hydrates it. It cannot upload, and
   it does not know that editors exist.

Almost every design question resolves by asking which layer a thing belongs to.

## The rules

These are the constraints that make the project work. A change that breaks one
of them will be sent back even if the code is good.

### 1. The plugin uses only these editor APIs

```
PluginManager.add(name, fn)
editor.ui.registry.addButton(name, spec)
editor.ui.registry.addIcon(name, svg)
editor.windowManager.open(spec)
editor.notificationManager.open(spec)
editor.insertContent(html)
editor.options.get(name) / editor.options.register(name, spec)
```

Nothing else. This list is the entire reason the same plugin code runs on both
HugeRTE 1.x and TinyMCE 6, and it is what makes editor upgrades boring. A
convenient undocumented API will work today and strand adopters later. If you
genuinely need something outside this list, open an issue first and we will
talk about whether the feature is worth the compatibility cost.

### 2. Layers stay ignorant of each other

The plugin must not render PDFs. The viewer must not know about editors. If you
find yourself importing one package into the other, the design has gone wrong
somewhere earlier.

### 3. The markup contract is close to permanent

Whatever the plugin writes ends up in other people's databases, inside blog
posts, for years. Removing or renaming a `data-*` attribute breaks content that
was authored correctly at the time.

Additive changes (new optional attributes) are fine. Anything else needs a
discussion and, realistically, a major version.

### 4. No runtime dependencies

The viewer loads PDF.js at runtime from a URL the adopter controls. That is the
only external code involved, and it is deliberately not bundled. Please do not
add npm dependencies to either package.

### 5. `dist/` is committed

Unusual, and deliberate: jsDelivr serves the built files straight from the
repo, and `examples/dist.html` works without a build step. So:

```bash
npm run build        # before you commit, if you touched src/
```

A PR where `src/` and `dist/` disagree will produce confusing diffs and a CDN
serving something that does not match the source.

### 6. Accessibility is a feature, not a nice-to-have

The viewer advertises keyboard navigation, screen reader announcements, and
`prefers-reduced-motion` support. If you change the UI, keep them working:

- Every control reachable and operable by keyboard
- Visible focus indicators (never remove an outline without replacing it)
- Page changes announced through the existing `aria-live` region
- Contrast at WCAG AA or better
- Transitions disabled under `prefers-reduced-motion`

## Verifying your change

**There are no automated tests yet.** The `npm test` scripts are stubs that
exit 0 without running anything. Do not read a passing `npm test` as a signal
of any kind.

Until that is fixed, verification is manual. For anything touching the viewer:

- [ ] `npm run build` succeeds
- [ ] `examples/basic.html` renders page 1 and navigates with the toolbar
- [ ] Arrow keys, `Home`, `End`, and `F` (fullscreen) all work after clicking
      the embed
- [ ] `examples/multi.html` still lazy-loads the second embed only on scroll
- [ ] `examples/dist.html` behaves identically to `basic.html`
- [ ] With JavaScript disabled, the download link is visible and works
- [ ] Checked in at least two browsers, one of them Safari or Firefox

For anything touching the plugin:

- [ ] `examples/editor.html` inserts a working embed
- [ ] The inserted markup matches the Layer 2 contract exactly
- [ ] "Toggle HTML source" shows what you expect the editor to save
- [ ] No editor API outside the list in rule 1

Say in the PR what you actually checked. "Tested in Chrome and Firefox, did not
test fullscreen" is more useful than silence, and much more useful than a claim
that does not hold.

## Especially welcome

- **Tests and CI.** This is the biggest gap in the project. `ARCHITECTURE.md`
  calls for a CI matrix against HugeRTE 1.x and TinyMCE 6 so that a breaking
  editor release is caught within hours. It does not exist yet. If you want to
  build it, that is probably the most valuable contribution available.
- **Real-world bug reports.** The viewer has been exercised on a limited range
  of PDFs. Files that render badly are useful, especially with the PDF attached
  or linked.
- **Accessibility findings.** Tested with an actual screen reader beats an
  automated audit.
- **Cases where the markup contract is wrong.** It is nearly frozen, so now is
  the time.

## Pull requests

Fork, branch, and open a PR against `main`. Small and focused beats large and
comprehensive; if a change touches both packages, say why in the description.

Commit messages: a short summary line, then prose explaining *why* if the
reason is not obvious from the diff. No particular format required.

For anything larger than a bug fix, open an issue first. It is a pre-1.0
project with strong opinions about its own structure, and it would be a shame
for you to build something good that does not fit.

## Questions

Open an issue, or comment on the
[HugeRTE discussion thread](https://github.com/orgs/hugerte/discussions/207).

By contributing, you agree that your contributions are licensed under the MIT
License, the same as the rest of the project.
