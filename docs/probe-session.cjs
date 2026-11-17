// Inspects the newest DSH session log to see what a settled `read` / `edit` /
// `grep` tool block actually carries. The chat row can only open when the block
// yields a card, so this decides whether "it does not expand" is our driver's
// fault or the upstream block simply has nothing to show.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = 'C:/Users/cstdlib/.dsh/sessions';

function newest() {
  let best = null;
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.zstd')) {
        const at = fs.statSync(full).mtimeMs;
        if (best === null || at > best.at) best = { full, at };
      }
    }
  };
  walk(root);
  return best;
}

const file = newest();
console.log('session:', file.full);

// The log is append-only: many zstd frames concatenated. Both the one-shot and
// the streaming decoder stop at the first frame boundary, so split on the frame
// magic and decode each frame on its own.
function readAll(target) {
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
    } catch {
      // A trailing partial frame is a write in progress, not a failure.
    }
  }
  return parts.join('');
}

try {
  const text = readAll(file.full);
  console.log('length:', text.length);

  const count = key => text.split(key).length - 1;
  for (const key of ['"toolName":"read"', '"toolName":"edit"', '"toolName":"grep"', 'parentCallId', '"meta"']) {
    console.log(`${key} -> ${count(key)}`);
  }

  for (const name of ['read', 'edit', 'grep']) {
    const needle = `"toolName":"${name}"`;
    const at = text.indexOf(needle);
    console.log(`\n===== ${name} at ${at}`);
    if (at < 0) continue;
    console.log(text.slice(Math.max(0, at - 200), at + 1400));
  }
} catch (error) {
  console.log('FAIL', error.message);
  process.exit(1);
}


