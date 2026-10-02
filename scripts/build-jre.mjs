#!/usr/bin/env node
// Builds a minimal Java runtime into build/jre with jlink. The packaged app ships it, so players
// don't need Java installed. The engine only uses java.base, so the runtime is small (~50 MB).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'build', 'jre');
const marker = path.join(out, 'release');

function tool(name) {
  if (process.env.JAVA_HOME) {
    const candidate = path.join(process.env.JAVA_HOME, 'bin', name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return name;
}

if (fs.existsSync(marker) && !process.argv.includes('--force')) {
  console.log('✔ Bundled Java runtime already built (build/jre). Use --force to rebuild.');
  process.exit(0);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.dirname(out), { recursive: true });
console.log('☕ Linking a minimal Java runtime (java.base)…');
const result = spawnSync(tool('jlink'), [
  '--add-modules', 'java.base',
  '--strip-debug',
  '--no-man-pages',
  '--no-header-files',
  '--compress', 'zip-6',
  '--output', out,
], { stdio: 'inherit' });

if (result.error || result.status !== 0) {
  console.error('✖ jlink failed. Install a full JDK (17+) and make sure jlink is on your PATH or JAVA_HOME is set.');
  process.exit(result.status || 1);
}
console.log(`✔ Built ${path.relative(root, out)}`);
