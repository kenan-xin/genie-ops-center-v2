// Screenshot helper for Design OS previews.
// Usage: node scripts/shots.mjs <manifest.json> [baseUrl]
// Manifest: [{ "name": "people-directory", "url": "/sections/people-groups-and-roles/screen-designs/PeopleDirectory/fullscreen",
//              "out": "product/sections/people-groups-and-roles", "viewport": "desktop" | "phone" | "tablet", "dark": false,
//              "fullPage": false, "actions": [{ "click": "text=Register solution" }, { "wait": 300 }, { "hover": "..." }, { "fill": ["selector", "value"] }, { "press": "Escape" }] }]
// Viewports: phone 390x844, tablet 768x1024, desktop 1280x900. Dark uses prefers-color-scheme.
// The dev server must be running (default http://localhost:5173).
import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const [manifestPath, baseUrl = 'http://localhost:5173'] = process.argv.slice(2)
if (!manifestPath) { console.error('manifest path required'); process.exit(1) }
const shots = JSON.parse(await readFile(manifestPath, 'utf8'))
// The shell scrolls inside its own container, so `fullPage` cannot grow the shot. A long screen uses
// a tall viewport instead.
const SIZES = {
  phone: { width: 390, height: 844 },
  phoneTall: { width: 390, height: 1500 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 900 },
  desktopTall: { width: 1280, height: 1700 },
}

const browser = await chromium.launch()
let failures = 0
for (const s of shots) {
  const viewport = SIZES[s.viewport ?? 'desktop']
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: s.dark ? 'dark' : 'light',
    isMobile: s.viewport === 'phone',
    hasTouch: s.viewport === 'phone',
    reducedMotion: 'reduce',
  })
  // The theme toggle rewrites the html class on mount from localStorage, so a dark shot sets it first.
  if (s.dark) await context.addInitScript(() => localStorage.setItem('theme', 'dark'))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  try {
    await page.goto(baseUrl + s.url, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => !document.body.innerText.includes('Loading...'), null, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(400)
    for (const a of s.actions ?? []) {
      if (a.click) await page.click(a.click)
      if (a.hover) await page.hover(a.hover)
      if (a.fill) await page.fill(a.fill[0], a.fill[1])
      if (a.select) await page.selectOption(a.select[0], a.select[1])
      if (a.press) await page.keyboard.press(a.press)
      if (a.focus) await page.focus(a.focus)
      if (a.scroll) await page.evaluate((y) => window.scrollTo(0, y), a.scroll)
      if (a.wait) await page.waitForTimeout(a.wait)
    }
    await page.mouse.move(0, 0)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    const out = path.join(s.out, `${s.name}.png`)
    await mkdir(s.out, { recursive: true })
    await page.screenshot({ path: out, fullPage: Boolean(s.fullPage) })
    console.log(`${overflow ? 'OVERFLOW ' : 'ok       '}${out}${errors.length ? `  (console errors: ${errors.length})` : ''}`)
    if (overflow) failures++
  } catch (e) {
    failures++
    console.log(`FAIL     ${s.name}: ${String(e).split('\n')[0]}`)
  } finally {
    await context.close()
  }
}
await browser.close()
process.exit(failures ? 1 : 0)
