// Temporary probe sink + timer backfill server.
//
// The GUI has no debugging port, so this is the only window onto the live DOM:
// the client plugin posts its row census here. It also reads back per-call
// durations rebuilt from the session logs — the chat transcript stores none, so
// anything the plugin did not personally watch run would otherwise have no time.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = 'C:/Users/cstdlib/Documents/deepseek-harness/default-workspace/plugins/dsh-live-process/docs';
const log = `${dir}/probe-events.jsonl`;
const root = 'C:/Users/cstdlib/.dsh/sessions';
fs.writeFileSync(log, '');

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

// Reasoning windows. The chat keys a node as `${kind.length}:${kind}${id}`
// (conversationContextKey in the conversation contract), and the assistant
// step's id is `${turn}:${step}`. A reasoning row's anchor is
// JSON.stringify([key, 'reasoning']). The assistant message carries the whole
// stream timeline — block-start and block-end entries with absolute times —
// which is the same data the Trajectory tab shows as TTFT and generation time.
const ASSISTANT_KIND = 'assistant-step'

function reasoningWindows(text, timers) {
  for (const line of text.split('\n')) {
    if (line === '' || line[0] !== '{') continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== 'assistant/message') continue;
    const data = event.data;
    if (data === null || typeof data !== 'object') continue;
    const stream = data.stream;
    if (!Array.isArray(stream)) continue;
    const key = JSON.stringify([
      `${ASSISTANT_KIND.length}:${ASSISTANT_KIND}${data.turn}:${data.step}`,
      'reasoning',
    ]);
    const open = new Map();
    for (const entry of stream) {
      if (entry === null || typeof entry !== 'object') continue;
      if (entry.type !== 'chunk') continue;
      const chunk = entry.chunk;
      if (chunk === null || typeof chunk !== 'object') continue;
      if (typeof entry.time !== 'number') continue;
      if (chunk.type === 'block-start' && chunk.blockType === 'reasoning') {
        open.set(chunk.index, entry.time);
      } else if (chunk.type === 'block-end' && chunk.block !== null && typeof chunk.block === 'object'
        && chunk.block.type === 'reasoning') {
        const begin = open.get(chunk.index);
        if (begin === undefined || entry.time < begin) continue;
        const held = timers[key];
        if (held === undefined) timers[key] = [begin, entry.time];
        else if (begin < held[0]) timers[key] = [begin, Math.max(held[1], entry.time)];
      }
    }
  }
}

// Rebuilt on every request so a call that finished seconds ago already has a
// window; only the few most recently written sessions are read.
function buildTimers() {
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

  const timers = {};
  for (const file of files.slice(0, 4)) {
    const text = frames(file.full);
    reasoningWindows(text, timers);
    const calls = new Map();
    const results = new Map();
    for (const line of text.split('\n')) {
      if (line === '' || line[0] !== '{') continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type !== 'tool/call' && event.type !== 'tool/result') continue;
      if (typeof event.time !== 'number') continue;
      const data = event.data;
      if (data === null || typeof data !== 'object') continue;
      const id = data.callId ?? (data.message && data.message.toolCallId) ?? data.toolCallId;
      if (typeof id !== 'string') continue;
      if (event.type === 'tool/call') {
        if (!calls.has(id)) calls.set(id, event.time);
      } else if (!results.has(id)) {
        results.set(id, event.time);
      }
    }
    for (const [id, start] of calls) {
      const end = results.get(id);
      if (end === undefined || end < start) continue;
      timers[`call:${id}`] = [start, end];
    }
  }
  return timers;
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = req.url ?? '/';
  if (req.method === 'GET' && url.startsWith('/timers')) {
    let body = '{}';
    try {
      const timers = buildTimers();
      body = JSON.stringify(timers);
      console.log('timers served:', Object.keys(timers).length);
    } catch (error) {
      console.log('timers failed:', error.message);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    if (req.method === 'POST' && body !== '') fs.appendFileSync(log, body + '\n');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
}).listen(8899, '127.0.0.1', () => console.log('probe sink + live timer backfill on 8899'));
