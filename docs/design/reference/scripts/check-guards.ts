/**
 * The last-active-administrator rule, checked against the cases the design review named:
 * empty groups, pending and disabled people, overlapping grants, group archival, and a grant list
 * that changed between load and save. Run it with `node scripts/check-guards.ts`.
 *
 * These are preview checks on a pure function. The server holds the rule; a screen check only
 * explains the refusal earlier.
 */
import assert from 'node:assert/strict'
import type { Group, Person, Role, RoleAssignment } from '../product/sections/people-groups-and-roles/types.ts'
import type { AccessModule, AccessProps, Grant, PendingChange, Recipient } from '../product/sections/access/types.ts'
import { activeTenantAdmins as peopleAdmins, guardReason, wouldRemoveLastTenantAdmin } from '../src/sections/people-groups-and-roles/components/helpers.ts'
import { activeTenantAdmins as accessAdmins, refusalFor, tenantAdminRoleIds } from '../src/sections/access/components/helpers.ts'

let checks = 0
const check = (name: string, run: () => void) => { run(); checks++; console.log(`  ok  ${name}`) }

/* People, groups and roles. */

const ADMIN: Role = { id: 'role_admin', name: 'Tenant administrator', description: '', kind: 'system', moduleId: 'core', permissionKeys: [], assignmentCount: 1, editable: false } as unknown as Role
const OTHER: Role = { ...ADMIN, id: 'role_reader', name: 'Reader' }

const person = (id: string, status: Person['status'], groupIds: string[] = []): Person =>
  ({ id, name: id, email: `${id}@example.test`, status, accountType: 'brokered', identitySource: 'Okta', groupIds, firstSignInAt: null, lastSignInAt: null, onboarding: 'invited' }) as unknown as Person

const group = (id: string, archived = false): Group =>
  ({ id, name: id, description: '', source: 'idp', externalId: id, memberCount: 0, syncedAt: null, stale: false, lastSeenAt: null, archived }) as unknown as Group

const toGroup = (id: string, groupId: string): RoleAssignment =>
  ({ id, roleId: ADMIN.id, principalType: 'group', principalId: groupId, scopeType: null, scopeId: null, createdBy: 'Provisioning', createdAt: '2026-01-01T00:00:00Z' }) as unknown as RoleAssignment

const toUser = (id: string, personId: string): RoleAssignment =>
  ({ ...toGroup(id, ''), principalType: 'user', principalId: personId }) as unknown as RoleAssignment

const state = (people: Person[], roleAssignments: RoleAssignment[], groups: Group[]) =>
  ({ people, roles: [ADMIN, OTHER], roleAssignments, groups })

check('two active administrators: removing one is allowed', () => {
  const s = state([person('a', 'active', ['g']), person('b', 'active', ['g'])], [toGroup('ra1', 'g')], [group('g')])
  assert.equal(peopleAdmins(s).length, 2)
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'removePerson', personId: 'a' }), false)
})

check('a pending person is not an active administrator', () => {
  const s = state([person('a', 'active', ['g']), person('b', 'pending', ['g'])], [toGroup('ra1', 'g')], [group('g')])
  assert.deepEqual(peopleAdmins(s), ['a'])
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'removePerson', personId: 'a' }), true)
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'disablePerson', personId: 'a' }), true)
})

check('a disabled person is not an active administrator', () => {
  const s = state([person('a', 'active', ['g']), person('b', 'disabled', ['g'])], [toGroup('ra1', 'g')], [group('g')])
  assert.deepEqual(peopleAdmins(s), ['a'])
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'removeMember', groupId: 'g', personId: 'a' }), true)
})

check('an empty group carrying the role protects nobody', () => {
  const s = state([], [toGroup('ra1', 'g')], [group('g')])
  assert.deepEqual(peopleAdmins(s), [])
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'deleteGroup', groupId: 'g' }), false)
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'archiveGroup', groupId: 'g' }), false)
})

check('an archived group grants nothing, so it never counts as a path', () => {
  const s = state([person('a', 'active', ['g'])], [toGroup('ra1', 'g')], [group('g', true)])
  assert.deepEqual(peopleAdmins(s), [])
})

check('archiving the last active group path is refused', () => {
  const s = state([person('a', 'active', ['g'])], [toGroup('ra1', 'g')], [group('g')])
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'archiveGroup', groupId: 'g' }), true)
  assert.equal(guardReason(s, 'someone-else', { type: 'archiveGroup', groupId: 'g' }), 'This would leave no active tenant administrator')
})

check('archiving one of two group paths is allowed', () => {
  const s = state([person('a', 'active', ['g']), person('b', 'active', ['h'])], [toGroup('ra1', 'g'), toGroup('ra2', 'h')], [group('g'), group('h')])
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'archiveGroup', groupId: 'g' }), false)
})

check('overlapping grants to one person are still one person', () => {
  const s = state([person('a', 'active', ['g'])], [toGroup('ra1', 'g'), toUser('ra2', 'a')], [group('g')])
  assert.deepEqual(peopleAdmins(s), ['a'])
  // Either single path can go, because the other one keeps the same person administering.
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'removeAssignment', assignmentId: 'ra2' }), false)
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'archiveGroup', groupId: 'g' }), false)
  // Removing the person removes both paths at once.
  assert.equal(wouldRemoveLastTenantAdmin(s, { type: 'removePerson', personId: 'a' }), true)
})

check('self-protection is answered before the last-administrator rule', () => {
  const s = state([person('a', 'active', ['g']), person('b', 'active', ['g'])], [toGroup('ra1', 'g')], [group('g')])
  assert.equal(guardReason(s, 'a', { type: 'removePerson', personId: 'a' }), 'You cannot change your own access. Ask another administrator.')
})

/* Central Access. */

const holder = (id: string, status: Recipient['status'], groupIds: string[] = []): Recipient =>
  ({ id, type: 'user', name: id, detail: '', status, groupIds })

const team = (id: string, archived = false): Recipient => ({ id, type: 'group', name: id, detail: '', source: 'idp', archived })

/** The core module as Access reads it: the admin level names the Tenant administrator role. */
const CORE: AccessModule = {
  id: 'core',
  name: 'Core administration',
  description: '',
  enabled: true,
  isCore: true,
  recordType: null,
  levels: [{ id: 'admin', label: 'Administer', description: '', permissionKey: 'core:*', roleId: 'role_admin', roleName: 'Tenant administrator', recordScoped: false }],
}

/** The same role also appears in the list the secondary path picks from. */
const ROLES: AccessProps['customRoles'] = [
  { id: 'role_admin', name: 'Tenant administrator', description: '', kind: 'system', moduleId: 'core', tenantWideOnly: true },
  { id: 'role_legal', name: 'Legal reviewer', description: '', kind: 'custom', moduleId: null, tenantWideOnly: false },
]

const ADMIN_ROLE_IDS = tenantAdminRoleIds([CORE], ROLES)

/** Tenant administration recorded the ordinary way: the core module at the admin level. */
const coreAdmin = (id: string, recipientId: string, recipientType: Recipient['type']): Grant =>
  ({ id, recipientId, recipientType, moduleId: 'core', level: 'admin', roleId: 'role_admin', roleName: 'Tenant administrator', scopeType: null, scopeId: null, createdBy: 'Provisioning', createdAt: '2026-01-01T00:00:00Z' })

/** The same role recorded by "Assign a role directly", which stages it at `level: custom`. */
const pickedAdmin = (id: string, recipientId: string, recipientType: Recipient['type']): Grant =>
  ({ ...coreAdmin(id, recipientId, recipientType), level: 'custom' })

const revoke = (recipientId: string, grantId: string): PendingChange =>
  ({ kind: 'revoke', recipientId, moduleId: 'core', level: 'admin', scopeId: null, label: 'Tenant administrator', grantId })

/** A revoke of a directly picked role. It names the grant row, and its level is `custom`. */
const revokePicked = (recipientId: string, grantId: string): PendingChange =>
  ({ kind: 'revoke', recipientId, moduleId: 'core', level: 'custom', roleId: 'role_admin', scopeId: null, label: 'Tenant administrator', grantId })

check('Access counts people, not grant rows', () => {
  // Three core administration rows: an active person through a group, a pending person, and an
  // archived group. Only one person can administer the tenant today.
  const recipients = [team('g'), team('old', true), holder('a', 'active', ['g']), holder('p', 'pending'), holder('x', 'active', ['old'])]
  const grants = [coreAdmin('r1', 'g', 'group'), coreAdmin('r2', 'p', 'user'), coreAdmin('r3', 'old', 'group')]
  assert.deepEqual(accessAdmins(recipients, grants, ADMIN_ROLE_IDS), ['a'])
  const after = grants.filter((g) => g.id !== 'r1')
  assert.match(refusalFor(recipients, grants, after, [revoke('g', 'r1')], ADMIN_ROLE_IDS, 'nobody') ?? '', /^This would leave no active tenant administrator/)
})

check('Access allows a revoke that leaves another active person', () => {
  const recipients = [team('g'), team('h'), holder('a', 'active', ['g']), holder('b', 'active', ['h'])]
  const grants = [coreAdmin('r1', 'g', 'group'), coreAdmin('r2', 'h', 'group')]
  assert.equal(refusalFor(recipients, grants, grants.filter((g) => g.id !== 'r1'), [revoke('g', 'r1')], ADMIN_ROLE_IDS, 'nobody'), null)
})

check('Access refuses a revoke of the signed-in administrator', () => {
  const recipients = [holder('a', 'active'), holder('b', 'active')]
  const grants = [coreAdmin('r1', 'a', 'user'), coreAdmin('r2', 'b', 'user')]
  assert.equal(refusalFor(recipients, grants, grants.filter((g) => g.id !== 'r1'), [revoke('a', 'r1')], ADMIN_ROLE_IDS, 'a'), 'You cannot change your own access. Ask another administrator.')
})

check('Access reads the grants as they are at save time', () => {
  // The screen loaded while two people could administer the tenant. Somebody else removed one of
  // them since. The same batch is now refused, because the check runs against the current rows.
  const recipients = [team('g'), team('h'), holder('a', 'active', ['g']), holder('b', 'active', ['h'])]
  const atLoad = [coreAdmin('r1', 'g', 'group'), coreAdmin('r2', 'h', 'group')]
  const batch = [revoke('g', 'r1')]
  assert.equal(refusalFor(recipients, atLoad, atLoad.filter((g) => g.id !== 'r1'), batch, ADMIN_ROLE_IDS, 'nobody'), null)
  const atSave = atLoad.filter((g) => g.id !== 'r2')
  assert.match(refusalFor(recipients, atSave, atSave.filter((g) => g.id !== 'r1'), batch, ADMIN_ROLE_IDS, 'nobody') ?? '', /^This would leave no active tenant administrator/)
})

check('Access does not refuse when nobody could administer the tenant already', () => {
  const recipients = [team('g'), holder('p', 'pending', ['g'])]
  const grants = [coreAdmin('r1', 'g', 'group')]
  assert.equal(refusalFor(recipients, grants, [], [revoke('g', 'r1')], ADMIN_ROLE_IDS, 'nobody'), null)
})

/* The route the screen took must not change the answer. "Assign a role directly" records the same
   Tenant administrator role at `level: custom`, and a rule keyed on the level misses every one. */

check('the administrator role is resolved from the level and from the role list', () => {
  assert.deepEqual([...ADMIN_ROLE_IDS], ['role_admin'])
  assert.equal(tenantAdminRoleIds([CORE], []).has('role_admin'), true)
  assert.equal(tenantAdminRoleIds([], ROLES).has('role_admin'), true)
  assert.equal(tenantAdminRoleIds([CORE], ROLES).has('role_legal'), false)
})

check('a directly picked administrator role counts as a holder', () => {
  const recipients = [holder('a', 'active')]
  const grants = [pickedAdmin('r1', 'a', 'user')]
  assert.deepEqual(accessAdmins(recipients, grants, ADMIN_ROLE_IDS), ['a'])
})

check('removing the last administrator is refused when the role was picked directly', () => {
  const recipients = [holder('a', 'active')]
  const grants = [pickedAdmin('r1', 'a', 'user')]
  const refusal = refusalFor(recipients, grants, [], [revokePicked('a', 'r1')], ADMIN_ROLE_IDS, 'nobody')
  assert.match(refusal ?? '', /^This would leave no active tenant administrator/)
})

check('removing the last administrator is refused whichever route granted it', () => {
  // The same tenant, the same one active administrator, recorded each way in turn. Both refuse.
  for (const grant of [coreAdmin('r1', 'g', 'group'), pickedAdmin('r1', 'g', 'group')]) {
    const recipients = [team('g'), holder('a', 'active', ['g'])]
    const grants = [grant]
    const change = grant.level === 'custom' ? revokePicked('g', 'r1') : revoke('g', 'r1')
    assert.deepEqual(accessAdmins(recipients, grants, ADMIN_ROLE_IDS), ['a'], `holders for level ${grant.level}`)
    assert.match(refusalFor(recipients, grants, [], [change], ADMIN_ROLE_IDS, 'nobody') ?? '', /^This would leave no active tenant administrator/, `refusal for level ${grant.level}`)
  }
})

check('a directly picked role keeps the other route removable', () => {
  // One person holds the role twice: through the core level and through the picker. Ending the
  // level grant leaves the picked one, so it is allowed.
  const recipients = [holder('a', 'active')]
  const grants = [coreAdmin('r1', 'a', 'user'), pickedAdmin('r2', 'a', 'user')]
  assert.deepEqual(accessAdmins(recipients, grants, ADMIN_ROLE_IDS), ['a'])
  assert.equal(refusalFor(recipients, grants, grants.filter((g) => g.id !== 'r1'), [revoke('a', 'r1')], ADMIN_ROLE_IDS, 'nobody'), null)
})

check('self-protection reads the grant row, not the level the screen showed', () => {
  const recipients = [holder('a', 'active'), holder('b', 'active')]
  const grants = [pickedAdmin('r1', 'a', 'user'), coreAdmin('r2', 'b', 'user')]
  assert.equal(refusalFor(recipients, grants, grants.filter((g) => g.id !== 'r1'), [revokePicked('a', 'r1')], ADMIN_ROLE_IDS, 'a'), 'You cannot change your own access. Ask another administrator.')
})

console.log(`\n${checks} guard checks passed.`)
