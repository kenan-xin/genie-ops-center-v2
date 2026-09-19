import { useState } from 'react'
import { goTo } from '@/shell/components/routes'
import data from '@/../product/sections/access/data.json'
import type { AccessModule, AccessProps, AccessRecord, Grant, LevelId, PendingChange, Recipient, SaveResult } from '@/../product/sections/access/types'
import { readDemoNav, resetDemoNavIfRequested, useDemoNav } from '@/shell/demoState'
import { refusalFor, tenantAdminRoleIds } from './components/helpers'
import { GrantsScreen } from './components/GrantsScreen'
import { Tabs } from './components/ui'

resetDemoNavIfRequested()

const recipients = data.recipients as Recipient[]
const customRoles = data.customRoles as AccessProps['customRoles']

/**
 * Preview switches: `?recipient=<id>` picks the group or the person, the way a link from Modules,
 * People, Groups, Roles, or one solution does. `?module=<id>` and `?level=use|admin|audit` prefill
 * the advanced sheet, and `?dialog=advanced` opens it.
 *
 * `?admins=` shapes core administration, for the guard cases:
 * - `edge` adds two more grants, one to a pending person and one to an archived group, so the
 *   tenant holds three grant rows and still only two people who can administer it today.
 * - `picked` gives Leila the Tenant administrator role through "Assign a role directly" and takes
 *   the administrators group's grant away, so she is the only active holder and her row cannot be
 *   removed.
 * - `self` gives the signed-in administrator the same directly picked role, so her own row cannot
 *   be removed even though somebody else still holds it.
 *
 * A revoke of an Asset register assignment is kept in the shared preview record, so the
 * reintroduction review on Modules reads the shorter list when it is reopened. `?reset=1` puts the
 * sample tenant back.
 */
export default function AccessGrantsPreview() {
  const params = new URLSearchParams(window.location.search)
  const [nav, setNav] = useDemoNav()
  const admins = params.get('admins')
  const adminGrant = (id: string, recipientId: string, recipientType: Grant['recipientType'], level: Grant['level']): Grant =>
    ({ id, recipientId, recipientType, moduleId: 'core', level, roleId: 'role_admin', roleName: 'Tenant administrator', scopeType: null, scopeId: null, createdBy: 'Priya Nair', createdAt: '2026-09-01T00:00:00Z' })
  const extraAdmins: Grant[] =
    admins === 'edge' ? [adminGrant('ra_edge_pending', 'usr_daniel', 'user', 'admin'), adminGrant('ra_edge_archived', 'grp_old', 'group', 'admin')]
    : admins === 'picked' ? [adminGrant('ra_picked_leila', 'usr_leila', 'user', 'custom')]
    : admins === 'self' ? [adminGrant('ra_picked_priya', 'usr_priya', 'user', 'custom')]
    : []
  // `picked` takes the administrators group's grant away, so the directly picked one is the only
  // path left and its removal has to be refused.
  const [grants, setGrants] = useState<Grant[]>(() => {
    const revoked = new Set(readDemoNav().revokedGrants)
    const base = (data.grants as unknown as Grant[]).filter((g) => !(admins === 'picked' && g.id === 'ra_1'))
    return [...base, ...extraAdmins].filter((g) => !revoked.has(g.id))
  })
  const level = params.get('level')
  // `?off=solutions,contracts` previews a tenant whose module is switched off. Drop it to preview the
  // same tenant after an administrator switches the module on again.
  const off = (params.get('off') ?? '').split(',').filter(Boolean)
  // Enablement is read from the shared preview record, the way both screens read one `tenant_module`
  // row, so a module enabled on Modules stops reading as switched off here.
  const modules = (data.modules as unknown as AccessModule[]).map((m) => ({ ...m, enabled: off.includes(m.id) ? false : nav.enabled[m.id] ?? m.enabled }))

  /** The rows a save would leave behind. One function, so the refusal and the write cannot disagree. */
  const nextGrants = (list: Grant[], changes: PendingChange[]): Grant[] => {
    const kept = list.filter((g) => !changes.some((c) => c.kind === 'revoke' && c.grantId === g.id))
    const added: Grant[] = changes
      .filter((c) => c.kind === 'grant')
      .map((c, i) => {
        const mod = modules.find((m) => m.id === c.moduleId)
        const lvl = c.level === 'custom' ? undefined : mod?.levels.find((l) => l.id === c.level)
        const role = c.roleId ? customRoles.find((r) => r.id === c.roleId) : undefined
        const recipient = recipients.find((r) => r.id === c.recipientId)
        return {
          id: `ra_new_${Date.now()}_${i}`,
          recipientId: c.recipientId,
          recipientType: recipient?.type ?? 'group',
          moduleId: c.moduleId,
          level: c.level,
          roleId: role?.id ?? lvl?.roleId ?? '',
          roleName: role?.name ?? lvl?.roleName ?? '',
          scopeType: c.scopeType ?? (c.scopeId ? mod?.recordType?.type ?? null : null),
          scopeId: c.scopeId,
          createdBy: 'Priya Nair',
          createdAt: new Date().toISOString(),
        }
      })
    return [...kept, ...added]
  }

  /**
   * Stands in for the one server-side assignment procedure. It reads the grants as they are at save
   * time, not as they were when the screen loaded, applies the same last-active-administrator rule,
   * and answers a refusal instead of writing. The screen keeps the pending list on a refusal.
   */
  const save = (changes: PendingChange[]): SaveResult => {
    const after = nextGrants(grants, changes)
    const reason = refusalFor(recipients, grants, after, changes, tenantAdminRoleIds(modules, customRoles), data.currentUserId)
    if (reason) return { ok: false, reason }
    setGrants(after)
    // Kept across page loads, so the reintroduction review on Modules reads the same removal.
    const revoked = changes.flatMap((c) => (c.kind === 'revoke' && c.grantId ? [c.grantId] : []))
    if (revoked.length > 0) {
      const current = readDemoNav()
      setNav({ ...current, revokedGrants: [...new Set([...current.revokedGrants, ...revoked])] })
    }
    return { ok: true }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <Tabs
        tabs={[{ id: 'grants' as const, label: 'Grants' }, { id: 'overview' as const, label: 'Overview' }]}
        value="grants"
        onChange={(t) => t === 'overview' && goTo('/admin/access/overview')}
      />
      <GrantsScreen
        currentUserId={data.currentUserId}
        recipients={recipients}
        modules={modules}
        records={data.records as AccessRecord[]}
        grants={grants}
        customRoles={customRoles}
        initial={{
          recipientId: params.get('recipient') ?? undefined,
          moduleId: params.get('module') ?? undefined,
          level: level === 'use' || level === 'admin' || level === 'audit' ? (level as LevelId) : undefined,
          recordId: params.get('record') ?? undefined,
        }}
        initialDialog={params.get('dialog') === 'advanced' ? 'advanced' : undefined}
        onSave={save}
        onNavigate={goTo}
      />
    </div>
  )
}
