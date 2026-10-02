#!/usr/bin/env node
// Updates the Content-Security-Policy hash for the inline import map in renderer/index.html.
// Chromium only runs inline scripts whose sha256 is listed in the CSP, so run this after editing
// the import map.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'renderer', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!match) throw new Error('No import map found');
const hash = crypto.createHash('sha256').update(match[1], 'utf8').digest('base64');
const updated = html.replace(/'sha256-[^']*'/, `'sha256-${hash}'`);
fs.writeFileSync(file, updated);
console.log(`✔ CSP import map hash: sha256-${hash}`);
