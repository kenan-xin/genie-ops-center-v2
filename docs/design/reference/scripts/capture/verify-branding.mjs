// Interaction checks for the two branding confirm dialogs and the previous-values dialog.
// The dev server must be running. Usage: node scripts/capture/verify-branding.mjs
// Simulated: everything runs on product/sections/branding/data.json in the browser. No backend is touched.
import { chromium } from 'playwright'

const B = process.env.BASE ?? 'http://localhost:3000'
const S = (q = '') => `${B}/sections/branding/screen-designs/BrandingPage/fullscreen${q}`
const out = []
const ok = (name, cond, extra = '') => { const l = `${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`; out.push(l); console.log(l) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
const go = async (u) => { await page.goto(u, { waitUntil: 'networkidle' }); await page.waitForTimeout(350) }

// 1. the published pill opens the previous-values dialog
await go(S())
const pill = page.getByRole('button', { name: /^Published .* by Priya Nair/ })
ok('clean: the published pill names when and who', await pill.isVisible())
await pill.click()
await page.waitForTimeout(250)
const prev = page.getByRole('dialog')
ok('previous: the pill opens a dialog, not an alert', await prev.isVisible() && (await page.getByRole('alertdialog').count()) === 0)
const prevText = await prev.innerText()
ok('previous: the heading names the record', prevText.includes('Previous published values'))
ok('previous: the line names who, when, and the count', /Priya Nair published 2 changes on 16 Sept 2026\./.test(prevText))
ok('previous: each field shows the value before and after', /Favicon/.test(prevText) && /Before\s+None/.test(prevText) && /Now\s+favicon\.svg/.test(prevText))
ok('previous: the fields are grouped by tab', prevText.includes('Identity') && prevText.includes('Email'))
ok('previous: the missing platform read is marked', prevText.includes('Simulated') && /does not exist yet/.test(prevText))
ok('previous: the action says what it writes', /Restore puts the previous values back into the draft/.test(prevText))
ok('previous: the dismissing action is Close, not Cancel', await prev.getByRole('button', { name: 'Close' }).isVisible())

// 2. Restore writes the previous values into the draft and publishes nothing
await prev.getByRole('button', { name: 'Restore' }).click()
await page.waitForTimeout(300)
ok('restore: the toast says what happened and what is next', await page.getByRole('status').filter({ hasText: 'Restored to the draft. Publish to apply.' }).isVisible())
ok('restore: the draft carries both restored fields', await page.getByText('2 unpublished changes').isVisible())
ok('restore: the published pill is gone while the draft is dirty', (await page.getByRole('button', { name: /^Published / }).count()) === 0)

// 3. the Discard confirm lists the same grouped fields the Publish confirm lists
await page.getByRole('button', { name: 'Discard' }).first().click()
await page.waitForTimeout(250)
const dis = page.getByRole('alertdialog')
const disText = await dis.innerText()
ok('discard: the title counts the changes', disText.includes('Discard 2 changes?'))
ok('discard: the consequence names the loss', /lost and cannot be recovered/.test(disText))
ok('discard: the changed fields are listed by tab', /Identity:\s*Favicon/.test(disText) && /Email:\s*Footer text/.test(disText))
await dis.getByRole('button', { name: 'Cancel' }).click()
await page.waitForTimeout(200)

// `exact` matters: without it the name matches the "How publishing works" help button, which comes first in the DOM.
await page.getByRole('button', { name: 'Publish', exact: true }).first().click()
await page.waitForTimeout(250)
const pubText = await page.getByRole('alertdialog').innerText()
ok('publish: the same grouped list appears', /Identity:\s*Favicon/.test(pubText) && /Email:\s*Footer text/.test(pubText))
ok('publish: the consequence is the member-facing one', /next page load/.test(pubText))

// 4. the dialog opens straight from the URL, for screenshots
await go(S('?dialog=previous'))
ok('url: ?dialog=previous opens the dialog', await page.getByRole('dialog').isVisible())

// 5. the phone sheet keeps its actions inside the viewport, above the home indicator
await page.setViewportSize({ width: 390, height: 844 })
await go(S('?dialog=previous'))
const gap = await page.getByRole('dialog').getByRole('button', { name: 'Close' }).evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom)
ok('phone: the last action sits fully inside the viewport', gap >= 8, `${Math.round(gap)}px below the Close button`)

ok('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
console.log(`\n${out.filter((l) => l.startsWith('PASS')).length}/${out.length} pass`)
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0)
