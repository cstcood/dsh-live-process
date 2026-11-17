// Probe: what timing data does the session log carry for reasoning steps?
// Usage: node docs/probe-step.cjs [sessionDir]
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function readFrames(file) {
  const buffer = fs.readFileSync(file);
  const cuts = [];
  for (let i = 0; i <= buffer.length - MAGIC.length; i += 1) {
    if (buffer[i] === 0x28 && buffer[i + 1] === 0xb5 && buffer[i + 2] === 0x2f && buffer[i + 3] === 0xfd) cuts.push(i);
  }
  let text = '';
  for (let i = 0; i < cuts.length; i += 1) {
    const end = i + 1 < cuts.length ? cuts[i + 1] : buffer.length;
    try {
      text += zlib.zstdDecompressSync(buffer.subarray(cuts[i], end)).toString('utf8');
    } catch {
      // A truncated tail frame is expected while a session is being written.
    }
  }
  return text;
}

function latestSessionDir() {
  const root = 'C:/Users/cstdlib/.dsh/sessions';
  const found = [];
  for (const project of fs.readdirSync(root)) {
    const projectDir = path.join(root, project);
    if (!fs.statSync(projectDir).isDirectory()) continue;
    for (const session of fs.readdirSync(projectDir)) {
      const file = path.join(projectDir, session, 'session.v4.jsonl.zstd');
      if (fs.existsSync(file)) found.push({ file, mtime: fs.statSync(file).mtimeMs });
    }
  }
  found.sort((left, right) => right.mtime - left.mtime);
  return found[0].file;
}

const file = process.argv[2] ? path.join(process.argv[2], 'session.v4.jsonl.zstd') : latestSessionDir();
const records = readFrames(file)
  .split('\n')
  .filter(line => line.trim() !== '')
  .map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(record => record !== null);

console.log('file:', file);
console.log('records:', records.length);
console.log('top-level keys of record 0:', Object.keys(records[0]));

const byKind = new Map();
for (const record of records) {
  const kind = record.kind ?? record.type ?? record.event?.kind ?? '(none)';
  if (!byKind.has(kind)) byKind.set(kind, record);
}
console.log('kinds:', [...byKind.keys()]);

for (const kind of ['step/start', 'step/end', 'assistant/message', 'tool/call', 'tool/result']) {
  const sample = byKind.get(kind);
  if (sample === undefined) {
    console.log(`\n== ${kind}: NOT FOUND ==`);
    continue;
  }
  console.log(`\n== ${kind} ==`);
  console.log(JSON.stringify(sample).slice(0, 1200));
}
