#!/usr/bin/env node
/*
 * slipsheet build script.
 *
 * Produces minified + source-mapped dist/ output for each package. Uses
 * esbuild (the only dev dependency). Does NOT bundle PDF.js — the viewer
 * keeps its dynamic import so adopters get lazy loading and PDF.js
 * updates without re-releasing slipsheet.
 *
 * Run via: npm run build
 *
 * Output:
 *   packages/viewer/dist/viewer.min.{js,js.map,css,css.map}
 *   packages/hugerte/dist/plugin.min.{js,js.map}
 */

import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const PACKAGES = [
  {
    name: 'viewer',
    js: { entry: 'src/index.js', out: 'viewer.min.js' },
    css: { entry: 'src/viewer.css', out: 'viewer.min.css' },
  },
  {
    name: 'hugerte',
    // 'plugin.min.js' is the conventional TinyMCE-family plugin filename.
    js: { entry: 'src/index.js', out: 'plugin.min.js' },
  },
];

async function buildPackage(pkg) {
  const pkgRoot = resolve(ROOT, 'packages', pkg.name);
  const outdir = resolve(pkgRoot, 'dist');

  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  // JS — keep ESM and keep dynamic imports (PDF.js stays a runtime fetch
  // for the viewer; the hugerte plugin has no dynamic imports).
  await build({
    entryPoints: [resolve(pkgRoot, pkg.js.entry)],
    outfile: resolve(outdir, pkg.js.out),
    bundle: false,
    minify: true,
    sourcemap: true,
    format: 'esm',
    target: 'es2020',
    legalComments: 'inline',
  });

  if (pkg.css) {
    await build({
      entryPoints: [resolve(pkgRoot, pkg.css.entry)],
      outfile: resolve(outdir, pkg.css.out),
      minify: true,
      sourcemap: true,
      loader: { '.css': 'css' },
    });
  }

  console.log(`  built packages/${pkg.name}/dist/`);
}

console.log('slipsheet build:');
for (const pkg of PACKAGES) {
  await buildPackage(pkg);
}
console.log('done.');
