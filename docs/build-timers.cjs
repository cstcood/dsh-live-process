// Rebuilds per-call durations from the session logs. The chat transcript keeps no
// elapsed time of its own, but every call and result event carries a timestamp,
// so the true window can be recovered and handed back to the client plugin —
// otherwise a reload loses the timing of everything that already finished.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = 'C:/Users/cstdlib/.dsh/sessions';
const out = 'C:/Users/cstdlib/Documents/deepseek-harness/default-workspace/plugins/dsh-live-process/docs/timers.json';

function frames(target) {
  const buffer = fs.readFileSync(target);
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const starts = [];
  for (let at = buffer.indexOf(magic); at !== -1; at = buffer.indexOf(magic, at + 1)) starts.push(at);
  const parts = [];
  for (let index = 0; index < starts.length; index += 1) {
    const from = starts[index];
    const to = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    try {
      parts.push(zlib.zstdDecompressSync(buffer.subarray(from, to)).toString('utf8'));
    } catch {}
  }
  return parts.join('');
}

const files = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.zstd')) files.push(full);
  }
};
walk(root);

const kinds = new Map();
const calls = new Map();
const results = new Map();

for (const file of files) {
  const text = frames(file);
  for (const line of text.split('\n')) {
    if (line === '' || line[0] !== '{') continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const type = event.type;
    if (typeof type === 'string') kinds.set(type, (kinds.get(type) ?? 0) + 1);
    if (type !== 'tool/call' && type !== 'tool/result') continue;
    const time = event.time;
    const data = event.data;
    if (typeof time !== 'number' || data === null || typeof data !== 'object') continue;
    const id = data.callId ?? (data.message && data.message.toolCallId) ?? data.toolCallId;
    if (typeof id !== 'string') continue;
    if (type === 'tool/call') {
      if (!calls.has(id)) calls.set(id, { time, name: data.name ?? data.toolName ?? '?' });
    } else if (!results.has(id)) {
      results.set(id, time);
    }
  }
}

console.log('event types:', [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
console.log('calls:', calls.size, 'results:', results.size);

const timers = {};
let matched = 0;
for (const [id, call] of calls) {
  const end = results.get(id);
  if (end === undefined || end < call.time) continue;
  timers[`call:${id}`] = [call.time, end];
  matched += 1;
}
console.log('matched windows:', matched);

fs.writeFileSync(out, JSON.stringify(timers));
console.log('written', out, fs.statSync(out).size, 'bytes');

const sample = Object.entries(timers).slice(-5);
for (const [key, value] of sample) console.log(key, value[1] - value[0], 'ms');
