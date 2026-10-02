#!/usr/bin/env node
// Copies the few third-party files the UI loads at runtime (Three.js + the addons it uses, and
// the two fonts) from node_modules into renderer/vendor. The app then ships with no runtime
// node_modules at all, and the UI works fully offline.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');
const vendor = path.join(root, 'renderer', 'vendor');

const copies = [
  ['three/build/three.module.js', 'three/build/three.module.js'],
  ['three/build/three.core.js', 'three/build/three.core.js'],
  ['three/LICENSE', 'three/LICENSE'],
  ...['postprocessing', 'shaders', 'environments', 'utils'].map((d) => [`three/examples/jsm/${d}`, `three/examples/jsm/${d}`]),
  ['@fontsource/orbitron/LICENSE', 'fonts/OFL-Orbitron.txt'],
  ['@fontsource/exo-2/LICENSE', 'fonts/OFL-Exo2.txt'],
];
for (const w of [500, 700, 800, 900]) {
  copies.push([`@fontsource/orbitron/files/orbitron-latin-${w}-normal.woff2`, `fonts/orbitron-latin-${w}-normal.woff2`]);
}
for (const w of [400, 500, 600, 700, 800]) {
  copies.push([`@fontsource/exo-2/files/exo-2-latin-${w}-normal.woff2`, `fonts/exo-2-latin-${w}-normal.woff2`]);
}

if (!fs.existsSync(path.join(nm, 'three'))) {
  console.error('✖ node_modules is missing. Run "npm install" first.');
  process.exit(1);
}

let count = 0;
for (const [from, to] of copies) {
  const src = path.join(nm, from);
  const dest = path.join(vendor, to);
  if (!fs.existsSync(src)) {
    console.error(`✖ Missing ${from}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  count++;
}
console.log(`✔ Vendored ${count} runtime assets into renderer/vendor`);
