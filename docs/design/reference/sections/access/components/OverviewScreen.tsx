import { useMemo, useState } from 'react'
import { Building2, Info, Search, UsersRound, X } from 'lucide-react'
import type { AccessProps, EffectiveAccessRow, OverviewSubject } from '@/../product/sections/access/types'
import { btnGhost, btnSecondary, focusRing, fmtDate, linkClass } from './helpers'
import { Avatar, Card, EmptyRow, HelpNote, Pill, Td, Th } from './ui'

export interface OverviewScreenProps extends AccessProps {
  /** Prefill from a link, for example from a group, a person, a module, or one solution. */
  initialSubject?: OverviewSubject | null
}

const PAGE = 10

/**
 * Read-only. Nothing loads before a subject is chosen, so there is no all-people by all-records
 * matrix and no background scan. History belongs to the audit log.
 */
export function OverviewScreen(p: OverviewScreenProps) {
  const [mode, setMode] = useState<'recipient' | 'target'>(p.initialSubject?.kind === 'recipient' ? 'recipient' : p.initialSubject ? 'target' : 'recipient')
  const [subject, setSubject] = useState<OverviewSubject | null>(p.initialSubject ?? null)
  const [pick, setPick] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const recipientById = useMemo(() => new Map(p.recipients.map((r) => [r.id, r])), [p.recipients])
  const moduleById = useMemo(() => new Map(p.modules.map((m) => [m.id, m])), [p.modules])
  const recordById = useMemo(() => new Map(p.records.map((r) => [r.id, r])), [p.records])

  const options = useMemo(() => {
    const s = pick.trim().toLowerCase()
    const list = mode === 'recipient'
      ? p.recipients.map((r) => ({ kind: 'recipient' as const, id: r.id, label: r.name, sub: r.detail, type: r.type }))
      : [
          ...p.modules.map((m) => ({ kind: 'module' as const, id: m.id, label: m.name, sub: m.enabled ? 'Module' : 'Module · disabled', type: null })),
          ...p.records.map((r) => ({ kind: 'record' as const, id: r.id, label: r.label, sub: `${moduleById.get(r.moduleId)?.name ?? r.moduleId} · ${r.detail}`, type: null })),
        ]
    return list.filter((o) => !s || o.label.toLowerCase().includes(s) || o.sub.toLowerCase().includes(s)).slice(0, 8)
  }, [mode, pick, p.recipients, p.modules, p.records, moduleById])

  const rows: EffectiveAccessRow[] = useMemo(() => {
    if (!subject) return []
    const label = (moduleId: string, scopeId: string | null) => {
      if (scopeId) return recordById.get(scopeId)?.label ?? scopeId
      // The scope pill beside this label carries "Whole tenant", so the label does not repeat it.
      const m = moduleById.get(moduleId)
      return m?.recordType ? `Every ${m.recordType.label}` : m?.name ?? moduleId
    }
    const inactive = (holderId: string, moduleId: string) => {
      const holder = recipientById.get(holderId)
      if (holder?.archived) return 'The group is archived, so this grant gives nothing until it is restored.'
      if (holder?.status === 'disabled') return 'The person is disabled and cannot sign in.'
      const m = moduleById.get(moduleId)
      if (m?.enabled === false) return `Inactive: the ${m.name} module is switched off. The assignment is kept and applies again when it is switched on.`
      return null
    }
    const build = (g: (typeof p.grants)[number], source: string): EffectiveAccessRow => ({
      id: `${g.id}-${source}`,
      holderId: g.recipientId,
      holderType: g.recipientType,
      holderName: recipientById.get(g.recipientId)?.name ?? g.recipientId,
      moduleId: g.moduleId,
      moduleName: moduleById.get(g.moduleId)?.name ?? g.moduleId,
      targetId: g.scopeId,
      targetLabel: label(g.moduleId, g.scopeId),
      roleName: g.roleName,
      level: g.level,
      source,
      alsoThrough: null,
      addedBy: g.createdBy,
      addedAt: g.createdAt,
      inactiveReason: inactive(g.recipientId, g.moduleId),
    })

    let out: EffectiveAccessRow[] = []
    if (subject.kind === 'recipient') {
      const who = recipientById.get(subject.id)
      const groupIds = who?.groupIds ?? []
      out = p.grants
        .filter((g) => g.recipientId === subject.id || (g.recipientType === 'group' && groupIds.includes(g.recipientId)))
        .map((g) => build(g, g.recipientId === subject.id ? 'Direct assignment' : `via ${recipientById.get(g.recipientId)?.name ?? g.recipientId}`))
    } else if (subject.kind === 'module') {
      out = p.grants.filter((g) => g.moduleId === subject.id).map((g) => build(g, g.recipientType === 'user' ? 'Direct assignment' : 'Group assignment'))
    } else {
      const rec = recordById.get(subject.id)
      out = p.grants
        .filter((g) => g.scopeId === subject.id || (rec && g.moduleId === rec.moduleId && !g.scopeId))
        .map((g) => build(g, g.scopeId ? 'Granted for this record' : 'Granted for the whole module'))
    }

    // One target reached twice means removing one grant leaves the other in place.
    const byTarget = new Map<string, EffectiveAccessRow[]>()
    out.forEach((r) => {
      const k = `${r.moduleId}|${r.targetId ?? 'all'}`
      byTarget.set(k, [...(byTarget.get(k) ?? []), r])
    })
    return out.map((r) => {
      const peers = (byTarget.get(`${r.moduleId}|${r.targetId ?? 'all'}`) ?? []).filter((x) => x.id !== r.id)
      const name = (s: string) => (s.startsWith('via ') ? s.slice(4) : s === 'Direct assignment' ? 'a direct assignment' : s.toLowerCase())
      return peers.length === 0 ? r : { ...r, alsoThrough: peers.map((x) => name(x.source)).join(', ') }
    })
    // `p.grants` is the only prop this reads; the maps above carry the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, p.grants, recipientById, moduleById, recordById])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => [r.holderName, r.targetLabel, r.roleName, r.moduleName, r.source].some((v) => v.toLowerCase().includes(s)))
  }, [rows, q])

  const inactiveCount = filtered.filter((r) => r.inactiveReason).length
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const current = Math.min(page, pages - 1)
  const shown = filtered.slice(current * PAGE, current * PAGE + PAGE)

  const subjectLabel = subject
    ? subject.kind === 'recipient'
      ? recipientById.get(subject.id)?.name ?? subject.id
      : subject.kind === 'module'
        ? moduleById.get(subject.id)?.name ?? subject.id
        : recordById.get(subject.id)?.label ?? subject.id
    : null

  const grantsHref = subject
    ? subject.kind === 'recipient'
      ? `/admin/access?recipient=${subject.id}`
      : subject.kind === 'module'
        ? `/admin/access?module=${subject.id}`
        : `/admin/access?module=${recordById.get(subject.id)?.moduleId ?? ''}&record=${subject.id}`
    : '/admin/access'

  const seg = (k: 'recipient' | 'target', label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === k}
      onClick={() => { setMode(k); setSubject(null); setPick(''); setPage(0) }}
      className={`h-8 rounded-lg px-3.5 text-sm font-medium motion-safe:transition-colors ${focusRing} ${mode === k ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-950 dark:text-gray-100' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label="Look up by" className="inline-flex h-10 shrink-0 items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800">{seg('recipient', 'By group or person')}{seg('target', 'By module or record')}</div>
        {subject ? (
          <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 pl-3 pr-1 text-sm dark:border-gray-700">
            <span className="font-semibold">{subjectLabel}</span>
            <button type="button" aria-label="Clear" className={`${btnGhost} size-8 justify-center px-0 text-gray-500`} onClick={() => { setSubject(null); setPick(''); setPage(0) }}><X className="size-4" strokeWidth={2} /></button>
          </div>
        ) : (
          <div className="relative w-full sm:max-w-sm">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-gray-500 bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950">
              <Search className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
              <input value={pick} onChange={(e) => setPick(e.target.value)} aria-label={mode === 'recipient' ? 'Pick a group or a person' : 'Pick a module or a record'} placeholder={mode === 'recipient' ? 'Pick a group or a person' : 'Pick a module or a record'} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500" />
            </label>
            {pick.trim() ? (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                {options.map((o) => (
                  <li key={o.kind + o.id}>
                    <button type="button" onClick={() => { setSubject({ kind: o.kind, id: o.id } as OverviewSubject); setPage(0) }} className={`flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${focusRing}`}>
                      {o.kind === 'recipient' && o.type === 'user' ? <Avatar name={o.label} size="sm" /> : o.kind === 'recipient' ? <span className="flex size-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"><UsersRound className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden /></span> : null}
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{o.label}</span><span className="block truncate text-xs text-gray-600 dark:text-gray-400">{o.sub}</span></span>
                    </button>
                  </li>
                ))}
                {options.length === 0 ? <li className="px-3 py-4 text-center text-sm text-gray-600">No match.</li> : null}
              </ul>
            ) : null}
          </div>
        )}
        {subject && rows.length > 0 ? (
          <label className="flex h-10 min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-500 bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 sm:max-w-xs dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950">
            <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} aria-label="Search these results" placeholder="Search these results" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500" />
          </label>
        ) : null}
        <span className="sm:ml-auto">
          <HelpNote label="How access works" align="right" iconOnly>
            <p>Roles define what somebody can do. People receive access through roles assigned to them directly and through their groups. These grants combine within the scope each one carries.</p>
            <p>Removing one grant does not remove access that another role or another group provides. A disabled account and a switched-off module still block access.</p>
            <p className="text-gray-600 dark:text-gray-400">The How column names every path, so a row that reads "also through" is reached twice.</p>
          </HelpNote>
        </span>
      </div>

      {!subject ? (
        <Card>
          <div className="flex flex-col items-start gap-2 px-5 py-10 sm:px-6">
            <h3 className="text-base font-bold tracking-tight">Pick one subject</h3>
            <p className="max-w-prose text-sm text-gray-600 dark:text-gray-400">Choose a group or a person to see everything they reach, or a module or one record to see who reaches it. Nothing is read before you choose, so this page never scans the whole tenant.</p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-semibold">{filtered.length}</span> {filtered.length === 1 ? 'assignment' : 'assignments'}{q ? ' match' : ''} for <span className="font-semibold">{subjectLabel}</span>
              {inactiveCount > 0 ? <span className="text-gray-600 dark:text-gray-400">, {inactiveCount} not in effect</span> : null}
            </p>
            <button type="button" className={btnSecondary} onClick={() => p.onNavigate?.(grantsHref)}>Change access</button>
          </div>

          <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
            {shown.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <span className="flex flex-wrap items-center gap-1.5 font-medium">{r.holderName}{r.holderType === 'group' ? <Pill>Group</Pill> : <Pill>Person</Pill>}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-gray-700 dark:text-gray-300">{r.targetLabel}<Pill title={r.targetId ? undefined : 'Every record of this module, including the ones added later.'}>{r.targetId ? 'One record' : 'Whole tenant'}</Pill></span>
                <span className="text-xs text-gray-600 dark:text-gray-400">{r.roleName} · {r.source} · {fmtDate(r.addedAt)} by {r.addedBy}</span>
                {r.alsoThrough ? <span className="text-xs text-gray-700 dark:text-gray-300">also through {r.alsoThrough}</span> : null}
                {r.inactiveReason ? <span className="text-xs text-amber-800 dark:text-amber-200">{r.inactiveReason}</span> : null}
              </li>
            ))}
            {shown.length === 0 ? <li className="px-5 py-10 text-center text-sm text-gray-600 dark:text-gray-400">Nothing reaches {subjectLabel} yet.</li> : null}
          </ul>

          <div className="hidden md:block">
            <table className="w-full table-fixed">
              <colgroup><col className="w-[22%]" /><col /><col className="w-[20%]" /><col className="w-[20%]" /><col className="w-[15%]" /></colgroup>
              <thead className="bg-gray-50 dark:bg-gray-950/50"><tr><Th>Who</Th><Th>Reaches</Th><Th>Role</Th><Th>How</Th><Th>Added</Th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <span className="flex min-w-0 items-center gap-2.5">
                        {r.holderType === 'user' ? <Avatar name={r.holderName} size="sm" /> : <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"><Building2 className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden /></span>}
                        <span className="min-w-0 truncate font-medium">{r.holderName}</span>
                      </span>
                    </Td>
                    <Td>
                      <span className="block truncate text-gray-800 dark:text-gray-200" title={r.targetLabel}>{r.targetLabel}</span>
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">{r.moduleName === r.targetLabel ? null : <span className="truncate">{r.moduleName}</span>}<Pill title={r.targetId ? undefined : 'Every record of this module, including the ones added later.'}>{r.targetId ? 'One record' : 'Whole tenant'}</Pill></span>
                    </Td>
                    <Td className="text-gray-700 dark:text-gray-300"><span className="block truncate">{r.roleName}</span></Td>
                    <Td className="text-gray-700 dark:text-gray-300">
                      <span className="block truncate">{r.source}</span>
                      {r.alsoThrough ? <span className="block text-xs leading-snug text-gray-600 line-clamp-2 dark:text-gray-400" title={`also through ${r.alsoThrough}`}>also through {r.alsoThrough}</span> : null}
                      {r.inactiveReason ? <span className="mt-0.5 inline-flex"><Pill tone="amber" title={r.inactiveReason}>Not in effect</Pill></span> : null}
                    </Td>
                    <Td className="text-xs text-gray-600 dark:text-gray-400">{fmtDate(r.addedAt)}<br />by {r.addedBy}</Td>
                  </tr>
                ))}
                {shown.length === 0 ? <EmptyRow colSpan={5}>{q ? 'No result matches this search.' : `Nothing reaches ${subjectLabel} yet.`}</EmptyRow> : null}
              </tbody>
            </table>
          </div>

          {filtered.length > PAGE ? (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">
              <span>{current * PAGE + 1} to {Math.min(filtered.length, (current + 1) * PAGE)} of {filtered.length}</span>
              <span className="flex gap-2">
                <button type="button" className={btnGhost} disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
                <button type="button" className={btnGhost} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button>
              </span>
            </div>
          ) : null}

          <p className="flex items-start gap-2 border-t border-gray-100 px-5 py-3 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">
            <Info className="mt-px size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
            <span>
              Access can arrive more than once. Removing one grant can leave a person reaching the same record through another role or another group, which the How column names. What changed and when is in the <button type="button" className={linkClass} onClick={() => p.onNavigate?.('/admin/audit')}>audit log</button>.
            </span>
          </p>
        </Card>
      )}
    </div>
  )
}
