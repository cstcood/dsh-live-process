#!/usr/bin/env node
// Pull one version's section out of CHANGELOG.md for use as release notes.
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (version === undefined || version === '') {
  console.error('usage: changelog-section.mjs <version>');
  process.exit(1);
}

const changelog = new URL('../../CHANGELOG.md', import.meta.url);
const text = readFileSync(changelog, 'utf8');
const lines = text.split(/\r?\n/);

const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heading = new RegExp(`^##\\s+\\[?v?${escaped}\\]?\\s*$`);

const start = lines.findIndex(line => heading.test(line.trim()));
if (start === -1) {
  console.error(`no "## ${version}" section in CHANGELOG.md`);
  process.exit(1);
}

let end = lines.length;
for (let index = start + 1; index < lines.length; index += 1) {
  if (/^##\s/.test(lines[index])) {
    end = index;
    break;
  }
}

const body = lines.slice(start + 1, end).join('\n').trim();
if (body === '') {
  console.error(`the "## ${version}" section in CHANGELOG.md is empty`);
  process.exit(1);
}

process.stdout.write(`${body}\n`);
