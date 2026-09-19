import { chromium } from 'playwright'
const B = 'http://localhost:3000'
const G = (u) => `${B}/sections/access/screen-designs/${u}`
const P = (u) => `${B}/sections/people-groups-and-roles/screen-designs/${u}`
const out = []
const ok = (name, cond, extra = '') => { const line = `${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`; out.push(line); console.log(line) }
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
const go = async (u) => { await page.goto(u, { waitUntil: 'networkidle' }); await page.waitForTimeout(350) }

// 1. person with overlapping access: catalog row names the group path
await go(G('AccessGrants/fullscreen?recipient=usr_amara'))
const claimsRow = page.locator('li', { hasText: 'Claims Triage Assistant' }).first()
ok('person: catalog row names the group path', await page.getByText('Also through Claims Review').first().isVisible())
ok('person: note line under the list', await page.getByText('marked "Also through" is reachable today').first().isVisible())

// 2. grant one solution and one module to a group, then save
await go(G('AccessGrants/fullscreen?recipient=grp_claims'))
await page.locator('li', { hasText: 'Service requests' }).first().locator('input[type=checkbox]').check()
await page.locator('li', { hasText: 'Policy Q&A' }).first().locator('input[type=checkbox]').check()
ok('group: add button counts both rows', await page.getByRole('button', { name: 'Add 2' }).isVisible())
await page.getByRole('button', { name: 'Add 2' }).click()
ok('group: pending bar counts two', await page.getByText('2 changes not saved').isVisible())
await page.getByRole('button', { name: 'Save changes' }).first().click()
await page.waitForTimeout(1300)
ok('group: toast confirms the write', await page.getByText('written to the audit log').first().isVisible())

// 3. remove a direct grant that another group still supplies
await go(G('AccessGrants/fullscreen?recipient=usr_amara'))
const granted = page.locator('section[aria-labelledby]', { hasText: 'GRANTED' }).first()
await granted.locator('li', { hasText: 'Claims Triage Assistant' }).locator('input[type=checkbox]').check()
await page.getByRole('button', { name: 'Remove 1' }).click()
const barText = await page.locator('[role=status]').first().innerText()
ok('removal: pending bar names the remaining source', /stays reachable through Claims Review/.test(barText), barText.replace(/\n/g, ' | '))
await page.getByRole('button', { name: 'Save changes' }).first().click()
await page.waitForTimeout(250)
const dlg = page.getByRole('alertdialog')
const dlgText = await dlg.innerText()
ok('removal: confirmation names the remaining source', /stays reachable through Claims Review/.test(dlgText))
ok('removal: confirmation does not claim a full revoke', !/revoked|no longer has access/i.test(dlgText))
await dlg.getByRole('button', { name: 'Save changes' }).click()
await page.waitForTimeout(1300)
ok('removal: saved', await page.getByText('written to the audit log').first().isVisible())

// 4. help disclosure: mouse, keyboard, escape
await go(G('AccessGrants/fullscreen?recipient=grp_claims'))
const help = page.getByRole('button', { name: 'How access works' })
ok('help: collapsed by default', (await help.getAttribute('aria-expanded')) === 'false')
await help.click()
ok('help: opens on click', (await help.getAttribute('aria-expanded')) === 'true' && await page.getByText('Roles define what somebody can do').first().isVisible())
await page.keyboard.press('Escape')
ok('help: Escape closes', (await help.getAttribute('aria-expanded')) === 'false')
await help.focus()
await page.keyboard.press('Enter')
ok('help: Enter opens', (await help.getAttribute('aria-expanded')) === 'true')
await page.keyboard.press('Escape')

// 5. overview: sources, scope, inactive
await go(G('AccessOverview/fullscreen?recipient=usr_amara'))
const table = await page.locator('table').innerText()
ok('overview: direct assignment named', /Direct assignment/.test(table))
ok('overview: group path named', /via Claims Review/.test(table))
ok('overview: second path named', /also through/.test(table))
ok('overview: scope named', /One record/.test(table) && /Whole tenant/.test(table))
await go(G('AccessOverview/fullscreen?recipient=grp_clinops&off=solutions'))
const t2 = await page.locator('table').innerText()
const head = await page.locator('p', { hasText: 'assignments' }).first().innerText()
ok('overview: disabled module reads inactive', /Not in effect/.test(t2) && /not in effect/.test(head), head)

// 6. disabled module: no new grant, removal still possible
await go(G('AccessGrants/fullscreen?recipient=grp_finance&off=solutions'))
const cat = page.locator('section[aria-labelledby]').first()
const policyBox = cat.locator('li', { hasText: 'Discharge Summary Drafting' }).first().locator('input[type=checkbox]')
ok('disabled: catalog row cannot be ticked', await policyBox.isDisabled())
// Select all and Add all shown reach only the rows that may still move, which is the enabled module.
await cat.getByRole('checkbox', { name: /Select all shown in Catalog/ }).check()
ok('disabled: select all skips the blocked rows', await cat.getByRole('button', { name: 'Add 1' }).isVisible())
await cat.getByRole('checkbox', { name: /Select all shown in Catalog/ }).uncheck()
await cat.getByRole('button', { name: 'Add all shown' }).click()
const afterBulk = await page.locator('[role=status]').first().innerText()
ok('disabled: add all shown adds only the module', /One change not saved/.test(afterBulk), afterBulk.replace(/\n/g, ' | '))
await page.getByRole('button', { name: 'Cancel' }).first().click()
const grantedSide = page.locator('section[aria-labelledby]').nth(1)
const keep = grantedSide.locator('li', { hasText: 'Policy Q&A' }).first().locator('input[type=checkbox]')
ok('disabled: kept grant stays removable', await keep.isEnabled())
await keep.check()
ok('disabled: remove action offered', await page.getByRole('button', { name: 'Remove 1' }).isVisible())

// 7. group membership removal explains what stays
await go(P('GroupsDirectory/fullscreen?group=grp_pilot'))
const gHelp = page.getByRole('button', { name: 'How group access works' })
ok('groups: help disclosure present and collapsed', (await gHelp.getAttribute('aria-expanded')) === 'false')
await page.locator('li', { hasText: 'Alex Morgan' }).first().locator('input[type=checkbox]').check()
await page.getByRole('button', { name: 'Remove 1' }).click()
await page.waitForTimeout(250)
// This section's confirm dialog uses role=dialog, not alertdialog.
const memberDlg = page.getByRole('dialog').filter({ hasText: 'Remove one person from' }).last()
const memberText = (await memberDlg.count()) ? await memberDlg.innerText() : ''
ok('groups: removal confirms and names what stays', /Direct roles and other group memberships still give access/.test(memberText), memberText.split('\n').slice(0, 2).join(' | '))

// 7b. advanced access still assigns one role directly to a person
await go(G('AccessGrants/fullscreen?recipient=usr_alex&dialog=advanced'))
await page.getByRole('button', { name: 'Pick a role' }).click()
await page.getByRole('button', { name: 'Assign role' }).click()
await page.waitForTimeout(400)
ok('advanced: a direct role assignment saves', await page.getByText('written to the audit log').first().isVisible())

// 7c. a module switched on again: the kept grant reads active
await go(G('AccessGrants/fullscreen?recipient=grp_finance'))
const back = page.locator('section[aria-labelledby]').nth(1)
ok('re-enable: the kept grant is no longer inactive', (await back.innerText()).includes('Policy Q&A') && !(await back.innerText()).includes('Inactive'))

// 7d. Cancel drops the pending list, and leaving with changes asks first
await go(G('AccessGrants/fullscreen?recipient=grp_claims'))
await page.locator('li', { hasText: 'Service requests' }).first().locator('input[type=checkbox]').check()
await page.getByRole('button', { name: 'Add 1' }).click()
await page.getByRole('button', { name: 'Cancel' }).first().click()
ok('cancel: the pending bar clears', await page.getByText('not saved').count() === 0)
await page.locator('li', { hasText: 'Service requests' }).first().locator('input[type=checkbox]').check()
await page.getByRole('button', { name: 'Add 1' }).click()
await page.getByRole('radio', { name: 'People' }).click()
await page.waitForTimeout(200)
ok('unsaved: changing the recipient asks first', (await page.getByRole('alertdialog').innerText()).includes('Discard'))

// 7e. broader access is collapsed unless the recipient already holds one
await go(G('AccessGrants/fullscreen?recipient=grp_claims'))
const broad = page.getByRole('button', { name: /Broader access/ })
ok('broader: collapsed by default', (await broad.getAttribute('aria-expanded')) === 'false')
ok('broader: rows are hidden while collapsed', !(await page.getByText('Every solution, now and in the future').isVisible()))
const bHelp = page.getByRole('button', { name: 'What is this?' })
await bHelp.click()
ok('broader: the help explains the grant', await page.getByText('A broader grant is one assignment with no scope').isVisible())
await page.keyboard.press('Escape')
await broad.click()
ok('broader: opens on press', await page.getByText('Every solution, now and in the future').isVisible())
await go(G('AccessGrants/fullscreen?recipient=grp_pilot'))
const broad2 = page.getByRole('button', { name: /Broader access/ })
ok('broader: opens itself when one is held', (await broad2.getAttribute('aria-expanded')) === 'true' && (await broad2.innerText()).includes('One grant'))
ok('broader: the header counts what is on', await page.getByText('1 on').isVisible())

// 8. roles help
await go(P('RolesDirectory/fullscreen'))
ok('roles: help disclosure present', await page.getByRole('button', { name: 'How roles work' }).isVisible())

// 9. phone: no sideways overflow on the changed screens
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const pp = await phone.newPage()
for (const u of [G('AccessGrants/fullscreen?recipient=usr_amara'), G('AccessOverview/fullscreen?recipient=usr_amara'), P('RolesDirectory/fullscreen'), P('GroupsDirectory/fullscreen?group=grp_pilot')]) {
  await pp.goto(u, { waitUntil: 'networkidle' }); await pp.waitForTimeout(300)
  const over = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(`phone: no sideways overflow ${u.split('/').slice(-1)[0].slice(0, 40)}`, over <= 0, String(over))
}
// touch: the help disclosure opens by tap
await pp.goto(G('AccessGrants/fullscreen?recipient=grp_claims'), { waitUntil: 'networkidle' })
await pp.waitForTimeout(300)
const ph = pp.getByRole('button', { name: 'How access works' })
await ph.tap()
ok('help: opens on tap', (await ph.getAttribute('aria-expanded')) === 'true')

ok('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0)
