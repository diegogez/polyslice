#!/usr/bin/env node
// Compiles the Java engine into engine/build/polyslice-engine.jar (no Maven or Gradle needed).
//
//   node scripts/build-engine.mjs           build if any source changed
//   node scripts/build-engine.mjs --force   always rebuild
//   node scripts/build-engine.mjs --test    build, then compile and run the engine tests

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.join(root, 'engine');
const mainSrc = path.join(engine, 'src', 'main', 'java');
const testSrc = path.join(engine, 'src', 'test', 'java');
const buildDir = path.join(engine, 'build');
const classesDir = path.join(buildDir, 'classes');
const testClassesDir = path.join(buildDir, 'test-classes');
const jarPath = path.join(buildDir, 'polyslice-engine.jar');

const args = new Set(process.argv.slice(2));
const JAVA_RELEASE = '17';

function tool(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  if (process.env.JAVA_HOME) {
    const candidate = path.join(process.env.JAVA_HOME, 'bin', exe);
    if (fs.existsSync(candidate)) return candidate;
  }
  return exe; // fall back to PATH
}

function run(cmd, cmdArgs, label) {
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit', cwd: root });
  if (result.error) {
    console.error(`\n✖ Could not run ${cmd}: ${result.error.message}`);
    console.error('  Install a JDK (17 or newer) and make sure javac is on your PATH or JAVA_HOME is set.');
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n✖ ${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

function listJava(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJava(p));
    else if (entry.name.endsWith('.java')) out.push(p);
  }
  return out;
}

function newestMtime(files) {
  return files.reduce((m, f) => Math.max(m, fs.statSync(f).mtimeMs), 0);
}

function compile(sources, outDir, classpath, label) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  // An @argfile keeps the command short and handles paths with spaces.
  const argFile = path.join(buildDir, `${path.basename(outDir)}.args`);
  fs.writeFileSync(argFile, sources.map((s) => `"${s.replaceAll('\\', '\\\\')}"`).join('\n'));
  const cmdArgs = ['--release', JAVA_RELEASE, '-encoding', 'UTF-8', '-Xlint:all,-serial', '-d', outDir];
  if (classpath) cmdArgs.push('-cp', classpath);
  cmdArgs.push(`@${argFile}`);
  run(tool('javac'), cmdArgs, label);
}

const mainSources = listJava(mainSrc);
const upToDate = !args.has('--force') && fs.existsSync(jarPath)
  && fs.statSync(jarPath).mtimeMs >= newestMtime(mainSources);

fs.mkdirSync(buildDir, { recursive: true });
if (upToDate) {
  console.log('✔ Java engine is up to date');
} else {
  console.log(`☕ Compiling ${mainSources.length} engine sources (Java ${JAVA_RELEASE}+)…`);
  compile(mainSources, classesDir, null, 'Engine compile');
  run(tool('jar'), ['--create', '--file', jarPath, '--main-class', 'com.polyslice.Main', '-C', classesDir, '.'], 'Jar packaging');
  console.log(`✔ Built ${path.relative(root, jarPath)}`);
}

if (args.has('--test')) {
  const testSources = listJava(testSrc);
  console.log(`🧪 Compiling ${testSources.length} test sources…`);
  if (!fs.existsSync(classesDir)) {
    compile(mainSources, classesDir, null, 'Engine compile');
  }
  compile(testSources, testClassesDir, classesDir, 'Test compile');
  const cp = [classesDir, testClassesDir].join(path.delimiter);
  run(tool('java'), ['-cp', cp, 'com.polyslice.test.TestRunner'], 'Engine tests');
}
