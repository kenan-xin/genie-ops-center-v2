// Module reintroduction review on the Modules page.
// Run the design server first, then: node scripts/capture/verify-modules.mjs
import { chromium } from 'playwright'

const B = 'http://localhost:3000'
const M = (q = '') => `${B}/sections/audit-and-tenant-settings/screen-designs/ModulesPage/fullscreen${q}`
const A = (q = '') => `${B}/sections/access/screen-designs/AccessGrants/fullscreen${q}`
const out = []
const ok = (name, cond, extra = '') => { const l = `${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`; out.push(l); console.log(l) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
const go = async (u) => { await page.goto(u, { waitUntil: 'networkidle' }); await page.waitForTimeout(350) }
const table = page.locator('table')
const row = (name) => table.locator('tr', { hasText: name }).first()
const panel = page.getByRole('dialog', { name: /Review Asset register/ })

// 1. the two disabled states are told apart, and only one of them is a switch
await go(M('?reset=1'))
ok('ordinary: a switched-off module keeps its switch', await row('Approvals').getByRole('switch').isVisible())
ok('ordinary: it is marked Off', (await row('Approvals').innerText()).includes('Off'))
ok('reintroduced: the row carries no switch', await row('Asset register').getByRole('switch').count() === 0)
ok('reintroduced: it is marked Review needed', (await row('Asset register').innerText()).includes('Review needed'))
ok('reintroduced: the control reads Review and enable', await row('Asset register').getByRole('button', { name: /Review and enable/ }).isVisible())
ok('reintroduced: the state is not read from enabled === false', (await row('Approvals').innerText()).includes('Off') && !(await row('Approvals').innerText()).includes('Review needed'))

// 2. the review reads what was kept and what does not come back
await row('Asset register').getByRole('button', { name: /Review and enable/ }).click()
await page.waitForTimeout(300)
ok('review: the panel opens', await panel.isVisible())
ok('review: the focus lands inside the panel', await page.evaluate(() => document.activeElement?.tagName) === 'H2')
ok('review: it says the module returned and stays off', /returned to this deployment/.test(await panel.innerText()))
ok('review: retained configuration is stated', /These are the settings the tenant kept/.test(await panel.innerText()))
ok('review: the kept settings are listed inline', /Register name/.test(await panel.innerText()) && /Clinical equipment register/.test(await panel.innerText()))
ok('review: an enum reads as its label, not its stored value', /Straight line/.test(await panel.innerText()) && !/straight-line/.test(await panel.innerText()))
ok('review: the settings list is read-only', await panel.locator('input:not([type=checkbox]), select, textarea').count() === 0)
ok('review: a restoring grant is listed', /Biomedical engineering/.test(await panel.innerText()) && (await panel.getByText('Restores').count()) >= 3)
ok('review: a grant that does not restore now is listed with its reason', /Does not restore now/.test(await panel.innerText()) && /archived in July/.test(await panel.innerText()))
ok('review: it does not claim a kept assignment can never matter again', /is kept, not deleted/.test(await panel.innerText()) && !/never restores/.test(await panel.innerText()))
ok('review: revoked credentials stay revoked', /does not revive them/.test(await panel.innerText()))
ok('review: cancelled work does not resume', /stays cancelled/.test(await panel.innerText()))
ok('review: stopped schedules do not resume', /schedules were stopped/.test(await panel.innerText()))
ok('review: it is not a second permission editor', await panel.locator('input[type=checkbox]').count() === 1)
ok('review: the confirmation names the restoring count', /restores the 3 assignments marked Restores/.test(await panel.innerText()))
ok('review: the preview does not claim the checkbox is the guard', /it is not what enforces it/.test(await panel.innerText()))

// 3. the confirmation gates the action
const enable = panel.getByRole('button', { name: /Enable Asset register/ })
ok('confirm: Enable is refused before the box is ticked', await enable.isDisabled())
await panel.locator('input[type=checkbox]').check()
ok('confirm: Enable is offered after the box is ticked', await enable.isEnabled())

// 4. cancelling changes nothing
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
ok('cancel: Escape closes the panel', await panel.count() === 0)
ok('cancel: the module is still off', (await row('Asset register').innerText()).includes('Review needed'))
await row('Asset register').getByRole('button', { name: /Review and enable/ }).click()
await page.waitForTimeout(300)
ok('cancel: reopening starts from an unticked box', !(await panel.locator('input[type=checkbox]').isChecked()))
await panel.getByRole('button', { name: 'Cancel' }).click()
await page.waitForTimeout(250)
ok('cancel: the Cancel button closes without enabling', await panel.count() === 0 && (await row('Asset register').innerText()).includes('Review needed'))

// 5. invalid required configuration refuses activation
await go(M('?reset=1&review=assets&config=invalid'))
ok('config: the panel opens from the link', await panel.isVisible())
ok('config: the refusal names the field', /Register name is required/.test(await panel.innerText()))
ok('config: the field at fault is marked in the list', /Not set/.test(await panel.innerText()))
ok('config: the message says how to recover', /Set it in the settings section, then reopen this review/.test(await panel.innerText()))
ok('config: the valid field still shows its value', /Straight line/.test(await panel.innerText()))
ok('config: it says the module cannot be enabled yet', /cannot be enabled until this is fixed/.test(await panel.innerText()))
ok('config: the confirmation cannot be ticked', await panel.locator('input[type=checkbox]').isDisabled())
ok('config: Enable stays refused', await panel.getByRole('button', { name: /Enable Asset register/ }).isDisabled())
await page.keyboard.press('Escape')
ok('config: the module stays off', (await row('Asset register').innerText()).includes('Review needed'))

// 6. review -> settings -> review. The saved value comes back into the review, and saving never enables.
await go(M('?reset=1&review=assets'))
ok('settings: the review starts from the kept value', /Clinical equipment register(?!s? 2)/.test(await panel.innerText()))
await panel.getByRole('link', { name: /Open Asset register settings/ }).click()
await page.waitForTimeout(600)
ok('settings: the link lands on the module section', /TenantSettings/.test(page.url()) && /section=assets/.test(page.url()), page.url())
ok('settings: the section says saving never switches it on', /never switches the module on/.test(await page.locator('body').innerText()))
await page.getByLabel('Register name').fill('Clinical equipment register 2')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForTimeout(1200)
// No reset: the reopened review must read the value that was just written.
await go(M('?review=assets'))
ok('settings: the saved value appears in the reopened review', /Clinical equipment register 2/.test(await panel.innerText()))
ok('settings: the other kept value is untouched', /Straight line/.test(await panel.innerText()))
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
ok('settings: saving configuration did not enable the module', (await row('Asset register').innerText()).includes('Review needed'))
ok('settings: the module still has no ordinary switch', await row('Asset register').getByRole('switch').count() === 0)

// 7. review -> Access -> review. Removing a retained assignment changes the list and the count.
await go(M('?reset=1&review=assets'))
// `innerText` returns the rendered text, and the block heading is uppercased by the type scale.
ok('access: the review starts at three of five', /retained access . 3 of 5 restore/i.test(await panel.innerText()), (await panel.innerText()).match(/[Rr]etained access[^\n]*/i)?.[0])
ok('access: the assignment to remove is listed', /Biomedical engineering/.test(await panel.innerText()))
await panel.getByRole('link', { name: 'Biomedical engineering' }).click()
await page.waitForTimeout(700)
ok('access: the row opens Access on that recipient and module', /AccessGrants/.test(page.url()) && /recipient=grp_biomed/.test(page.url()) && /module=assets/.test(page.url()), page.url())
const assetsGrant = page.getByText('Every asset group, now and in the future').first()
ok('access: the retained assignment is an editable row there', await assetsGrant.isVisible())
await page.locator('label', { hasText: 'Every asset group, now and in the future' }).locator('input[type=checkbox]').uncheck()
await page.waitForTimeout(200)
ok('access: the removal is pending, not written yet', await page.getByText(/One change not saved/).first().isVisible())
await page.getByRole('button', { name: 'Save changes' }).first().click()
await page.waitForTimeout(1400)
ok('access: the save is reported', await page.getByText(/written to the audit log/i).first().isVisible())
// No reset: the review must read the tenant as Access left it.
await go(M('?review=assets'))
ok('access: the removed assignment is gone from the review', !/Biomedical engineering/.test(await panel.innerText()))
ok('access: the restore count dropped to two of four', /retained access . 2 of 4 restore/i.test(await panel.innerText()), (await panel.innerText()).match(/[Rr]etained access[^\n]*/i)?.[0])
ok('access: the confirmation names the new count', /restores the 2 assignments marked Restores/.test(await panel.innerText()))
ok('access: the other assignments are still listed', /Facilities/.test(await panel.innerText()) && /Mei Lin Tan/.test(await panel.innerText()))
ok('access: removing an assignment did not enable the module', (await row('Asset register').innerText()).includes('Review needed'))
// The corrected review still activates.
await panel.locator('input[type=checkbox]').check()
await panel.getByRole('button', { name: /Enable Asset register/ }).click()
await page.waitForTimeout(1400)
ok('access: the corrected review activates the module', await row('Asset register').getByRole('switch').isChecked())
ok('access: the review state is gone once it is on', !(await row('Asset register').innerText()).includes('Review needed'))
// Put the shared preview record back for the sections that follow.
await go(A('?reset=1'))

// 8. a refused activation keeps the module off and keeps the review
await go(M('?reset=1&review=assets&fail=1'))
await panel.locator('input[type=checkbox]').check()
await panel.getByRole('button', { name: /Enable Asset register/ }).click()
await page.waitForTimeout(1400)
ok('failure: the panel stays open', await panel.isVisible())
ok('failure: it says the module is still off', /still switched off and nothing was restored/.test(await panel.innerText()))
ok('failure: the ticked review is preserved', await panel.locator('input[type=checkbox]').isChecked())
ok('failure: Retry is offered', await panel.getByRole('button', { name: /Retry enabling/ }).isVisible())
ok('failure: no success toast', await page.getByText(/is on\. Written to the audit log/).count() === 0)
await page.keyboard.press('Escape')
ok('failure: the row still reads Review needed', (await row('Asset register').innerText()).includes('Review needed'))

// 9. a confirmed activation enables the module, which then behaves like any other
await go(M('?reset=1&review=assets'))
await panel.locator('input[type=checkbox]').check()
await panel.getByRole('button', { name: /Enable Asset register/ }).click()
await page.waitForTimeout(1400)
ok('success: the panel closes', await panel.count() === 0)
ok('success: the page reports it', await page.getByText(/Asset register is on\./).isVisible())
ok('success: the row now carries an ordinary switch', await row('Asset register').getByRole('switch').isChecked())
ok('success: the Review needed mark is gone', !(await row('Asset register').innerText()).includes('Review needed'))
await go(M())
ok('success: it survives a reload as an ordinary module', await row('Asset register').getByRole('switch').isChecked())

// 9b. once reviewed, the module is ordinary: switching it off does not ask for a second review
await go(M('?reset=1&review=assets'))
await panel.locator('input[type=checkbox]').check()
await panel.getByRole('button', { name: /Enable Asset register/ }).click()
await page.waitForTimeout(1400)
ok('ordinary again: the module is on', await row('Asset register').getByRole('switch').isChecked())
// Access reads the same module state, so an enabled module no longer reads as switched off there.
await go(A())
ok('ordinary again: Access sees the module as on', !/Asset register module is switched off/.test(await page.locator('body').innerText()))
await go(M())
await row('Asset register').locator('label').first().click()
await page.waitForTimeout(300)
const offConfirm = page.getByRole('alertdialog')
if (await offConfirm.count()) { await offConfirm.getByRole('button', { name: /Switch off|Turn off|Disable/ }).first().click(); await page.waitForTimeout(500) }
ok('ordinary again: switching it off keeps the ordinary switch', await row('Asset register').getByRole('switch').count() === 1)
ok('ordinary again: it does not ask for a second review', !(await row('Asset register').innerText()).includes('Review needed'))
ok('ordinary again: no Review and enable control returns', await row('Asset register').getByRole('button', { name: /Review and enable/ }).count() === 0)
await row('Asset register').locator('label').first().click()
await page.waitForTimeout(500)
ok('ordinary again: switching it on is one step', await row('Asset register').getByRole('switch').isChecked())
ok('ordinary again: a reload keeps it ordinary', await (async () => { await go(M()); return (await row('Asset register').getByRole('switch').count()) === 1 })())

// 10. keyboard only
await go(M('?reset=1'))
await row('Asset register').getByRole('button', { name: /Review and enable/ }).focus()
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
ok('keyboard: Enter opens the review', await panel.isVisible())
const reach = async (name) => {
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    const hit = await page.evaluate(() => {
      const el = document.activeElement
      return `${el?.tagName}|${el?.getAttribute('type') ?? ''}|${el?.textContent?.trim().slice(0, 40) ?? ''}`
    })
    if (name.test(hit)) return true
  }
  return false
}
ok('keyboard: Tab reaches the confirmation box', await reach(/checkbox/))
await page.keyboard.press('Space')
ok('keyboard: Space ticks it', await panel.locator('input[type=checkbox]').isChecked())
ok('keyboard: Tab reaches the Enable button', await reach(/Enable Asset register/))
await page.keyboard.press('Enter')
await page.waitForTimeout(1400)
ok('keyboard: Enter activates', await page.getByText(/Asset register is on\./).isVisible())

// 11. phone
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const pp = await phone.newPage()
await pp.goto(M('?reset=1'), { waitUntil: 'networkidle' })
await pp.waitForTimeout(350)
ok('phone: the card carries Review and enable', await pp.getByRole('button', { name: /Review and enable/ }).first().isVisible())
await pp.getByRole('button', { name: /Review and enable/ }).first().click()
await pp.waitForTimeout(350)
const pPanel = pp.getByRole('dialog', { name: /Review Asset register/ })
ok('phone: the review is a full-height sheet', await pPanel.isVisible())
for (const [label, target] of [['list', M('?reset=1')], ['review', M('?reset=1&review=assets')]]) {
  await pp.goto(target, { waitUntil: 'networkidle' })
  await pp.waitForTimeout(350)
  const over = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(`phone: no sideways overflow on the ${label}`, over <= 0, String(over))
}

ok('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0)
