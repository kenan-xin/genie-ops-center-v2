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
await go(G('AccessOverview/fullscreen?reset=1&recipient=usr_amara'))
const table = await page.locator('table').innerText()
ok('overview: direct assignment named', /Direct assignment/.test(table))
ok('overview: group path named', /via Claims Review/.test(table))
ok('overview: second path named', /also through/.test(table))
ok('overview: scope named', /One record/.test(table) && /Whole tenant/.test(table))

// 5a. "also through" means another path that is effective now, for the same person and the same
// permission. A whole-module grant covers a single record; a different permission does not.
const rowOf = (label) => page.locator('tbody tr', { hasText: label }).first()
const claims = await rowOf('Claims Triage Assistant').innerText()
ok('overview: a whole-module grant counts as a path to one record', /also through/.test(claims) && /Claims Review/.test(claims) && /AI Pilot Cohort/.test(claims), claims.replace(/\n/g, ' | '))
const wholeModule = await page.locator('tbody tr', { hasText: 'Every solution' }).first().innerText()
ok('overview: one record is not a path to the whole module', !/also through/.test(wholeModule), wholeModule.replace(/\n/g, ' | '))

await go(G('AccessOverview/fullscreen?reset=1&recipient=usr_leila'))
const auditor = await page.locator('tbody tr', { hasText: 'Auditor' }).first().innerText()
const tenantAdmin = await page.locator('tbody tr', { hasText: 'Tenant administrator' }).first().innerText()
ok('overview: a different permission is not an alternative path', !/also through/.test(auditor) && !/also through/.test(tenantAdmin), `${auditor.replace(/\n/g, ' | ')} // ${tenantAdmin.replace(/\n/g, ' | ')}`)

await go(G('AccessOverview/fullscreen?reset=1&recipient=usr_amara&off=solutions'))
ok('overview: a path that is not in effect is never the path that stays', !/also through/.test(await page.locator('table').innerText()))

await go(G('AccessOverview/fullscreen?reset=1&record=sol_general'))
ok('overview: unrelated holders of one record are not each other\'s path', !/also through/.test(await page.locator('table').innerText()))
await go(G('AccessOverview/fullscreen?reset=1&recipient=grp_clinops&off=solutions'))
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

// 7a2. a link from one solution keeps that solution in view through choosing a recipient
await go(G('AccessGrants/fullscreen?reset=1&module=solutions&level=use&record=sol_policy'))
ok('context: the screen names the solution the link came for', /You came here for/.test(await page.locator('body').innerText()) && await page.getByText('Policy Q&A').first().isVisible())
ok('context: no recipient is chosen for the administrator', await page.getByText('Choose a group to start').isVisible())
await page.getByRole('button', { name: 'Choose a group' }).first().click()
await page.getByRole('option', { name: /Finance/ }).click()
await page.waitForTimeout(400)
const ctxBody = await page.locator('body').innerText()
ok('context: it survives choosing a recipient', /You came here for/.test(ctxBody) && /Policy Q&A/.test(ctxBody))
ok('context: both lists start narrowed to it', (await page.locator('section[aria-labelledby] li').filter({ hasText: 'Claims Triage Assistant' }).count()) === 0)
ok('context: the solution is on the granted side for this group', await page.locator('section[aria-labelledby]', { hasText: 'Granted' }).getByText('Policy Q&A').first().isVisible())
await page.getByRole('button', { name: 'Show everything' }).click()
await page.waitForTimeout(300)
ok('context: it can be cleared, and the whole catalogue comes back', await page.getByText('Claims Triage Assistant').first().isVisible())

// 7b. advanced access stages one role directly, and one Save writes it into the real grant list
await go(G('AccessGrants/fullscreen?recipient=usr_alex&dialog=advanced'))
const sheet = page.getByRole('dialog', { name: 'Advanced access' })
ok('advanced: nothing is pending when the sheet opens', /Nothing to save yet/.test(await sheet.innerText()))
await sheet.getByRole('button', { name: 'Pick a role' }).click()
await sheet.getByRole('button', { name: 'Add to changes' }).click()
await page.waitForTimeout(300)
ok('advanced: the picked role joins the pending list', /One change not saved/.test(await sheet.innerText()))
ok('advanced: the sheet stays open, so nothing is written yet', await sheet.isVisible())
ok('advanced: the staged row can be taken back', await sheet.getByRole('button', { name: 'Remove' }).isVisible())
await sheet.getByRole('button', { name: 'Save changes' }).click()
await page.waitForTimeout(1300)
ok('advanced: the save is reported', await page.getByText(/written to the audit log/i).first().isVisible())
ok('advanced: the sheet closes on a successful save', await sheet.count() === 0)
// The proof is the grant list itself, not the toast: the line under the catalogue names the new row.
ok('advanced: the assignment is in the grant state', /People operations/.test(await page.locator('body').innerText()))

// 7b1. an existing directly assigned role can be read, staged for removal, undone, and saved
await go(G('AccessGrants/fullscreen?reset=1&recipient=grp_clinops&dialog=advanced'))
const direct = page.getByRole('dialog', { name: 'Advanced access' })
ok('direct: the sheet lists the role assigned directly', /Roles the levels above do not cover/.test(await direct.innerText()) && /Legal reviewer/.test(await direct.innerText()))
ok('direct: the row names the module and the scope', /Solutions . Policy Q&A/.test(await direct.innerText()), (await direct.innerText()).match(/Legal reviewer[\s\S]{0,80}/)?.[0]?.replace(/\n/g, ' | '))
const legalRow = direct.locator('li', { hasText: 'Legal reviewer' }).first()
await legalRow.getByRole('button', { name: 'Remove' }).click()
await page.waitForTimeout(250)
ok('direct: the removal is staged, not written', /Pending removal/.test(await direct.innerText()) && /One change not saved/.test(await direct.innerText()))
await legalRow.getByRole('button', { name: 'Undo' }).click()
await page.waitForTimeout(250)
ok('direct: Undo takes the removal back', !/Pending removal/.test(await direct.innerText()) && /Nothing to save yet/.test(await direct.innerText()))
// Cancel closes the sheet without writing, so the assignment is still there on the next opening.
await legalRow.getByRole('button', { name: 'Remove' }).click()
await direct.getByRole('button', { name: 'Cancel' }).click()
await page.waitForTimeout(300)
await go(G('AccessGrants/fullscreen?recipient=grp_clinops&dialog=advanced'))
ok('direct: cancelling keeps the assignment', /Legal reviewer/.test(await direct.innerText()) && !/Pending removal/.test(await direct.innerText()))
// Now save it for real.
await direct.locator('li', { hasText: 'Legal reviewer' }).first().getByRole('button', { name: 'Remove' }).click()
await direct.getByRole('button', { name: 'Save changes' }).click()
await page.waitForTimeout(1400)
ok('direct: the save closes the sheet', await direct.count() === 0)
ok('direct: the assignment is gone from the grant state', !/Legal reviewer/.test(await page.locator('body').innerText()))
await go(G('AccessGrants/fullscreen?recipient=grp_clinops&dialog=advanced'))
ok('direct: reopening shows the empty state', /Clinical Operations holds nothing the levels above cannot show/.test(await direct.innerText()))

// 7b1a. a kept assignment the level controls cannot reach is still listed and still removable
// ra_old_audit is held at the `audit` level of Solutions, which the module no longer offers, and its
// role is not in the picker either. It is not a `custom` grant, so a list keyed on that value misses it.
await go(G('AccessGrants/fullscreen?reset=1&recipient=grp_old&dialog=advanced'))
ok('retired: the assignment is listed', /Solutions auditor/.test(await direct.innerText()))
const retiredRow = direct.locator('li', { hasText: 'Solutions auditor' }).first()
ok('retired: the row says the level is no longer offered', /no longer offers this access level/.test(await retiredRow.innerText()), (await retiredRow.innerText()).replace(/\n/g, ' | '))
ok('retired: the screen makes no claim about what the retired key still grants', !/grants nothing|still grants|gives nothing/i.test(await retiredRow.innerText()))
ok('retired: an archived group does not block the removal', await retiredRow.getByRole('button', { name: 'Remove' }).isEnabled())
await retiredRow.getByRole('button', { name: 'Remove' }).click()
await page.waitForTimeout(250)
ok('retired: the removal stages like any other', /Pending removal/.test(await direct.innerText()) && /One change not saved/.test(await direct.innerText()))
await direct.getByRole('button', { name: 'Save changes' }).click()
await page.waitForTimeout(1400)
await go(G('AccessGrants/fullscreen?recipient=grp_old&dialog=advanced'))
ok('retired: one Save removed it', !/Solutions auditor/.test(await direct.innerText()))

// 7b1b. a switched-off module never blocks the removal of a kept grant
await go(G('AccessGrants/fullscreen?reset=1&recipient=grp_procurement&dialog=advanced'))
ok('direct: a grant of a switched-off module is listed', /Asset disposal approver/.test(await direct.innerText()))
ok('direct: its removal is offered anyway', await direct.locator('li', { hasText: 'Asset disposal approver' }).first().getByRole('button', { name: 'Remove' }).isEnabled())

// 7b1c. a protected administrator cannot be removed this way either
await go(G('AccessGrants/fullscreen?reset=1&admins=picked&recipient=usr_leila&dialog=advanced'))
const leilaRow = direct.locator('li', { hasText: 'Tenant administrator' }).first()
ok('direct: the last active administrator is listed', await leilaRow.isVisible())
ok('direct: its removal is refused', await leilaRow.getByRole('button', { name: 'Remove' }).isDisabled())
ok('direct: the reason is on the row', /no active tenant administrator/i.test(await leilaRow.innerText()), (await leilaRow.innerText()).replace(/\n/g, ' | '))
ok('direct: the reason says what to do first', /Give the role to somebody else first/.test(await leilaRow.innerText()))
await go(G('AccessGrants/fullscreen?reset=1&admins=self&recipient=usr_priya&dialog=advanced'))
const selfRow = direct.locator('li', { hasText: 'Tenant administrator' }).first()
ok('direct: an administrator cannot remove their own role here', await selfRow.getByRole('button', { name: 'Remove' }).isDisabled())
ok('direct: self-protection is the reason given', /cannot change your own access/i.test(await selfRow.innerText()), (await selfRow.innerText()).replace(/\n/g, ' | '))

// 7b2. the last-active-administrator rule counts people, not grant rows
await go(G('AccessGrants/fullscreen?admins=edge&recipient=grp_admins&module=core&level=admin&dialog=advanced'))
const adminSheet = page.getByRole('dialog', { name: 'Advanced access' })
const adminBox = adminSheet.locator('input[type=checkbox]').first()
ok('last admin: the revoke is refused', await adminBox.isDisabled())
// The other two core administration rows are real, and neither one carries an active person: one
// belongs to a pending person and one to an archived group. Counting rows would have allowed this.
await go(G('AccessGrants/fullscreen?admins=edge&recipient=usr_daniel'))
ok('last admin: a pending person holds a second grant row', /Tenant administrator/.test(await page.locator('body').innerText()))
await go(G('AccessGrants/fullscreen?admins=edge&recipient=grp_old'))
ok('last admin: an archived group holds a third grant row', /Tenant administrator/.test(await page.locator('body').innerText()))
await go(G('AccessGrants/fullscreen?admins=edge&recipient=grp_admins&module=core&level=admin&dialog=advanced'))
ok('last admin: the reason is stated on the screen', /no active tenant administrator/i.test(await adminSheet.innerText()))
ok('last admin: it says to give the role to somebody else first', /Give the role to somebody else first/.test(await adminSheet.innerText()))

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
for (const u of [G('AccessGrants/fullscreen?recipient=usr_amara'), G('AccessOverview/fullscreen?reset=1&recipient=usr_amara'), P('RolesDirectory/fullscreen'), P('GroupsDirectory/fullscreen?group=grp_pilot')]) {
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
