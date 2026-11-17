// One-off check: rebuild reasoning windows from the session logs and report
// whether the anchor keys the chat actually uses are present.
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const ROOT = 'C:/Users/cstdlib/.dsh/sessions'
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const KIND = 'assistant-step'

function frames(buffer) {
  const cuts = []
  for (let i = 0; i <= buffer.length - 4; i += 1) {
    if (buffer[i] === MAGIC[0] && buffer[i + 1] === MAGIC[1]
      && buffer[i + 2] === MAGIC[2] && buffer[i + 3] === MAGIC[3]) cuts.push(i)
  }
  let text = ''
  for (let i = 0; i < cuts.length; i += 1) {
    const end = i + 1 < cuts.length ? cuts[i + 1] : buffer.length
    try {
      text += zlib.zstdDecompressSync(buffer.subarray(cuts[i], end)).toString('utf8')
    } catch {}
  }
  return text
}

function recent(limit) {
  const found = []
  for (const project of fs.readdirSync(ROOT)) {
    const projectDir = path.join(ROOT, project)
    if (!fs.statSync(projectDir).isDirectory()) continue
    for (const session of fs.readdirSync(projectDir)) {
      const file = path.join(projectDir, session, 'session.v4.jsonl.zstd')
      if (fs.existsSync(file)) found.push({ file, mtime: fs.statSync(file).mtimeMs })
    }
  }
  found.sort((left, right) => right.mtime - left.mtime)
  return found.slice(0, limit)
}

const timers = {}
for (const entry of recent(4)) {
  const text = frames(fs.readFileSync(entry.file))
  for (const line of text.split('\n')) {
    if (line === '' || line[0] !== '{') continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.type !== 'assistant/message') continue
    const data = event.data
    if (data === null || typeof data !== 'object') continue
    const stream = data.stream
    if (!Array.isArray(stream)) continue
    const key = JSON.stringify([`${KIND.length}:${KIND}${data.turn}:${data.step}`, 'reasoning'])
    const open = new Map()
    for (const item of stream) {
      if (item === null || typeof item !== 'object' || item.type !== 'chunk') continue
      const chunk = item.chunk
      if (chunk === null || typeof chunk !== 'object') continue
      if (typeof item.time !== 'number') continue
      if (chunk.type === 'block-start' && chunk.blockType === 'reasoning') {
        open.set(chunk.index, item.time)
      } else if (chunk.type === 'block-end' && chunk.block !== null
        && typeof chunk.block === 'object' && chunk.block.type === 'reasoning') {
        const begin = open.get(chunk.index)
        if (begin === undefined || item.time < begin) continue
        const held = timers[key]
        if (held === undefined) timers[key] = [begin, item.time]
        else if (begin < held[0]) timers[key] = [begin, Math.max(held[1], item.time)]
      }
    }
  }
}

const keys = Object.keys(timers)
console.log('reasoning windows:', keys.length)
for (const key of keys.slice(0, 6)) {
  console.log(' ', key, timers[key][1] - timers[key][0], 'ms')
}
for (const probe of ['14:assistant-step29:1', '14:assistant-step30:1']) {
  const key = JSON.stringify([probe, 'reasoning'])
  console.log('probe key', key, '->', timers[key] !== undefined)
}
