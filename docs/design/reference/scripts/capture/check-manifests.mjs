// Guard for the capture manifests in this directory and the files they produce.
// Usage: node scripts/capture/check-manifests.mjs
//
// It answers three questions and exits non-zero on any failure.
//
// 1. Does every capture name have exactly one producer? When two manifests claim the same output
//    file, the picture on disk depends on which manifest ran last. That happened: on 2026-09-19, 31
//    of 342 names had two or more producers and 13 of them disagreed about the viewport, so
//    `modules.png` was a 1280x900 shot or a 1280x1700 shot depending on the order.
// 2. Does every name have a file, and does every file have a name? An orphan file is a capture
//    nothing refreshes, which is the definition of a stale one.
// 3. Does each file's pixel size match the viewport its entry asks for? A capture taken before an
//    entry changed viewport looks current and is not.
//
// It does not compare pictures. A capture can be the right size and still show old content.
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

/** Must match SIZES in scripts/shots.mjs. */
const SIZES = {
  phone: [390, 844],
  phoneTall: [390, 1500],
  tablet: [768, 1024],
  desktop: [1280, 900],
  desktopTall: [1280, 1700],
}

const dir = path.dirname(new URL(import.meta.url).pathname)
const root = path.resolve(dir, '../..')
const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()

const owners = new Map()
let entries = 0
let failures = 0
for (const file of files) {
  let shots
  try {
    shots = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
  } catch (e) {
    console.log(`MALFORMED  ${file}: ${String(e).split('\n')[0]}`)
    failures++
    continue
  }
  for (const s of shots) {
    entries++
    const name = `${s.out}/${s.name}.png`
    if (!owners.has(name)) owners.set(name, [])
    owners.get(name).push({ file, shot: s })
  }
}

// 1. one producer per name
for (const [name, v] of owners) {
  if (v.length < 2) continue
  const shape = (s) => `${s.viewport ?? 'desktop'}${s.dark ? '+dark' : ''}${s.fullPage ? '+fullPage' : ''}|${s.url}|${JSON.stringify(s.actions ?? null)}`
  const disagree = new Set(v.map((e) => shape(e.shot))).size > 1
  console.log(`${disagree ? 'CONFLICT ' : 'DUPLICATE'}  ${name}`)
  for (const e of v) console.log(`             ${e.file}  ${e.shot.viewport ?? 'desktop'}${e.shot.fullPage ? '+fullPage' : ''}`)
  failures++
}

// 2 and 3. the files on disk
const pngs = new Set()
const walk = async (d) => {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) await walk(p)
    else if (e.name.endsWith('.png')) pngs.add(path.relative(root, p))
  }
}
await walk(path.join(root, 'product'))

for (const [name, [{ file, shot }]] of [...owners].filter(([, v]) => v.length === 1)) {
  const abs = path.join(root, name)
  const exists = await stat(abs).then(() => true, () => false)
  if (!exists) {
    console.log(`MISSING    ${name}  (${file} produces it, no file on disk)`)
    failures++
    continue
  }
  // PNG header: width and height are two big-endian 32-bit words at byte 16.
  const head = await readFile(abs)
  const [w, h] = [head.readUInt32BE(16), head.readUInt32BE(20)]
  const [ew, eh] = SIZES[shot.viewport ?? 'desktop']
  const wrong = w !== ew || (shot.fullPage ? h < eh : h !== eh)
  if (wrong) {
    console.log(`WRONG SIZE ${name}  is ${w}x${h}, ${file} asks for ${ew}x${shot.fullPage ? `${eh} or taller` : eh}`)
    failures++
  }
}

for (const p of pngs) {
  if (!owners.has(p)) {
    console.log(`ORPHAN     ${p}  (no manifest produces it, so nothing refreshes it)`)
    failures++
  }
}

console.log(`\n${files.length} manifests, ${entries} entries, ${owners.size} capture names, ${pngs.size} files under product/.`)
console.log(failures ? `${failures} problems.` : 'One producer per name, every name has a file, every file has the size its entry asks for.')
process.exit(failures ? 1 : 0)
