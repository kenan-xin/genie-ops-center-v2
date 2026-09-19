import { chromium } from 'playwright'

const B = 'http://localhost:3000'
const S = (q = '') => `${B}/sections/audit-and-tenant-settings/screen-designs/TenantSettings/fullscreen${q}`
const out = []
const ok = (name, cond, extra = '') => { const l = `${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`; out.push(l); console.log(l) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
const go = async (u) => { await page.goto(u, { waitUntil: 'networkidle' }); await page.waitForTimeout(350) }
const nav = page.getByRole('navigation', { name: 'Settings sections' })

// 1. default: the navigator, its two groups, and one section's form
await go(S())
ok('default: the Tenant group lists both core sections', await nav.getByRole('button', { name: /Sign-in & accounts/ }).isVisible() && await nav.getByRole('button', { name: /^Sessions/ }).isVisible())
ok('default: the Modules group lists the modules that declare settings', await nav.getByRole('button', { name: /Contracts/ }).isVisible() && await nav.getByRole('button', { name: /Approvals/ }).isVisible())
ok('default: a module without settings is absent', await nav.getByRole('button', { name: /Solutions/ }).count() === 0)
ok('default: the selected section shows its form', await page.getByRole('heading', { name: 'Sessions' }).isVisible() && await page.getByLabel('Idle timeout').isVisible())
ok('default: the disabled module is marked', (await nav.getByRole('button', { name: /Approvals/ }).innerText()).includes('Disabled'))
ok('default: the scale fixtures are marked', (await nav.getByRole('button', { name: /Inventory/ }).innerText()).includes('Sample'))

// 2. search: exact, breadcrumb, and the jump to the field
await page.getByLabel('Search all settings').fill('reminders')
await page.waitForTimeout(250)
const firstResult = page.locator('li button', { hasText: 'Renewal reminders' }).first()
ok('search: a result carries the setting name', await firstResult.isVisible())
ok('search: a result carries the section breadcrumb', (await firstResult.innerText()).includes('Modules › Contracts'))
await firstResult.click()
await page.waitForTimeout(300)
ok('search: choosing a result opens the section', await page.getByRole('heading', { name: 'Contracts' }).isVisible())
const focused = await page.evaluate(() => document.activeElement?.id ?? '')
ok('search: the field takes focus', focused === 'cfg-remindersEnabled', focused)
ok('search: the field is highlighted', await page.locator('.ring-2.ring-blue-500').first().isVisible())

// 3. typo tolerance
await go(S('?q=timout'))
ok('typo: “timout” finds Idle timeout', await page.locator('li button', { hasText: 'Idle timeout' }).first().isVisible())
ok('typo: the breadcrumb reads the Tenant group', (await page.locator('li button', { hasText: 'Idle timeout' }).first().innerText()).includes('Tenant › Sessions'))
await go(S('?q=remidners'))
ok('typo: “remidners” finds Renewal reminders', await page.locator('li button', { hasText: 'Renewal reminders' }).first().isVisible())

// 4. no results, and what the search does not read
await go(S('?q=supplier'))
const none = await page.locator('section').filter({ hasText: 'No setting matches' }).first().innerText()
ok('no results: the empty state names the query', /No setting matches/.test(none) && none.includes('supplier'))
ok('no results: a saved value is not searched', !(await page.locator('li button', { hasText: 'Registry name' }).count()), 'the stored value is “Supplier contracts”')
ok('no results: the state says values and secrets are not read', /does not read saved values/.test(none) && /never reads a secret/.test(none))

// 5. a disabled module stays configurable, and saving does not enable it
await go(S('?section=approvals'))
ok('disabled: the section opens', await page.getByRole('heading', { name: 'Approvals' }).isVisible())
ok('disabled: the note explains the state', await page.getByText('Approvals is switched off.').isVisible())
ok('disabled: the note says saving does not switch it on', await page.getByText(/never switches the module on/).isVisible())
ok('disabled: the fields are editable', await page.getByLabel('Reminder interval').isEnabled())
await page.getByLabel('Reminder interval').fill('7')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForTimeout(1200)
ok('disabled: the save reports itself', await page.getByText(/Approvals saved/).isVisible())

// 6. validation blocks the save
await go(S('?section=sessions'))
await page.getByLabel('Idle timeout').fill('900')
await page.waitForTimeout(150)
ok('validation: the message appears', await page.getByText('Enter a whole number from 5 to 480.').isVisible())
ok('validation: Save is disabled', await page.getByRole('button', { name: 'Save', exact: true }).isDisabled())

// 7. a refused save keeps the edit
await go(S('?section=contracts&fail=contracts'))
await page.getByLabel('Registry name').fill('Vendor agreements')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForTimeout(1200)
ok('failure: the section reports the refusal', await page.getByText(/Not saved\./).isVisible())
ok('failure: the edit is still there', await page.getByLabel('Registry name').inputValue() === 'Vendor agreements')
ok('failure: no success toast', await page.getByText(/saved\. Written to the audit log/).count() === 0)
ok('failure: Retry is offered', await page.getByRole('button', { name: 'Retry' }).isVisible())

// 8. unsaved work is protected on every path out
await go(S('?section=sessions'))
await page.getByLabel('Idle timeout').fill('45')
await nav.getByRole('button', { name: /Contracts/ }).click()
await page.waitForTimeout(250)
const dlg = page.getByRole('alertdialog')
ok('unsaved: changing section asks first', (await dlg.innerText()).includes('Discard the changes in Sessions?'))
await dlg.getByRole('button', { name: 'Cancel' }).click()
ok('unsaved: Cancel keeps the edit', await page.getByLabel('Idle timeout').inputValue() === '45')
await page.getByLabel('Search all settings').fill('registry')
await page.waitForTimeout(250)
await page.locator('li button', { hasText: 'Registry name' }).first().click()
await page.waitForTimeout(250)
ok('unsaved: following a search result asks first', (await page.getByRole('alertdialog').innerText()).includes('Discard'))
await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click()
await page.waitForTimeout(300)
ok('unsaved: Discard follows through to the result', await page.getByRole('heading', { name: 'Contracts' }).isVisible())
ok('unsaved: the discarded edit is gone', await page.getByLabel('Search all settings').inputValue() === '')

// 9. the navigator marks an unsaved section
await go(S('?draft=1'))
const sessionsRow = nav.getByRole('button', { name: /^Sessions/ })
ok('unsaved: the section row carries the dot', (await sessionsRow.innerHTML()).includes('Unsaved'))

// 10. phone: a list that leads to a detail screen
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const pp = await phone.newPage()
await pp.goto(S(), { waitUntil: 'networkidle' })
await pp.waitForTimeout(350)
ok('phone: the list is the first screen', await pp.getByRole('navigation', { name: 'Settings sections' }).isVisible() && await pp.getByRole('heading', { name: 'Sessions' }).count() === 0)
await pp.getByRole('button', { name: /Contracts/ }).click()
await pp.waitForTimeout(300)
ok('phone: choosing a section opens the detail', await pp.getByRole('heading', { name: 'Contracts' }).isVisible())
ok('phone: Back returns to the list', await pp.getByRole('button', { name: 'All settings' }).isVisible())
await pp.getByRole('button', { name: 'All settings' }).click()
await pp.waitForTimeout(250)
ok('phone: the list is back', await pp.getByRole('navigation', { name: 'Settings sections' }).isVisible())
const over = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok('phone: no sideways overflow', over <= 0, String(over))

// 11. the help disclosure
await go(S())
const help = page.getByRole('button', { name: 'What is searched' })
ok('help: collapsed by default', (await help.getAttribute('aria-expanded')) === 'false')
await help.click()
ok('help: explains the typo rule', await page.getByText(/tolerates one typo/).isVisible())
await page.keyboard.press('Escape')
ok('help: Escape closes', (await help.getAttribute('aria-expanded')) === 'false')

ok('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0)
