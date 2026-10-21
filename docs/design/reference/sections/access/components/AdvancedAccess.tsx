import { useState } from 'react'
import { Check, Info } from 'lucide-react'
import type { AccessProps, AccessRecord, AccessModule, Grant, LevelId, PendingChange, Recipient } from '@/../product/sections/access/types'
import { LAST_ADMIN_GUARD, SELF_GUARD, activeTenantAdmins, btnGhost, btnPrimary, btnSecondary, focusRing, tenantAdminRoleIds, useDelayed } from './helpers'
import { Card, CloseButton, Pill, Select, SlideOver, WarningNote } from './ui'
import { TransferList } from './TransferList'

export interface AdvancedAccessProps {
  open: boolean
  onClose: () => void
  recipient: Recipient | null
  /** Every recipient, because the last-active-administrator rule counts people across every group. */
  recipients: Recipient[]
  modules: AccessModule[]
  records: AccessRecord[]
  grants: Grant[]
  customRoles: AccessProps['customRoles']
  currentUserId?: string
  onSave?: AccessProps['onSave']
  initial?: { moduleId?: string; level?: LevelId }
}

/**
 * Everything the everyday flow leaves out: administration levels, core administration, the audit
 * role, one record of a module that owns records, and a custom role at a scope. It writes through
 * the same procedure as the catalogue, so there is one writer and one permission model (`DEC-39`).
 */
export function AdvancedAccess(p: AdvancedAccessProps) {
  const [moduleId, setModuleId] = useState<string | null>(p.initial?.moduleId ?? null)
  const [levelId, setLevelId] = useState<LevelId | null>(p.initial?.level ?? null)
  const [directRole, setDirectRole] = useState<{ roleId: string; scopeId: string } | null>(null)
  // A role picked directly joins the same pending list as the levels above, so one Save writes both
  // through one procedure. Nothing here writes on its own.
  const [staged, setStaged] = useState<PendingChange[]>([])
  const stagedGrants = staged.filter((c) => c.kind === 'grant')
  const [refusal, setRefusal] = useState<string | null>(null)

  const mod = p.modules.find((m) => m.id === moduleId) ?? null
  const level = mod?.levels.find((l) => l.id === levelId) ?? null
  const records = mod?.recordType ? p.records.filter((r) => r.moduleId === mod.id) : []
  const recipient = p.recipient

  const saved = p.grants.filter((g) => g.recipientId === recipient?.id && g.moduleId === moduleId && g.level === levelId)
  const savedRecordIds = saved.map((g) => g.scopeId).filter((x): x is string => Boolean(x))
  const savedAll = saved.some((g) => !g.scopeId)

  const key = `${recipient?.id}|${moduleId}|${levelId}`
  const [work, setWork] = useState<{ key: string; records: string[]; all: boolean }>({ key, records: savedRecordIds, all: savedAll })
  if (work.key !== key) {
    setWork({ key, records: savedRecordIds, all: savedAll })
    setStaged([])
    setRefusal(null)
  }

  const added = work.records.filter((id) => !savedRecordIds.includes(id))
  const removed = savedRecordIds.filter((id) => !work.records.includes(id))
  const allChanged = work.all !== savedAll
  const pendingCount = added.length + removed.length + (allChanged ? 1 : 0) + staged.length

  // A switched-off module keeps its grants and takes no new one here either.
  const blocked = mod && !mod.enabled ? `The ${mod.name} module is switched off. Existing grants are kept and can be removed, and no new grant can be added until it is switched on.` : null
  // The same rule the server holds (Spec 2 R-38): count the active people who would still hold the
  // Tenant administrator role, not the grant rows, and count by role rather than by the level this
  // screen shows, so a role picked directly counts too. A pending person, a disabled person, and an
  // archived group carry nobody.
  const adminRoleIds = tenantAdminRoleIds(p.modules, p.customRoles)
  const revokeGuard = (): string | null => {
    if (!(mod?.id === 'core' && level?.id === 'admin')) return null
    if (recipient?.type === 'user' && recipient.id === p.currentUserId) return SELF_GUARD
    if (!recipient) return null
    // This control ends the level grant only. A role this recipient holds another way stays.
    const after = p.grants.filter((g) => !(g.moduleId === 'core' && g.level === 'admin' && g.recipientId === recipient.id))
    if (activeTenantAdmins(p.recipients, p.grants, adminRoleIds).length === 0) return null
    return activeTenantAdmins(p.recipients, after, adminRoleIds).length === 0 ? LAST_ADMIN_GUARD : null
  }

  const changes = (): PendingChange[] => {
    // A role picked directly needs no module or level, so it is saved whether or not one is chosen.
    if (!recipient || !mod || !level) return staged
    const label = (id: string) => p.records.find((r) => r.id === id)?.label ?? id
    const list: PendingChange[] = [
      ...added.map((id) => ({ kind: 'grant' as const, recipientId: recipient.id, moduleId: mod.id, level: level.id, scopeId: id, label: label(id) })),
      ...removed.map((id) => ({ kind: 'revoke' as const, recipientId: recipient.id, moduleId: mod.id, level: level.id, scopeId: id, label: label(id), grantId: saved.find((g) => g.scopeId === id)?.id })),
    ]
    if (allChanged) {
      const wide = mod.recordType ? `Every ${mod.recordType.label}, including later ones` : `${mod.name}, the whole module`
      list.push(work.all
        ? { kind: 'grant', recipientId: recipient.id, moduleId: mod.id, level: level.id, scopeId: null, label: wide }
        : { kind: 'revoke', recipientId: recipient.id, moduleId: mod.id, level: level.id, scopeId: null, label: wide, grantId: saved.find((g) => !g.scopeId)?.id })
    }
    return [...list, ...staged]
  }

  const [saving, save] = useDelayed(() => {
    // The server decides. A refusal keeps the sheet and the pending list, so a rule the screen could
    // not see, for example another administrator removed since this sheet opened, loses no work.
    const result = p.onSave?.(changes()) ?? { ok: false as const, reason: 'This preview has no save procedure connected, so nothing was written.' }
    if (!result.ok) return setRefusal(result.reason)
    setRefusal(null)
    setStaged([])
    p.onClose()
  })

  const choice = (on: boolean, disabled?: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium motion-safe:transition-colors ${focusRing} ${disabled ? 'cursor-not-allowed border-gray-200 text-gray-500 dark:border-gray-800' : on ? 'border-blue-600 bg-gray-100 text-gray-900 dark:border-blue-400 dark:bg-gray-800 dark:text-gray-100' : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`

  /* Everything else this recipient holds. A role picked directly carries no level, and an assignment
     kept from an earlier deployment can name a level the module has since retired or a module that
     is no longer compiled. None of those can be reached by the level controls above, so they are
     listed here instead: every retained assignment stays open to inspection and removal, whatever
     recorded it. A staged removal is a `PendingChange` like any other, so it writes nothing until
     Save and Undo takes it off the list. */

  const revokedIds = new Set(staged.flatMap((c) => (c.kind === 'revoke' && c.grantId ? [c.grantId] : [])))

  /** True when the level controls above can already edit this grant. */
  const editableByLevel = (g: Grant) => {
    if (g.level === 'custom') return false
    const m = p.modules.find((x) => x.id === g.moduleId)
    return Boolean(m?.levels.some((l) => l.id === g.level && l.roleId))
  }

  /**
   * Why the levels above cannot show this grant, or null. It states what the deployment no longer
   * declares and stops there. It never says what a retired or unknown key still grants: that is the
   * server's answer under the permission evolution policy, not this screen's to guess.
   */
  const outsideReason = (g: Grant): string | null => {
    if (g.level === 'custom') return null
    const m = p.modules.find((x) => x.id === g.moduleId)
    if (!m) return 'This module is not in this deployment.'
    const l = m.levels.find((x) => x.id === g.level)
    if (!l) return 'The module no longer offers this access level.'
    if (!l.roleId) return 'The module no longer declares a role for this access level.'
    return null
  }

  const directGrants = recipient ? p.grants.filter((g) => g.recipientId === recipient.id && !editableByLevel(g)) : []
  const scopeOf = (g: Grant) => (g.scopeId ? p.records.find((r) => r.id === g.scopeId)?.label ?? g.scopeId : 'Whole tenant')
  const moduleOf = (g: Grant) => p.modules.find((m) => m.id === g.moduleId)

  /**
   * Why one of those removals is refused, or null. Same order as everywhere else: a role that is not
   * Tenant administrator is never protected, then self-protection, then the last active holder. A
   * switched-off module is not a reason: a kept grant must always be removable.
   */
  const removalGuard = (g: Grant): string | null => {
    if (!adminRoleIds.has(g.roleId)) return null
    if (g.recipientType === 'user' && g.recipientId === p.currentUserId) return SELF_GUARD
    const after = p.grants.filter((x) => x.id !== g.id && !revokedIds.has(x.id))
    if (activeTenantAdmins(p.recipients, p.grants, adminRoleIds).length === 0) return null
    return activeTenantAdmins(p.recipients, after, adminRoleIds).length === 0 ? `${LAST_ADMIN_GUARD}. Give the role to somebody else first.` : null
  }

  const stageRemoval = (g: Grant) => {
    setRefusal(null)
    setStaged((l) => [...l, {
      kind: 'revoke',
      recipientId: g.recipientId,
      moduleId: g.moduleId,
      level: 'custom',
      roleId: g.roleId,
      scopeType: g.scopeType,
      scopeId: g.scopeId,
      label: `${g.roleName}${g.scopeId ? ` on ${scopeOf(g)}` : ', whole tenant'}`,
      grantId: g.id,
    }])
  }

  const role = p.customRoles.find((r) => r.id === directRole?.roleId)
  const roleRecords = role?.moduleId ? p.records.filter((r) => r.moduleId === role.moduleId) : p.records
  const roleModule = role?.moduleId ? p.modules.find((m) => m.id === role.moduleId) : null
  const roleBlocked = roleModule && !roleModule.enabled ? `The ${roleModule.name} module is switched off, so this role cannot be assigned now.` : null

  return (
    <SlideOver open={p.open} onClose={p.onClose} title="Advanced access">
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight">Advanced access</h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{recipient ? <>Administration levels, one record at a time, and custom roles for <span className="font-semibold text-gray-800 dark:text-gray-200">{recipient.name}</span>.</> : 'Pick a recipient on the Grants screen first.'}</p>
        </div>
        <CloseButton onClick={p.onClose} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {recipient ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Module</h3>
              <div className="flex flex-wrap gap-2">
                {p.modules.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={moduleId === m.id} onClick={() => { setModuleId(m.id); setLevelId(null) }} className={choice(moduleId === m.id)}>
                    {moduleId === m.id ? <Check className="size-5" strokeWidth={2.5} aria-hidden /> : null}
                    {m.name}
                    {!m.enabled ? <Pill tone="amber">Off</Pill> : null}
                  </button>
                ))}
              </div>
            </div>

            {mod ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Access level</h3>
                <div className="flex flex-wrap gap-2">
                  {mod.levels.map((l) => (
                    <button key={l.id} type="button" role="radio" aria-checked={levelId === l.id} disabled={!l.roleId} title={l.roleId ? undefined : l.missingRoleNote} onClick={() => setLevelId(l.id)} className={choice(levelId === l.id, !l.roleId)}>
                      {levelId === l.id ? <Check className="size-5" strokeWidth={2.5} aria-hidden /> : null}
                      {l.label}
                    </button>
                  ))}
                </div>
                {level ? <p className="text-xs text-gray-600 dark:text-gray-400">{level.description} Granted through the <span className="font-semibold text-gray-800 dark:text-gray-200">{level.roleName}</span> role.</p> : null}
                {blocked ? (
                  <WarningNote role="status">{blocked}</WarningNote>
                ) : null}
                {mod.levels.filter((l) => !l.roleId).map((l) => (
                  <WarningNote key={l.id}>{l.missingRoleNote}</WarningNote>
                ))}
              </div>
            ) : null}

            {mod && level ? (
              level.recordScoped && mod.recordType ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Which {mod.recordType.pluralLabel}</h3>
                  <div role="radiogroup" aria-label={`Which ${mod.recordType.pluralLabel}`} className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" role="radio" aria-checked={!work.all} onClick={() => setWork({ ...work, all: false })} className={choice(!work.all)}>
                      {!work.all ? <Check className="size-5" strokeWidth={2.5} aria-hidden /> : null}Chosen {mod.recordType.pluralLabel}
                    </button>
                    <button type="button" role="radio" aria-checked={work.all} disabled={Boolean(blocked) && !savedAll} title={blocked ?? undefined} onClick={() => setWork({ ...work, all: true })} className={choice(work.all, Boolean(blocked) && !savedAll)}>
                      {work.all ? <Check className="size-5" strokeWidth={2.5} aria-hidden /> : null}Every {mod.recordType.label}, including later ones
                    </button>
                  </div>
                  {work.all ? (
                    <p className="flex items-start gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:bg-gray-950/60 dark:text-gray-300">
                      <Info className="mt-px size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
                      One grant covers every {mod.recordType.label} this tenant has now and every one added later.
                    </p>
                  ) : (
                    <TransferList
                      items={records.map((r) => ({ id: r.id, label: r.label, description: r.detail, blockedReason: blocked ?? undefined, inactiveReason: blocked ?? undefined }))}
                      value={work.records}
                      onChange={(ids) => setWork({ ...work, records: ids })}
                      pendingIds={[...added, ...removed]}
                      availableLabel="Catalog"
                      targetLabel="Granted"
                      emptyAvailable={`Every ${mod.recordType.label} is granted already.`}
                      emptyTarget={`No ${mod.recordType.label} granted yet.`}
                    />
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{mod.name}</h3>
                  <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2 text-sm ${work.all ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40' : 'border-gray-300 dark:border-gray-700'} ${work.all && revokeGuard() ? 'cursor-not-allowed opacity-60' : ''}`} title={work.all ? revokeGuard() ?? undefined : undefined}>
                    <input type="checkbox" checked={work.all} disabled={Boolean(work.all && revokeGuard()) || Boolean(blocked && !work.all)} onChange={(e) => setWork({ ...work, all: e.target.checked })} className={`size-4 accent-blue-600 ${focusRing}`} />
                    <span className="flex-1">
                      <span className="block font-medium">{mod.isCore ? level.roleName : `${level.label} ${mod.name}`}, for the whole tenant</span>
                      <span className="block text-xs text-gray-600 dark:text-gray-400">{mod.isCore ? 'Core administration has no records, so this role always applies to the whole tenant.' : 'An administration grant is never limited to one record.'}</span>
                    </span>
                    {allChanged ? <Pill>Pending</Pill> : null}
                  </label>
                  {work.all && revokeGuard() ? <p className="text-xs text-gray-700 dark:text-gray-300">{revokeGuard()}. Give the role to somebody else first.</p> : null}
                </div>
              )
            ) : null}

            <Card className="p-4">
              <h3 className="text-sm font-semibold">Roles the levels above do not cover</h3>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">A role picked directly, and anything this recipient still holds that the levels cannot show: a level the module has retired, or a module that is no longer here. Every change joins the pending list and one Save writes them all through the same procedure.</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {directGrants.map((g) => {
                  const leaving = revokedIds.has(g.id)
                  const why = leaving ? null : removalGuard(g)
                  return (
                    <li key={g.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-medium ${leaving ? 'text-gray-500 line-through decoration-gray-400' : ''}`}>{g.roleName}</span>
                        <span className="block truncate text-xs text-gray-600 dark:text-gray-400">{moduleOf(g)?.name ?? g.moduleId} · {scopeOf(g)}{outsideReason(g) ? ` · ${outsideReason(g)}` : ''}{why ? ` · ${why}` : ''}</span>
                      </span>
                      {leaving ? <Pill>Pending removal</Pill> : null}
                      {leaving ? (
                        <button type="button" className={btnGhost} onClick={() => setStaged((l) => l.filter((c) => c.grantId !== g.id))}>Undo</button>
                      ) : (
                        <button type="button" className={`${btnGhost} text-red-700 dark:text-red-300`} disabled={Boolean(why)} title={why ?? undefined} onClick={() => stageRemoval(g)}>Remove</button>
                      )}
                    </li>
                  )
                })}
                {stagedGrants.map((c, i) => (
                  <li key={`new-${c.roleId}-${c.scopeId ?? 'all'}-${i}`} className="flex min-h-11 items-center gap-2 rounded-lg border border-blue-600 px-3 py-2 text-sm dark:border-blue-400">
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    <Pill>Pending</Pill>
                    <button type="button" className={btnGhost} onClick={() => setStaged((l) => l.filter((x) => x !== c))}>Remove</button>
                  </li>
                ))}
                {directGrants.length === 0 && stagedGrants.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400">{recipient.name} holds nothing the levels above cannot show.</li>
                ) : null}
              </ul>
              {directRole ? (
                <div className="mt-3 flex flex-col gap-3">
                  <Select ariaLabel="Role" value={directRole.roleId} onChange={(v) => setDirectRole({ roleId: v, scopeId: '' })}>
                    {p.customRoles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.kind === 'system' ? ' (system)' : ''}</option>)}
                  </Select>
                  {role ? <p className="text-xs text-gray-600 dark:text-gray-400">{role.description}</p> : null}
                  {roleBlocked ? <WarningNote>{roleBlocked}</WarningNote> : null}
                  {role?.tenantWideOnly ? (
                    <p className="text-xs text-gray-600 dark:text-gray-400">{role.name} carries core permissions or an admin key, so it applies to the whole tenant.</p>
                  ) : (
                    <Select ariaLabel="Scope" value={directRole.scopeId} onChange={(v) => setDirectRole({ ...directRole, scopeId: v })}>
                      <option value="">Whole tenant, including later records</option>
                      {roleRecords.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </Select>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={Boolean(roleBlocked)}
                      title={roleBlocked ?? undefined}
                      onClick={() => {
                        const scope = p.records.find((r) => r.id === directRole.scopeId) ?? null
                        setStaged((l) => [...l, {
                          kind: 'grant',
                          recipientId: recipient.id,
                          moduleId: role?.moduleId ?? 'core',
                          level: 'custom',
                          roleId: directRole.roleId,
                          scopeType: scope?.type ?? null,
                          scopeId: directRole.scopeId || null,
                          label: `${role?.name ?? 'Role'}${scope ? ` on ${scope.label}` : ', whole tenant'}`,
                        }])
                        setDirectRole(null)
                        setRefusal(null)
                      }}
                    >
                      Add to changes
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => setDirectRole(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" className={`${btnSecondary} mt-3`} onClick={() => setDirectRole({ roleId: p.customRoles[0]?.id ?? '', scopeId: '' })}>Pick a role</button>
              )}
            </Card>
          </div>
        ) : null}
      </div>

      <footer className="flex shrink-0 flex-col gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
        {refusal ? <WarningNote role="alert">{refusal} Your changes are still here.</WarningNote> : null}
        <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-600 dark:text-gray-400" role="status">{pendingCount === 0 ? 'Nothing to save yet.' : pendingCount === 1 ? 'One change not saved' : `${pendingCount} changes not saved`}</p>
        <span className="flex gap-2">
          <button type="button" className={btnSecondary} onClick={p.onClose}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={pendingCount === 0} aria-busy={saving || undefined} onClick={save}>Save changes</button>
        </span>
        </div>
      </footer>
    </SlideOver>
  )
}
