// Summarises the probe uplink: while rows were live, did they open? Which blocks
// never get a timer? Anything reported here is measured in the real page.
const fs = require('fs');

const file = 'C:/Users/cstdlib/Documents/deepseek-harness/default-workspace/plugins/dsh-live-process/docs/probe-events.jsonl';
const lines = fs.readFileSync(file, 'utf8').split('\n').filter(line => line.trim() !== '');
console.log('samples:', lines.length);

const liveBlocks = new Map();
const liveOpen = new Map();
const settledTimer = new Map();
const settledNoTimer = new Map();
const anchorsSeen = new Set();

for (const line of lines) {
  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    continue;
  }
  for (const row of payload.rows ?? []) {
    const key = row.block;
    anchorsSeen.add(row.anchor);
    const live = row.state === 'running' || row.state === 'preparing';
    if (live) {
      liveBlocks.set(key, (liveBlocks.get(key) ?? 0) + 1);
      if (row.open) liveOpen.set(key, (liveOpen.get(key) ?? 0) + 1);
    } else if (row.state === 'ok' || row.state === 'error' || row.state === 'stopped') {
      if (row.timer === null) settledNoTimer.set(key, (settledNoTimer.get(key) ?? 0) + 1);
      else settledTimer.set(key, (settledTimer.get(key) ?? 0) + 1);
    }
  }
}

console.log('\n--- live observations (state=running/preparing) ---');
for (const [key, total] of [...liveBlocks].sort((a, b) => b[1] - a[1])) {
  console.log(`${key}: observed ${total}, open ${liveOpen.get(key) ?? 0}`);
}

console.log('\n--- settled rows with a timer ---');
console.log([...settledTimer].sort((a, b) => b[1] - a[1]));

console.log('\n--- settled rows WITHOUT a timer ---');
console.log([...settledNoTimer].sort((a, b) => b[1] - a[1]));

console.log('\ndistinct anchors:', anchorsSeen.size);

// Anything that is not a plain call:/input-message anchor is worth seeing.
const odd = [...anchorsSeen].filter(anchor => typeof anchor === 'string' && !anchor.startsWith('call:') && !anchor.startsWith('13:input-message'));
console.log('other anchor shapes:', odd.slice(0, 6));
