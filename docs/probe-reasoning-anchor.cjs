// Probe: can a reasoning anchor key be rebuilt from the session log?
// The chat anchors reasoning rows as ["<turn>:assistant-step<step>:<n>","reasoning"].
// This prints the step windows and reasoning-block counts so the mapping can be
// checked against the anchors the probe reported.
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
      // Truncated tail frame while the session is live.
    }
  }
  return text;
}

function latestSessionFile() {
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

const records = readFrames(latestSessionFile())
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

const starts = new Map();
for (const record of records) {
  if (record.type !== 'step/start') continue;
  starts.set(`${record.data.turn}:${record.data.step}`, record.time);
}

const windows = [];
for (const record of records) {
  if (record.type !== 'assistant/message') continue;
  const { turn, step, message } = record.data;
  const begin = starts.get(`${turn}:${step}`);
  if (begin === undefined) continue;
  const blocks = message.content.filter(part => part.type === 'reasoning');
  if (blocks.length === 0) continue;
  windows.push({ turn, step, begin, end: record.time, reasoning: blocks.length });
}

console.log('steps with reasoning:', windows.length);
console.log('reasoning block counts seen:', [...new Set(windows.map(w => w.reasoning))]);

// Anchors the probe reported for this conversation.
const reported = [1, 2, 3, 4, 6, 8].map(n => `["14:assistant-step26:${n}","reasoning"]`);
const turn14 = windows.filter(w => w.turn === 14);
console.log('\nturn 14 steps with reasoning:', turn14.map(w => `${w.step}(x${w.reasoning})`).join(' '));
console.log('\nprobe anchors:', reported.join(' '));
console.log('step 26 window:', JSON.stringify(turn14.find(w => w.step === 26) ?? null));
