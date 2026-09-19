import { chromium } from 'playwright'

const B = 'http://localhost:3000'
const C = (q = '') => `${B}/sections/audit-and-tenant-settings/screen-designs/CategoriesPage/fullscreen${q}`
const M = (q = '') => `${B}/sections/audit-and-tenant-settings/screen-designs/ModulesPage/fullscreen${q}`
const S = (q = '') => `${B}/sections/solutions/screen-designs/AdminSolutions/fullscreen${q}`
const out = []
const ok = (name, cond, extra = '') => { const l = `${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`; out.push(l); console.log(l) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
const go = async (u) => { await page.goto(u, { waitUntil: 'networkidle' }); await page.waitForTimeout(350) }
// Both layouts render; CSS hides one. Scope to the desktop table so the locator stays unique.
const rowSelect = (label) => page.locator('table').getByLabel(`Category for ${label}`, { exact: true })

// 1. the table lists modules and solutions, and tells them apart
await go(C('?reset=1'))
ok('assign: the section is on the Categories page', await page.getByRole('heading', { name: 'Assign items' }).isVisible())
ok('assign: a module row is present', await rowSelect('Solutions').isVisible())
ok('assign: a solution row is present', await rowSelect('Claims Triage Assistant').isVisible())
ok('assign: the module row says it moves alone', (await page.locator('table').getByText('Moves this entry only. Its 9 solutions').count()) > 0)
ok('assign: a module with no workspace entry is absent', await rowSelect('Reporting exports').count() === 0)
// Uncategorized today: the Solutions hub, Service requests, Approvals, and General Assistant.
ok('assign: the uncategorized count shows', (await page.getByText('4 uncategorized').count()) > 0, await page.getByText(/uncategorized/).first().innerText())

// 2. assign one solution, and see it on the other two screens
await rowSelect('Policy Q&A').selectOption('cat_hr')
await page.waitForTimeout(1100)
ok('assign: the row reports the save', (await page.locator('table').getByText('Saved. Written to the audit log.').count()) > 0)
await go(C())
ok('assign: the value survives a reload', await rowSelect('Policy Q&A').inputValue() === 'cat_hr')
await go(S('?open=sol_policy&tab=general'))
const configCategory = page.getByLabel('Category', { exact: true })
ok('cross-screen: the configure sheet shows the new category', (await configCategory.inputValue()) === 'cat_hr')

// 3. the other way round: change it in the configure sheet
await configCategory.selectOption('cat_finance')
await page.waitForTimeout(200)
const save = page.getByRole('button', { name: /Save/ }).first()
if (await save.count()) { await save.click(); await page.waitForTimeout(900) }
await go(C())
ok('cross-screen: the Categories page shows the sheet\'s change', await rowSelect('Policy Q&A').inputValue() === 'cat_finance')

// 4. moving the module entry does not move its solutions
await rowSelect('Solutions').selectOption('cat_health')
await page.waitForTimeout(1100)
ok('hub: the module row moved', await rowSelect('Solutions').inputValue() === 'cat_health')
ok('hub: the solutions did not follow', await rowSelect('General Assistant').inputValue() === '')
await go(M())
ok('hub: the Modules page agrees', await rowSelect('Solutions').inputValue() === 'cat_health')
ok('modules: a module with no workspace entry has no picker', (await page.locator('table').getByText('No workspace entry, so nothing to place').count()) > 0)

// 5. clear one back to no category
await go(C())
await rowSelect('Claims Triage Assistant').selectOption('')
await page.waitForTimeout(1100)
ok('clear: the row reads No category', await rowSelect('Claims Triage Assistant').inputValue() === '')

// 6. deleting a category leaves its items ungrouped
const before = await rowSelect('Discharge Summary Drafting').inputValue()
await page.getByRole('button', { name: 'Delete Healthcare' }).click()
await page.getByRole('button', { name: 'Delete', exact: true }).click()
await page.waitForTimeout(400)
ok('delete: the category is gone', await page.getByRole('button', { name: 'Delete Healthcare' }).count() === 0, `was ${before}`)
ok('delete: its items are ungrouped, not deleted', await rowSelect('Discharge Summary Drafting').isVisible() && (await rowSelect('Discharge Summary Drafting').inputValue()) === '')
ok('delete: the module entry is ungrouped too', await rowSelect('Solutions').inputValue() === '')

// 7. a failed save never reads as a save
await go(C('?reset=1&fail=sol_general'))
await rowSelect('General Assistant').selectOption('cat_finance')
await page.waitForTimeout(1100)
const rowText = await page.locator('tr', { hasText: 'General Assistant' }).first().innerText()
ok('failure: the row reports the refusal', /Not saved/.test(rowText), rowText.replace(/\n/g, ' | ').slice(0, 120))
ok('failure: the row keeps the stored value', await rowSelect('General Assistant').inputValue() === '')
ok('failure: no success toast', await page.getByText('Saved. Written to the audit log.').count() === 0)
await page.getByRole('button', { name: 'Retry' }).click()
await page.waitForTimeout(1100)
ok('failure: Retry tries the same value again', /Not saved/.test(await page.locator('tr', { hasText: 'General Assistant' }).first().innerText()))

// 8. permission: categories without solutions:admin
await go(C('?reset=1&denied=1'))
ok('permission: a solution row is read-only', await rowSelect('Claims Triage Assistant').isDisabled())
ok('permission: the reason names the key', (await page.locator('table').getByText('You need solutions:admin to change this.').count()) > 0)
ok('permission: the module row stays editable', await rowSelect('Solutions').isEnabled())

// 9. a switched-off module contributes no record rows
await go(C('?reset=1&off=solutions'))
ok('off: the records are not listed', await rowSelect('Claims Triage Assistant').count() === 0)
ok('off: the module entry can still be filed', await rowSelect('Solutions').isEnabled())
ok('off: the screen says why', (await page.getByText('not listed until it is switched on again').count()) > 0)

// 10. filters
await go(C('?reset=1'))
await page.getByLabel('Type', { exact: true }).selectOption('module')
ok('filter: modules only', await rowSelect('Claims Triage Assistant').count() === 0 && await rowSelect('Solutions').isVisible())
await page.getByLabel('Type', { exact: true }).selectOption('all')
await page.getByRole('checkbox', { name: 'Uncategorized only' }).check()
ok('filter: uncategorized only', await rowSelect('General Assistant').isVisible() && await rowSelect('Claims Triage Assistant').count() === 0)
await page.getByRole('checkbox', { name: 'Uncategorized only' }).uncheck()
await page.getByLabel('Search items').fill('invoice')
ok('filter: search', await rowSelect('Vendor Invoice Checker').isVisible() && await rowSelect('Policy Q&A').count() === 0)
await page.getByLabel('Search items').fill('zzz')
ok('filter: empty result', (await page.locator('table').getByText('No item matches.').count()) > 0)

// 11. phone, no sideways overflow
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const pp = await phone.newPage()
for (const u of [C('?reset=1'), M(), C('?denied=1')]) {
  await pp.goto(u, { waitUntil: 'networkidle' })
  await pp.waitForTimeout(300)
  const over = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(`phone: no sideways overflow ${u.split('fullscreen')[1] || 'plain'}`, over <= 0, String(over))
}
ok('phone: the card list renders the picker', await pp.getByLabel('Category for Claims Triage Assistant', { exact: true }).count() > 0)

ok('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0)
