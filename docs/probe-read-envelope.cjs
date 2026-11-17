// Looks for a settled `read` result in the session logs and prints the exact
// envelope the chat row validates. `readCardModel` only builds a card when the
// result text matches `^<path>…</path>\n<type>file</type>\n<content>\n…\n</content>$`
// and the meta carries path/offset/lines/totalLines; anything else leaves the row
// with no card, which makes it unexpandable by design, not by our driver.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = 'C:/Users/cstdlib/.dsh/sessions';

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
    else if (entry.name.endsWith('.zstd')) files.push({ full, at: fs.statSync(full).mtimeMs });
  }
};
walk(root);
files.sort((a, b) => b.at - a.at);

let found = 0;
for (const file of files.slice(0, 10)) {
  const text = frames(file.full);
  const hits = text.split('<type>file</type>').length - 1;
  console.log(`\n=== ${path.basename(path.dirname(file.full))} len=${text.length} file-envelopes=${hits}`);
  if (hits === 0) continue;
  const at = text.indexOf('<type>file</type>');
  console.log(text.slice(Math.max(0, at - 320), at + 420).replace(/\\n/g, '\n'));
  found += 1;
  if (found >= 3) break;
}

if (found === 0) console.log('\nno read envelope found in the ten newest sessions');
