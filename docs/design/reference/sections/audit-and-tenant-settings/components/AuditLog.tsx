import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { AuditEvent, AuditFilterOptions, AuditFilters, DateRangePreset, SettingsViewer } from '@/../product/sections/audit-and-tenant-settings/types'
import { actionModule, btnSecondary, fmtDateTime, fmtExact, focusRing, humanize, inputClass, NOW, relativeTime, startOfDay } from './helpers'
import { Avatar, Card, Pill, SearchField, Select, Td, Th } from './ui'
import { AuditEventSheet } from './AuditEventSheet'

export interface AuditLogProps {
  viewer: SettingsViewer
  auditEvents: AuditEvent[]
  auditTotal: number
  auditFilterOptions: AuditFilterOptions
  /** Design-only: opens this event's sheet on load, optionally with the JSON disclosure open. */
  initialEventId?: string | null
  initialJsonOpen?: boolean
  /** Design-only: filters applied on load. */
  initialFilters?: Partial<AuditFilters>
  onChangeAuditFilters?: (filters: AuditFilters) => void
  onLoadMoreAuditEvents?: () => void
  onOpenAuditTarget?: (targetType: string, targetId: string) => void
  onCopyEventId?: (eventId: string) => void
}

const PAGE = 15
const RANGE_LABEL: Record<DateRangePreset, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', custom: 'Custom range' }
const EMPTY: AuditFilters = { query: '', actorId: 'all', action: 'all', targetType: 'all', range: '30d', from: null, to: null }

function rangeStart(f: AuditFilters, tz: string): { from: Date | null; to: Date | null } {
  if (f.range === 'today') return { from: startOfDay(NOW, tz), to: null }
  if (f.range === '7d') return { from: new Date(NOW.getTime() - 7 * 86400e3), to: null }
  if (f.range === '30d') return { from: new Date(NOW.getTime() - 30 * 86400e3), to: null }
  return { from: f.from ? new Date(`${f.from}T00:00:00`) : null, to: f.to ? new Date(`${f.to}T23:59:59`) : null }
}

export function AuditLog(p: AuditLogProps) {
  const [f, setF] = useState<AuditFilters>({ ...EMPTY, ...p.initialFilters })
  const [shown, setShown] = useState(PAGE)
  const [openId, setOpenId] = useState<string | null>(p.initialEventId ?? null)
  const tz = p.viewer.timeZone

  const update = (patch: Partial<AuditFilters>) => {
    const next = { ...f, ...patch }
    setF(next)
    setShown(PAGE)
    p.onChangeAuditFilters?.(next)
  }

  const filtered = useMemo(() => {
    const q = f.query.trim().toLowerCase()
    const { from, to } = rangeStart(f, tz)
    return p.auditEvents
      .filter((e) => {
        const t = new Date(e.occurredAt)
        if (from && t < from) return false
        if (to && t > to) return false
        if (f.actorId === 'system' ? e.actor !== null : f.actorId !== 'all' && e.actor?.id !== f.actorId) return false
        if (f.action !== 'all' && e.action !== f.action) return false
        if (f.targetType !== 'all' && e.targetType !== f.targetType) return false
        if (q && !`${e.summary} ${e.targetLabel} ${e.action} ${e.actor?.name ?? 'system'}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  }, [p.auditEvents, f, tz])

  const active = f.query.trim() !== '' || f.actorId !== 'all' || f.action !== 'all' || f.targetType !== 'all' || f.range !== EMPTY.range
  const total = active ? filtered.length : p.auditTotal
  const visible = filtered.slice(0, shown)
  const open = p.auditEvents.find((e) => e.id === openId) ?? null

  const modules = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const a of p.auditFilterOptions.actions) m.set(actionModule(a), [...(m.get(actionModule(a)) ?? []), a])
    return [...m.entries()]
  }, [p.auditFilterOptions.actions])

  const chips: Array<{ label: string; clear: () => void }> = []
  if (f.query.trim()) chips.push({ label: `“${f.query.trim()}”`, clear: () => update({ query: '' }) })
  if (f.actorId !== 'all') chips.push({ label: f.actorId === 'system' ? 'System' : p.auditFilterOptions.actors.find((a) => a.id === f.actorId)?.name ?? f.actorId, clear: () => update({ actorId: 'all' }) })
  if (f.action !== 'all') chips.push({ label: f.action, clear: () => update({ action: 'all' }) })
  if (f.targetType !== 'all') chips.push({ label: humanize(f.targetType), clear: () => update({ targetType: 'all' }) })
  if (f.range !== EMPTY.range) chips.push({ label: f.range === 'custom' ? `${f.from ?? '…'} to ${f.to ?? '…'}` : RANGE_LABEL[f.range], clear: () => update({ range: EMPTY.range, from: null, to: null }) })

  const loadMore = () => { setShown((n) => n + PAGE); p.onLoadMoreAuditEvents?.() }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <SearchField value={f.query} onChange={(v) => update({ query: v })} placeholder="Search summary or target" />
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <Select ariaLabel="Filter by actor" value={f.actorId} onChange={(v) => update({ actorId: v })}>
            <option value="all">All actors</option>
            <option value="system">System</option>
            {p.auditFilterOptions.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Select ariaLabel="Filter by action" value={f.action} onChange={(v) => update({ action: v })}>
            <option value="all">All actions</option>
            {modules.map(([mod, list]) => (
              <optgroup key={mod} label={humanize(mod)}>
                {list.map((a) => <option key={a} value={a}>{a}</option>)}
              </optgroup>
            ))}
          </Select>
          <Select ariaLabel="Filter by target type" value={f.targetType} onChange={(v) => update({ targetType: v })}>
            <option value="all">All targets</option>
            {p.auditFilterOptions.targetTypes.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </Select>
          <Select ariaLabel="Date range" value={f.range} onChange={(v) => update({ range: v as DateRangePreset, from: null, to: null })}>
            {(Object.keys(RANGE_LABEL) as DateRangePreset[]).map((r) => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
          </Select>
          {f.range === 'custom' ? (
            <div className="col-span-2 flex items-center gap-2">
              <input type="date" aria-label="From" value={f.from ?? ''} max={f.to ?? undefined} onChange={(e) => update({ from: e.target.value || null })} className={`${inputClass} md:w-40`} />
              <span className="text-xs text-gray-500">to</span>
              <input type="date" aria-label="To" value={f.to ?? ''} min={f.from ?? undefined} onChange={(e) => update({ to: e.target.value || null })} className={`${inputClass} md:w-40`} />
            </div>
          ) : null}
        </div>
      </div>

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button key={c.label} type="button" onClick={c.clear} className={`inline-flex h-8 items-center gap-1 rounded-full bg-blue-50 pl-2.5 pr-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300 ${focusRing}`}>
              {c.label}<X className="size-4" strokeWidth={2} aria-hidden />
            </button>
          ))}
          <button type="button" onClick={() => update(EMPTY)} className={`h-8 rounded-lg px-1.5 text-xs font-medium text-gray-600 underline-offset-2 hover:underline dark:text-gray-400 ${focusRing}`}>Clear all</button>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm font-semibold">No events match</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Widen the date range or remove a filter.</p>
            <button type="button" className={`${btnSecondary} mt-4`} onClick={() => update(EMPTY)}>Clear filters</button>
          </div>
        ) : (
          <>
            {/* Phone: card list */}
            <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
              {visible.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => setOpenId(e.id)} className={`flex w-full flex-col gap-1.5 px-4 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 ${focusRing}`}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2"><Avatar size="sm" name={e.actor?.name} system={!e.actor} anonymized={e.actor?.anonymized} /><span className="truncate text-sm font-semibold">{e.actor?.name ?? 'System'}</span></span>
                      <span className="shrink-0 text-xs text-gray-500" title={fmtExact(e.occurredAt, tz)}>{relativeTime(e.occurredAt)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5"><Pill mono>{e.action}</Pill><span className="text-xs text-gray-600 dark:text-gray-400">{e.targetLabel}</span></span>
                    <span className="line-clamp-2 text-sm text-gray-700 dark:text-gray-300">{e.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
            {/* Desktop: table */}
            <table className="hidden w-full table-fixed md:table">
              {/* Action is the widest fixed column; the longest keys still wrap inside their pill rather than overrun Target. */}
              <colgroup><col className="w-[110px]" /><col className="w-[170px]" /><col className="w-[270px]" /><col className="w-[190px]" /><col /></colgroup>
              <thead className="border-b border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-950/40">
                <tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Summary</Th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {visible.map((e) => (
                  <tr key={e.id} onClick={() => setOpenId(e.id)} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setOpenId(e.id)} className={`cursor-pointer hover:bg-gray-50 focus-visible:bg-blue-50/60 dark:hover:bg-gray-800/60 ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`}>
                    <Td className="whitespace-nowrap text-gray-700 dark:text-gray-300"><span title={fmtExact(e.occurredAt, tz)}>{relativeTime(e.occurredAt)}</span><span className="block text-xs text-gray-500">{fmtDateTime(e.occurredAt, tz)}</span></Td>
                    <Td><span className="flex min-w-0 items-center gap-2"><Avatar size="sm" name={e.actor?.name} system={!e.actor} anonymized={e.actor?.anonymized} /><span className={`truncate font-medium ${e.actor ? '' : 'text-gray-600 dark:text-gray-400'}`}>{e.actor?.name ?? 'System'}</span></span></Td>
                    <Td><Pill mono wrap>{e.action}</Pill></Td>
                    <Td><span className="block text-xs text-gray-500">{humanize(e.targetType)}</span><span className={`block truncate ${e.targetExists ? '' : 'text-gray-500'}`} title={e.targetExists ? undefined : 'This record was removed since'}>{e.targetLabel}{e.targetExists ? null : <span className="ml-1.5 text-xs font-medium text-gray-500">(removed)</span>}</span></Td>
                    <Td className="text-gray-700 dark:text-gray-300"><span className="block truncate">{e.summary}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-col items-center gap-2 border-t border-gray-100 px-5 py-3 text-xs text-gray-600 sm:flex-row sm:justify-between dark:border-gray-800 dark:text-gray-400">
              <span>Showing {visible.length.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}</span>
              {visible.length < filtered.length ? <button type="button" className={btnSecondary} onClick={loadMore}>Load more</button> : null}
            </div>
          </>
        )}
      </Card>

      <AuditEventSheet event={open} timeZone={tz} initialJsonOpen={p.initialJsonOpen} onClose={() => setOpenId(null)} onOpenTarget={p.onOpenAuditTarget} onCopyEventId={p.onCopyEventId} />
    </div>
  )
}
