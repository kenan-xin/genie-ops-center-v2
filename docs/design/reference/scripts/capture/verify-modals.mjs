// WITHDRAWN MEASUREMENT, kept on the record. Before 2026-09-19 this file asserted that "the page
// behind the overlays cannot scroll" by looking for any element that happened to overflow. On a
// 1280x900 desktop viewport the People directory fits, so it found nothing and reported zero
// movement, which reads as a pass and proves nothing. Every desktop scroll result printed by that
// version is withdrawn. The phone results from that version stand, because the phone viewport did
// overflow. What follows names the shell's own scroll container and states whether it can scroll at
// all before measuring.
//
// WHAT IS MEASURED HERE: a real wheel event over the page, and a keyboard page-down, on desktop and
// on a phone viewport. Scrolling inside the open panel is measured too, because stopping the page
// must not stop the panel.
// WHAT IS NOT MEASURED HERE: a touch drag, a trackpad momentum fling, a scrollbar drag, and any
// assistive-technology scroll. None of those is exercised, so none of them is claimed.
//
// Keyboard behavior of every modal family in the reference tree (tokens.md, Overlays):
// focus moves in, Tab and Shift+Tab cycle inside, the page behind cannot scroll, Escape and Cancel
// close, and focus returns to the control that opened the panel.
// The dev server must be running. Usage: node scripts/capture/verify-modals.mjs
// This is a preview check on the design tree's own overlays. Production builds the same behavior on
// the approved Base UI dialog, which needs its own test in that repository.
import { chromium } from 'playwright'

const B = process.env.BASE ?? 'http://localhost:3000'
const U = (section, screen, q = '') => `${B}/sections/${section}/screen-designs/${screen}/fullscreen${q}`
const out = []
const ok = (name, cond, extra = '') => { const l = `${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`; out.push(l); console.log(l) }

const browser = await chromium.launch()
const errs = []

const MODAL = '[role=dialog], [role=alertdialog]'

/**
 * The shell scrolls in its own `<main>` (`src/shell/components/AppShell.tsx`), not in `body`. Name
 * that element, so the lock is proved on the container a person actually scrolls rather than on
 * whichever element happened to overflow.
 */
const shellState = (page) => page.evaluate(() => {
  const el = document.querySelector('main')
  if (!el) return { found: false, scrollable: false, top: -1 }
  return { found: true, scrollable: el.scrollHeight > el.clientHeight + 40, top: el.scrollTop }
})

/**
 * Tries to scroll the shell with a real wheel event, which is what a person does. Returns how far it
 * moved, and puts it back.
 *
 * It does not assert anything about a script setting `scrollTop`. Hiding the overflow stops a person
 * scrolling; it has never stopped a script, and it still moves under `element.scrollTop = n`.
 * Stopping that as well means pinning the scroll position, which is a different mechanism and was
 * not asked for. The measured fact is recorded on the result as `script` so the report can say so.
 */
async function tryScrollShell(page, viewport) {
  const start = await shellState(page)
  if (!start.found || !start.scrollable) return { ...start, wheel: 0, script: 0 }
  await page.mouse.move(Math.round(viewport.width / 2), Math.round(viewport.height / 2))
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(250)
  const afterWheel = (await shellState(page)).top
  const afterScript = await page.evaluate(() => {
    const el = document.querySelector('main')
    if (!el) return -1
    el.scrollTop = el.scrollTop + 400
    return el.scrollTop
  })
  await page.evaluate((t) => { const el = document.querySelector('main'); if (el) el.scrollTop = t }, start.top)
  return { ...start, wheel: afterWheel - start.top, script: afterScript - afterWheel }
}

/** True while the keyboard is somewhere inside the top overlay. */
const inside = (page) => page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog], [role=alertdialog]')))
const openCount = (page) => page.locator(MODAL).count()
const locked = (page) => page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden')
const onOpener = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-opener') === '1')

/**
 * Opens one overlay from the keyboard and runs the whole battery on it.
 * `opener` is the control that opens the panel; it is marked so the focus-return check can name it.
 */
async function battery(page, label, opener, { cancelName = 'Cancel' } = {}) {
  await opener.evaluate((el) => el.setAttribute('data-opener', '1'))
  await opener.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  ok(`${label}: Enter on the opener opens the panel`, (await openCount(page)) > 0)
  ok(`${label}: focus moves into the panel`, await inside(page))
  ok(`${label}: the page behind it cannot scroll`, await locked(page))

  let escaped = 0
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')
    if (!(await inside(page))) escaped++
  }
  ok(`${label}: Tab cycles inside the panel`, escaped === 0, `left the panel ${escaped} times`)
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Shift+Tab')
    if (!(await inside(page))) escaped++
  }
  ok(`${label}: Shift+Tab cycles inside the panel`, escaped === 0, `left the panel ${escaped} times`)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(350)
  ok(`${label}: Escape closes it`, (await openCount(page)) === 0)
  ok(`${label}: focus returns to the control that opened it`, await onOpener(page))
  ok(`${label}: the page can scroll again`, !(await locked(page)))

  // The same again, closed with the panel's own Cancel control.
  await opener.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const cancel = page.locator(MODAL).last().getByRole('button', { name: cancelName }).first()
  if (await cancel.count()) {
    await cancel.click()
    await page.waitForTimeout(350)
    ok(`${label}: ${cancelName} closes it`, (await openCount(page)) === 0)
    ok(`${label}: focus returns to the opener after ${cancelName}`, await onOpener(page))
  } else {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    ok(`${label}: the panel offers a ${cancelName} control`, false, 'not found')
  }
}

/**
 * A confirm dialog raised from inside a slide-over. Only the inner one may answer the keyboard, and
 * closing it must leave the sheet behind it open with focus back on the control that raised it.
 */
async function nested(page, label, viewport, { openOuter, openInner, cancelName }) {
  await openOuter()
  await page.waitForTimeout(400)
  ok(`${label}: the sheet is open`, (await openCount(page)) === 1)

  // Focus is inside the panel, so a page-down must not reach the shell behind it.
  const beforeKey = (await shellState(page)).top
  await page.keyboard.press('PageDown')
  await page.waitForTimeout(250)
  const afterKey = (await shellState(page)).top
  ok(`${label}: a page-down does not scroll the shell behind the panel`, afterKey === beforeKey, `shell moved ${afterKey - beforeKey}px`)
  const inner = await openInner()
  await inner.evaluate((el) => el.setAttribute('data-opener', '1'))
  await inner.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  ok(`${label}: the confirm opens over the sheet`, (await openCount(page)) === 2)
  ok(`${label}: focus is in the confirm`, await page.evaluate(() => Boolean(document.activeElement?.closest('[role=alertdialog], [role=dialog]'))))

  let escaped = 0
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab')
    const inTop = await page.evaluate(() => {
      const panels = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')]
      const top = panels[panels.length - 1]
      return Boolean(top && document.activeElement && top.contains(document.activeElement))
    })
    if (!inTop) escaped++
  }
  ok(`${label}: Tab stays in the confirm, not the sheet behind it`, escaped === 0, `left it ${escaped} times`)

  // The shell's own scroll container, by name, while both overlays are open.
  const held = await tryScrollShell(page, viewport)
  ok(`${label}: the shell scroller is present and long enough to move`, held.found && held.scrollable, JSON.stringify(held))
  ok(`${label}: a wheel over the page does not scroll the shell behind the overlays`, held.wheel === 0, `wheel moved ${held.wheel}px; a script still moves it ${held.script}px, which hiding the overflow never prevented`)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  ok(`${label}: Escape closes only the confirm`, (await openCount(page)) === 1)
  ok(`${label}: focus returns to the control inside the sheet`, await onOpener(page))

  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const cancel = page.locator(MODAL).last().getByRole('button', { name: cancelName }).first()
  await cancel.click()
  await page.waitForTimeout(400)
  ok(`${label}: ${cancelName} closes only the confirm`, (await openCount(page)) === 1)
  ok(`${label}: focus returns to the opener after ${cancelName}`, await onOpener(page))

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  ok(`${label}: Escape then closes the sheet`, (await openCount(page)) === 0)
  const freed = await tryScrollShell(page, viewport)
  ok(`${label}: a wheel scrolls the shell again once every overlay is closed`, freed.wheel > 0, `wheel moved ${freed.wheel}px`)
}

async function run(viewport, suffix) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}) })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  const go = async (u) => { await page.goto(u, { waitUntil: 'networkidle' }); await page.waitForTimeout(350) }

  // Access: the advanced slide-over.
  await go(U('access', 'AccessGrants', '?reset=1&recipient=usr_alex'))
  await battery(page, `access slide-over${suffix}`, page.getByRole('button', { name: 'Advanced access' }).first())

  // Modules: the reintroduction review slide-over.
  await go(U('audit-and-tenant-settings', 'ModulesPage', '?reset=1'))
  await battery(page, `module review${suffix}`, page.getByRole('button', { name: /Review and enable/ }).first())

  // People: the person inspector slide-over, opened from its row.
  await go(U('people-groups-and-roles', 'PeopleDirectory'))
  const personRow = viewport.width < 500
    ? page.locator('li button').first()
    : page.locator('tr[role=button]').first()
  await battery(page, `person inspector${suffix}`, personRow, { cancelName: 'Close' })

  // Solutions: the configure slide-over, opened from its row.
  await go(U('solutions', 'AdminSolutions'))
  const solutionRow = viewport.width < 500
    ? page.locator('li button').first()
    : page.locator('tr[role=button]').first()
  await battery(page, `configure solution${suffix}`, solutionRow, { cancelName: 'Close' })

  // Branding: the previous-values dialog, opened from the published pill.
  await go(U('branding', 'BrandingPage'))
  await battery(page, `branding dialog${suffix}`, page.getByRole('button', { name: /^Published .* by / }).first(), { cancelName: 'Close' })

  // Stopping the page must not stop the panel. The module review is the longest sheet in the tree,
  // so its own region is the one to scroll with a real wheel while the page behind it is locked.
  await go(U('audit-and-tenant-settings', 'ModulesPage', '?reset=1&review=assets'))
  const region = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')]
    const top = panels[panels.length - 1]
    if (!top) return { open: false, found: false, box: null }
    const el = [...top.querySelectorAll('*')].find((n) => {
      const s = getComputedStyle(n)
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 40
    })
    if (!el) return { open: true, found: false, box: null }
    el.setAttribute('data-scroll-probe', '1')
    const r = el.getBoundingClientRect()
    return { open: true, found: true, box: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } }
  })
  ok(`panel scroll${suffix}: the review is open with a region long enough to scroll`, region.open && region.found, JSON.stringify(region))
  if (region.found) {
    const behind = await tryScrollShell(page, viewport)
    await page.mouse.move(region.box.x, region.box.y)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(250)
    const inner = await page.evaluate(() => document.querySelector('[data-scroll-probe="1"]')?.scrollTop ?? -1)
    ok(`panel scroll${suffix}: a wheel still scrolls inside the panel`, inner > 0, `panel moved ${inner}px`)
    ok(`panel scroll${suffix}: the same lock held the page behind it`, behind.wheel === 0, `shell moved ${behind.wheel}px`)
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // A confirm raised inside the person slide-over: the nested case. The shell must be able to
  // scroll on this page before the lock on it means anything.
  await go(U('people-groups-and-roles', 'PeopleDirectory'))
  const idle = await tryScrollShell(page, viewport)
  ok(`shell scroller${suffix}: it exists and a wheel moves it with nothing open`, idle.found && idle.scrollable && idle.wheel > 0, JSON.stringify(idle))

  await nested(page, `nested confirm${suffix}`, viewport, {
    openOuter: async () => {
      const r = viewport.width < 500 ? page.locator('li button').first() : page.locator('tr[role=button]').first()
      await r.focus()
      await page.keyboard.press('Enter')
    },
    openInner: async () => page.locator(MODAL).last().getByRole('button', { name: 'Remove' }).first(),
    cancelName: 'Cancel',
  })

  await ctx.close()
}

// 720px, so the shell's own scroll container really overflows and the lock on it can be proved.
// At 900px the People directory fits, and the scroll check would have nothing to measure.
await run({ width: 1280, height: 720 }, '')
await run({ width: 390, height: 844 }, ' (phone)')

ok('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0)
