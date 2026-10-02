#!/usr/bin/env node
// Downloads a Windows x64 Java runtime (Eclipse Temurin 21 JRE from Adoptium) into build/jre-win
// so the Windows build can bundle it. Players then don't need Java installed.
//
// The download is checked against the SHA-256 checksum Adoptium publishes for it.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'build', 'jre-win');
const cacheDir = path.join(root, 'build', 'cache');
const API = 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse';

if (fs.existsSync(path.join(out, 'bin', 'java.exe')) && !process.argv.includes('--force')) {
  console.log('✔ Windows Java runtime already present (build/jre-win). Use --force to refetch.');
  process.exit(0);
}

const assets = await (await fetch(API)).json();
const pkg = assets[0]?.binary?.package;
if (!pkg) {
  console.error('✖ Could not find a Windows JRE on the Adoptium API.');
  process.exit(1);
}

fs.mkdirSync(cacheDir, { recursive: true });
const zipPath = path.join(cacheDir, pkg.name);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

if (!fs.existsSync(zipPath) || sha256(zipPath) !== pkg.checksum) {
  console.log(`☕ Downloading ${pkg.name} (${(pkg.size / 1e6).toFixed(1)} MB) from Adoptium…`);
  const res = await fetch(pkg.link);
  if (!res.ok) {
    console.error(`✖ Download failed: HTTP ${res.status}`);
    process.exit(1);
  }
  fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
}
if (sha256(zipPath) !== pkg.checksum) {
  console.error('✖ Checksum mismatch: the download is corrupt or was tampered with.');
  process.exit(1);
}
console.log('✔ Checksum verified');

// bsdtar (macOS, Windows 10+) reads zip files; fall back to unzip elsewhere.
const staging = path.join(cacheDir, 'jre-win-extract');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
let result = spawnSync('tar', ['-xf', zipPath, '-C', staging], { stdio: 'inherit' });
if (result.status !== 0) result = spawnSync('unzip', ['-q', zipPath, '-d', staging], { stdio: 'inherit' });
if (result.status !== 0) {
  console.error('✖ Could not extract the runtime (need tar or unzip).');
  process.exit(1);
}

// The archive contains a single top-level folder such as "jdk-21.0.12.1+1-jre".
const [top] = fs.readdirSync(staging).filter((n) => fs.statSync(path.join(staging, n)).isDirectory());
if (!top || !fs.existsSync(path.join(staging, top, 'bin', 'java.exe'))) {
  console.error('✖ Unexpected archive layout: bin/java.exe not found.');
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.renameSync(path.join(staging, top), out);
fs.rmSync(staging, { recursive: true, force: true });
console.log(`✔ Windows Java runtime ready in ${path.relative(root, out)} (${top})`);
