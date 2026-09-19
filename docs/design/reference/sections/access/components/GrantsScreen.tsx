import { useEffect, useRef, useState } from 'react'
import { Building2, ChevronDown, Info, Search, Settings2, UserRound, UsersRound } from 'lucide-react'
import type { AccessProps, BroaderGrant, CatalogItem, LevelId, PendingChange, Recipient } from '@/../product/sections/access/types'
import { btnGhost, btnPrimary, btnSecondary, focusRing, linkClass, useDelayed } from './helpers'
import { Avatar, BottomBar, Card, ConfirmDialog, HelpNote, Pill, Select, Toast } from './ui'
import { TransferList } from './TransferList'
import { AdvancedAccess } from './AdvancedAccess'

export interface GrantsScreenProps extends AccessProps {
  /** Prefill from a link, for example from Modules, a group, or one solution. */
  initial?: { recipientId?: string; moduleId?: string; level?: LevelId; recordId?: string }
  /** Design-only: open the advanced sheet on load. */
  initialDialog?: 'advanced'
}

/**
 * The everyday flow, copied from the v1 admin portal: pick a group, move rows between Catalog and
 * Granted, save. Every catalogue row means "can use" and writes one assignment of a predefined role
 * (`DEC-39`). Administration levels, one record of a module that owns records, and custom roles sit
 * behind Advanced access, so they never stand between an administrator and an ordinary grant.
 */
export function GrantsScreen(p: GrantsScreenProps) {
  const [recipientId, setRecipientId] = useState<string | null>(p.initial?.recipientId ?? null)
  const [kind, setKind] = useState<'group' | 'user'>(p.recipients.find((r) => r.id === p.initial?.recipientId)?.type ?? 'group')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'solution' | 'module'>('all')
  const [advanced, setAdvanced] = useState(p.initialDialog === 'advanced')
  const [discard, setDiscard] = useState<{ run: () => void } | null>(null)
  const [confirmSave, setConfirmSave] = useState(false)
  // Null means "follow the recipient": the card opens only when this recipient already holds one of
  // these grants. A press pins it either way until the recipient changes.
  const [broadOpen, setBroadOpen] = useState<boolean | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const picker = useRef<HTMLDivElement>(null)

  const recipient = p.recipients.find((r) => r.id === recipientId) ?? null
  const moduleById = (id: string) => p.modules.find((m) => m.id === id)
  const solutionModule = p.modules.find((m) => m.recordType?.type === 'solution') ?? null

  // The catalogue: one row per solution, plus one row per other module whose use grant needs no
  // record, because that module owns none. Both rows mean the same thing, "can use". A switched-off
  // module keeps its grants and takes no new one, on every path, bulk actions included.
  const blockOf = (moduleName: string) => `The ${moduleName} module is switched off. Existing grants are kept, and no new grant can be added until it is switched on.`
  const catalog: CatalogItem[] = [
    ...(solutionModule
      ? p.records
          .filter((r) => r.moduleId === solutionModule.id)
          .map((r) => ({ id: r.id, kind: 'solution' as const, moduleId: r.moduleId, label: r.label, detail: r.detail, inactive: !solutionModule.enabled, blockedReason: solutionModule.enabled ? null : blockOf(solutionModule.name) }))
      : []),
    ...p.modules
      .filter((m) => !m.isCore && !m.recordType && m.levels.some((l) => l.id === 'use' && l.roleId))
      .map((m) => ({ id: `m:${m.id}`, kind: 'module' as const, moduleId: m.id, label: m.name, detail: m.description, inactive: !m.enabled, blockedReason: m.enabled ? null : blockOf(m.name) })),
  ]

  // Broader access is never a catalogue row, because it also covers records that do not exist yet.
  const broader: BroaderGrant[] = p.modules
    .filter((m) => m.recordType && m.levels.some((l) => l.id === 'use' && l.roleId))
    .map((m) => ({
      id: `all:${m.id}`,
      moduleId: m.id,
      label: `Every ${m.recordType!.label}, now and in the future`,
      consequence: m.enabled
        ? `Covers all ${p.records.filter((r) => r.moduleId === m.id).length} ${m.recordType!.pluralLabel} today and every one added later. Pick rows above instead when you can name them.`
        : `Inactive: the ${m.name} module is switched off. An existing grant is kept and can be removed, and no new one can be added.`,
      inactive: !m.enabled,
      blockedReason: m.enabled ? null : blockOf(m.name),
    }))

  const useGrants = p.grants.filter((g) => g.recipientId === recipientId && g.level === 'use')
  const savedCatalog = useGrants
    .map((g) => (g.scopeId ? g.scopeId : moduleById(g.moduleId)?.recordType ? null : `m:${g.moduleId}`))
    .filter((id): id is string => Boolean(id) && catalog.some((c) => c.id === id))
  const savedBroader = useGrants.filter((g) => !g.scopeId && moduleById(g.moduleId)?.recordType).map((g) => `all:${g.moduleId}`)
  // Anything this screen cannot show: an administration level, or one record of a module that owns
  // records. It is named, never hidden, and Advanced access edits it.
  const otherGrants = p.grants.filter((g) => g.recipientId === recipientId && !savedCatalog.includes(g.scopeId ?? `m:${g.moduleId}`) && !savedBroader.includes(`all:${g.moduleId}`))

  // Access this screen does not write, but which the recipient reaches anyway. For a person that is
  // every grant carried by their groups. A row on the catalog side is therefore not "no access": the
  // row names the group it already arrives through, and removing a direct grant leaves that path.
  const viaElsewhere = new Map<string, string[]>()
  if (recipient?.type === 'user') {
    const groupIds = recipient.groupIds ?? []
    p.grants
      .filter((g) => g.level === 'use' && g.recipientType === 'group' && groupIds.includes(g.recipientId))
      .forEach((g) => {
        const name = p.recipients.find((r) => r.id === g.recipientId)?.name ?? g.recipientId
        const mod = moduleById(g.moduleId)
        const targets = g.scopeId ? [g.scopeId] : mod?.recordType ? p.records.filter((r) => r.moduleId === g.moduleId).map((r) => r.id) : [`m:${g.moduleId}`]
        targets.forEach((t) => viaElsewhere.set(t, [...(viaElsewhere.get(t) ?? []), name]))
      })
  }

  const key = recipientId ?? 'none'
  const [work, setWork] = useState<{ key: string; granted: string[]; broad: string[] }>({ key, granted: savedCatalog, broad: savedBroader })
  if (work.key !== key) {
    setWork({ key, granted: savedCatalog, broad: savedBroader })
    setBroadOpen(null)
  }

  const added = work.granted.filter((id) => !savedCatalog.includes(id))
  const removed = savedCatalog.filter((id) => !work.granted.includes(id))
  const broadAdded = work.broad.filter((id) => !savedBroader.includes(id))
  const broadRemoved = savedBroader.filter((id) => !work.broad.includes(id))
  const pendingIds = [...added, ...removed]
  const pendingCount = pendingIds.length + broadAdded.length + broadRemoved.length

  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => { if (!picker.current?.contains(e.target as Node)) setPickerOpen(false) }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPickerOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [pickerOpen])

  const guarded = (run: () => void) => (pendingCount > 0 ? setDiscard({ run }) : run())
  const reset = () => setWork({ key, granted: savedCatalog, broad: savedBroader })

  const changes = (): PendingChange[] => {
    if (!recipient) return []
    const list: PendingChange[] = []
    const rowOf = (id: string) => catalog.find((c) => c.id === id)
    added.forEach((id) => {
      const row = rowOf(id)
      if (row) list.push({ kind: 'grant', recipientId: recipient.id, moduleId: row.moduleId, level: 'use', scopeId: row.kind === 'solution' ? row.id : null, label: row.label })
    })
    removed.forEach((id) => {
      const row = rowOf(id)
      const grant = useGrants.find((g) => (g.scopeId ?? `m:${g.moduleId}`) === id)
      if (row) list.push({ kind: 'revoke', recipientId: recipient.id, moduleId: row.moduleId, level: 'use', scopeId: row.kind === 'solution' ? row.id : null, label: row.label, grantId: grant?.id })
    })
    broadAdded.forEach((id) => {
      const b = broader.find((x) => x.id === id)
      if (b) list.push({ kind: 'grant', recipientId: recipient.id, moduleId: b.moduleId, level: 'use', scopeId: null, label: b.label })
    })
    broadRemoved.forEach((id) => {
      const b = broader.find((x) => x.id === id)
      const grant = useGrants.find((g) => !g.scopeId && g.moduleId === b?.moduleId)
      if (b) list.push({ kind: 'revoke', recipientId: recipient.id, moduleId: b.moduleId, level: 'use', scopeId: null, label: b.label, grantId: grant?.id })
    })
    return list
  }

  // What a removal leaves behind. A removal here ends one assignment, never the access that arrives
  // through another group or through the broader grant, so the pending bar and the confirmation say
  // which paths stay.
  const remaining: string[] = []
  removed.forEach((id) => {
    const row = catalog.find((c) => c.id === id)
    if (!row) return
    const sources = [...(viaElsewhere.get(id) ?? [])]
    const label = moduleById(row.moduleId)?.recordType?.label
    if (work.broad.includes(`all:${row.moduleId}`) && label) sources.push(`the "Every ${label}, now and in the future" grant`)
    if (sources.length > 0) remaining.push(`${row.label} stays reachable through ${sources.join(' and ')}.`)
  })
  broadRemoved.forEach((id) => {
    const b = broader.find((x) => x.id === id)
    if (!b) return
    const named = work.granted.filter((gid) => catalog.find((c) => c.id === gid)?.moduleId === b.moduleId).length
    if (named > 0) remaining.push(`${named === 1 ? 'One row' : `${named} rows`} of ${moduleById(b.moduleId)?.name} stays granted one by one.`)
  })

  const [saving, save] = useDelayed(() => {
    p.onSave?.(changes())
    setToast(`Saved. ${pendingCount === 1 ? 'One change' : `${pendingCount} changes`} written to the audit log.`)
  })
  // A removal that leaves another path open is confirmed first, so the result never reads as a full revoke.
  const trySave = () => (remaining.length > 0 ? setConfirmSave(true) : save())

  const options = p.recipients.filter((r) => {
    const s = q.trim().toLowerCase()
    return r.type === kind && (!s || r.name.toLowerCase().includes(s) || r.detail.toLowerCase().includes(s))
  })

  const icon = (r: Recipient) =>
    r.type === 'user' ? <Avatar name={r.name} size="sm" /> : (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
        {r.source === 'idp' ? <Building2 className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden /> : <UsersRound className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden />}
      </span>
    )

  /** The chosen recipient sits on one line, so the control keeps the md height of every other control. */
  const markIcon = (r: Recipient) => {
    const cls = 'size-4 shrink-0 text-gray-500'
    if (r.type === 'user') return <UserRound className={cls} strokeWidth={1.75} aria-hidden />
    return r.source === 'idp' ? <Building2 className={cls} strokeWidth={1.75} aria-hidden /> : <UsersRound className={cls} strokeWidth={1.75} aria-hidden />
  }
  const shortDetail = (r: Recipient) => (r.type === 'user' ? r.detail : r.detail.split('·').pop()?.trim() ?? r.detail)

  const seg = (k: 'group' | 'user', label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={kind === k}
      onClick={() => kind !== k && guarded(() => { setKind(k); setRecipientId(null); setQ('') })}
      className={`h-8 rounded-lg px-3.5 text-sm font-medium motion-safe:transition-colors ${focusRing} ${kind === k ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-950 dark:text-gray-100' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}
    >
      {label}
    </button>
  )

  const shown = catalog.filter((c) => filter === 'all' || c.kind === filter)
  const everySolutionOn = solutionModule ? work.broad.includes(`all:${solutionModule.id}`) : false
  const broadHeld = work.broad.length
  const broadPanelOpen = broadOpen ?? savedBroader.length > 0

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id="grant-to" className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Grant to</span>
        <div role="radiogroup" aria-labelledby="grant-to" className="inline-flex h-10 shrink-0 items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800">{seg('group', 'Groups')}{seg('user', 'People')}</div>

        <div ref={picker} className="relative w-full sm:w-80">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((v) => !v)}
            className={`flex h-10 w-full items-center gap-2 rounded-lg border border-gray-500 bg-white px-3 text-left text-sm dark:border-gray-500 dark:bg-gray-950 ${focusRing}`}
          >
            {recipient ? markIcon(recipient) : <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />}
            <span className="min-w-0 flex-1 truncate">
              {recipient ? (
                <>
                  <span className="font-semibold">{recipient.name}</span>
                  <span className="text-gray-600 dark:text-gray-400"> · {shortDetail(recipient)}</span>
                </>
              ) : (
                <span className="text-gray-500">{kind === 'group' ? 'Choose a group' : 'Choose a person'}</span>
              )}
            </span>
            <ChevronDown className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
          </button>
          {pickerOpen ? (
            <div className="absolute left-0 top-full z-20 mt-1 w-[22rem] max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <label className="flex h-10 items-center gap-2 border-b border-gray-100 px-2 text-sm dark:border-gray-800">
                <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label={kind === 'group' ? 'Search groups' : 'Search people'} placeholder={kind === 'group' ? 'Search groups' : 'Search people'} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500" />
              </label>
              <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
                {options.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={r.id === recipientId}
                      onClick={() => guarded(() => { setRecipientId(r.id); setPickerOpen(false); setQ('') })}
                      className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${focusRing}`}
                    >
                      {icon(r)}
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.name}</span><span className="block truncate text-xs text-gray-600 dark:text-gray-400">{r.detail}</span></span>
                      {r.archived ? <Pill tone="amber">Archived</Pill> : null}
                    </button>
                  </li>
                ))}
                {options.length === 0 ? <li className="px-3 py-6 text-center text-sm text-gray-600 dark:text-gray-400">No match.</li> : null}
              </ul>
            </div>
          ) : null}
        </div>

        <button type="button" className={`${btnGhost} ml-auto text-gray-600`} onClick={() => setAdvanced(true)}>
          <Settings2 className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Advanced access
        </button>
      </div>

      {!recipient ? (
        <Card>
          <div className="flex flex-col items-start gap-2 px-5 py-10 sm:px-6">
            <h3 className="text-base font-bold tracking-tight">{kind === 'group' ? 'Choose a group to start' : 'Choose a person to start'}</h3>
            <p className="max-w-prose text-sm text-gray-600 dark:text-gray-400">
              Every grant goes to one group or one person. {kind === 'group' ? 'A group is the normal path, because the identity provider already keeps it current.' : 'A person is the exception. Prefer a group when several people need the same access.'} Nothing on this page applies until you choose one.
            </p>
            <button type="button" className={`${btnSecondary} mt-2`} onClick={() => setPickerOpen(true)}>{kind === 'group' ? 'Choose a group' : 'Choose a person'}</button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1">
                    <h3 className="text-base font-bold tracking-tight">Access assignments</h3>
                    <HelpNote label="How access works" iconOnly>
                      <p>Roles define what somebody can do. People receive access through roles assigned to them directly and through their groups. These grants combine within the scope each one carries.</p>
                      <p>Removing one grant does not remove access that another role or another group provides. A disabled account and a switched-off module still block access.</p>
                      <p className="text-gray-600 dark:text-gray-400">For example, Amara Osei reaches Claims Triage Assistant through the Claims Review group and through a direct assignment. Removing the direct one leaves the group path.</p>
                    </HelpNote>
                  </span>
                  <p className="mt-0.5 max-w-prose text-xs text-gray-600 dark:text-gray-400">For {recipient.name}. Move rows, then save. Granted means an assignment exists, not that the resource works today: it applies when its module is on and its own status allows it.</p>
                </div>
                <Select ariaLabel="Show" value={filter} onChange={(v) => setFilter(v as typeof filter)} className="w-44">
                  <option value="all">All items</option>
                  <option value="solution">Solutions only</option>
                  <option value="module">Modules only</option>
                </Select>
              </div>
              {everySolutionOn ? (
                <p className="flex items-start gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:bg-gray-950/60 dark:text-gray-300">
                  <Info className="mt-px size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
                  Every solution is granted below, so the solution rows here add nothing while that applies.
                </p>
              ) : null}
              <TransferList
                items={shown.map((c) => ({
                  id: c.id,
                  label: c.label,
                  description: c.inactive ? `${c.detail} · Inactive, the ${moduleById(c.moduleId)?.name} module is off` : c.detail,
                  badge: c.kind === 'solution' ? 'Solution' : 'Module',
                  note: viaElsewhere.has(c.id) ? `Also through ${viaElsewhere.get(c.id)!.join(' and ')}` : undefined,
                  inactiveReason: c.inactive ? c.blockedReason ?? undefined : undefined,
                  blockedReason: c.blockedReason ?? undefined,
                }))}
                value={work.granted}
                onChange={(ids) => setWork({ ...work, granted: ids })}
                pendingIds={pendingIds}
                availableLabel="Catalog"
                targetLabel="Granted"
                emptyAvailable="Everything here is granted already."
                emptyTarget="Nothing granted yet."
              />
              {viaElsewhere.size > 0 ? (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  This screen writes assignments made to {recipient.name} directly. A row on the Catalog side marked "Also through" is reachable today through that group, so it is not a row without access.
                </p>
              ) : null}
              {otherGrants.length > 0 ? (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {otherGrants.length === 1 ? 'One other grant is' : `${otherGrants.length} other grants are`} not shown here: {otherGrants.map((g) => `${g.roleName}${g.scopeId ? ` on one ${moduleById(g.moduleId)?.recordType?.label ?? 'record'}` : ''}`).join(', ')}.{' '}
                  <button type="button" className={linkClass} onClick={() => setAdvanced(true)}>Open Advanced access</button> to change them.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            {/* Collapsed by default, because the everyday grant is a named row. It opens itself when
                this recipient already holds one of these grants, so nothing granted stays hidden. */}
            <div className="flex items-center gap-2 px-5 py-4 sm:px-6">
              <button
                type="button"
                aria-expanded={broadPanelOpen}
                aria-controls="broader-access"
                onClick={() => setBroadOpen(!broadPanelOpen)}
                className={`-mx-2 -my-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left motion-safe:transition-colors hover:bg-gray-50 dark:hover:bg-gray-950 ${focusRing}`}
              >
                <ChevronDown className={`size-4 shrink-0 text-gray-500 motion-safe:transition-transform ${broadPanelOpen ? '' : '-rotate-90'}`} strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold tracking-tight">Broader access</span>
                  <span className="block text-xs text-gray-600 dark:text-gray-400">
                    {broadHeld === 0
                      ? 'One grant that also covers records added later. Rarely needed.'
                      : `${broadHeld === 1 ? 'One grant that also covers' : `${broadHeld} grants that also cover`} records added later.`}
                  </span>
                </span>
              </button>
              {broadHeld > 0 ? <Pill>{broadHeld} on</Pill> : null}
              <HelpNote label="What is this?" align="right">
                <p>A broader grant is one assignment with no scope. It covers every record of that module, the ones that exist today and every one added later, so a solution registered next month is included without a second grant.</p>
                <p>Use it when the recipient must reach everything of one kind, for example a pilot group. When you can name the rows, pick them in the list above instead, because a named grant is easier to read and to take back.</p>
                <p className="text-gray-600 dark:text-gray-400">It is never a row in the list above, so Add all shown can never widen a grant to future records.</p>
              </HelpNote>
            </div>
            <div id="broader-access" hidden={!broadPanelOpen} className="flex flex-col gap-3 px-5 pb-5 sm:px-6">
              {broader.map((b) => {
                const on = work.broad.includes(b.id)
                const changed = on !== savedBroader.includes(b.id)
                // A blocked row stays removable, so an administrator can always take a kept grant away.
                const stop = Boolean(b.blockedReason) && !on
                return (
                  <label key={b.id} title={stop ? b.blockedReason ?? undefined : undefined} className={`flex min-h-11 items-start gap-3 rounded-lg border px-3.5 py-3 text-sm ${stop ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${on ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40' : 'border-gray-300 dark:border-gray-700'}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={stop}
                      onChange={(e) => setWork({ ...work, broad: e.target.checked ? [...work.broad, b.id] : work.broad.filter((x) => x !== b.id) })}
                      className={`mt-0.5 size-4 shrink-0 accent-blue-600 ${focusRing}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{b.label}</span>
                      <span className="block text-xs text-gray-600 dark:text-gray-400">{b.consequence}</span>
                    </span>
                    {b.inactive ? <Pill tone="amber">Inactive</Pill> : null}
                    {changed ? <Pill>Pending</Pill> : null}
                  </label>
                )
              })}
            </div>
          </Card>
        </>
      )}

      {pendingCount > 0 ? (
        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 dark:border-gray-800 dark:bg-gray-950/95">
          <p role="status" className="min-w-0 text-sm font-medium">
            {pendingCount === 1 ? 'One change' : `${pendingCount} changes`} not saved
            <span className="ml-2 text-xs font-normal text-gray-600 dark:text-gray-400">{added.length + broadAdded.length} to add, {removed.length + broadRemoved.length} to remove</span>
            {remaining.length > 0 ? (
              <span className="block text-xs font-normal text-gray-600 dark:text-gray-400">{remaining[0]}{remaining.length > 1 ? ` And ${remaining.length - 1} more.` : ''}</span>
            ) : null}
          </p>
          <span className="flex gap-2">
            <button type="button" className={btnSecondary} onClick={reset}>Cancel</button>
            <button type="button" className={btnPrimary} aria-busy={saving || undefined} onClick={trySave}>Save changes</button>
          </span>
        </div>
      ) : null}

      <BottomBar><button type="button" className={btnPrimary} disabled={pendingCount === 0} onClick={trySave}>Save changes</button></BottomBar>

      <AdvancedAccess
        open={advanced}
        onClose={() => setAdvanced(false)}
        recipient={recipient}
        modules={p.modules}
        records={p.records}
        grants={p.grants}
        customRoles={p.customRoles}
        currentUserId={p.currentUserId}
        onSave={(list) => { p.onSave?.(list); setToast('Saved. Written to the audit log.') }}
        onAssignRole={(input) => { p.onAssignRole?.(input); setToast('Saved. Written to the audit log.') }}
        initial={{ moduleId: p.initial?.moduleId, level: p.initial?.level }}
      />

      <ConfirmDialog
        open={confirmSave}
        title={`Save ${pendingCount === 1 ? 'one change' : `${pendingCount} changes`}?`}
        description={`Removing an assignment does not end access that arrives another way. ${remaining.join(' ')}`}
        confirmLabel="Save changes"
        onConfirm={() => { setConfirmSave(false); save() }}
        onClose={() => setConfirmSave(false)}
      />

      <ConfirmDialog
        open={Boolean(discard)}
        title={`Discard ${pendingCount === 1 ? 'one change' : `${pendingCount} changes`}?`}
        description="The changes you have not saved are dropped. Nothing was written yet."
        confirmLabel="Discard"
        danger
        onConfirm={() => { discard?.run(); setDiscard(null) }}
        onClose={() => setDiscard(null)}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
