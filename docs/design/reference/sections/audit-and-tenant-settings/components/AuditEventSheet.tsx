import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import type { AuditEvent } from '@/../product/sections/audit-and-tenant-settings/types'
import { btnGhost, fmtExact, focusRing, formatMetaValue, humanize, looksLikeCode, relativeTime } from './helpers'
import { Avatar, CloseButton, Pill, SlideOver } from './ui'

export interface AuditEventSheetProps {
  event: AuditEvent | null
  timeZone: string
  onClose: () => void
  /** Follows the path the server supplied on the event. The screen never invents a destination. */
  onOpenTarget?: (path: string) => void
  onCopyEventId?: (eventId: string) => void
  /** Design-only: opens the Show JSON disclosure on load. */
  initialJsonOpen?: boolean
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      {children}
    </section>
  )
}

export function AuditEventSheet({ event: e, timeZone, onClose, onOpenTarget, onCopyEventId, initialJsonOpen }: AuditEventSheetProps) {
  const [copied, setCopied] = useState(false)
  if (!e) return null
  const entries = Object.entries(e.metadata)
  const copy = () => {
    navigator.clipboard?.writeText(e.id).catch(() => undefined)
    onCopyEventId?.(e.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <SlideOver open onClose={onClose} title="Audit event">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-2">
          <Pill mono>{e.action}</Pill>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        <Section title="Actor">
          <div className="flex items-center gap-3">
            <Avatar name={e.actor?.name} system={!e.actor} anonymized={e.actor?.anonymized} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{e.actor ? e.actor.name : 'System'}</p>
              <p className="truncate text-xs text-gray-600 dark:text-gray-400">{e.actor ? (e.actor.anonymized ? 'Personal data erased. Events kept under an anonymized id.' : e.actor.email) : 'A job, provisioning, or the operator command line.'}</p>
            </div>
          </div>
        </Section>

        <Section title="When">
          <p className="text-sm font-medium">{fmtExact(e.occurredAt, timeZone)}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{relativeTime(e.occurredAt)} · shown in {timeZone.replace('_', ' ')}</p>
        </Section>

        <Section title="Target">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{humanize(e.targetType)}</p>
              <p className="truncate text-sm font-semibold">{e.targetLabel}</p>
              <p className="truncate font-mono text-xs text-gray-500">{e.targetId}</p>
            </div>
            {/* Open needs a destination the server supplied and authorized, not merely a target that
                still exists: a resolver may answer with a label and no path. */}
            {e.targetPath ? (
              <button type="button" className={`${btnGhost} shrink-0 text-blue-700 dark:text-blue-400`} onClick={() => onOpenTarget?.(e.targetPath!)}>Open<ExternalLink className="size-4" strokeWidth={2} aria-hidden /></button>
            ) : e.targetExists ? (
              <Pill title="This record has no page you can open from here.">No link</Pill>
            ) : (
              <Pill>Removed</Pill>
            )}
          </div>
        </Section>

        <Section title="Summary">
          <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">{e.summary}</p>
        </Section>

        <Section title="Details">
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500">This event carries no extra details.</p>
          ) : (
            <dl className="divide-y divide-gray-100 dark:divide-gray-800">
              {entries.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[minmax(0,150px)_1fr] gap-3 py-2 text-sm">
                  <dt className="break-words text-gray-600 dark:text-gray-400">{humanize(k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}</dt>
                  <dd className={`min-w-0 break-words ${looksLikeCode(v) ? 'font-mono text-xs' : ''} ${typeof v === 'object' && v !== null && !Array.isArray(v) ? 'font-mono text-xs text-gray-700 dark:text-gray-300' : ''}`}>{formatMetaValue(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          <details className="group mt-1" open={initialJsonOpen}>
            <summary className={`w-fit cursor-pointer select-none rounded-lg text-sm font-medium text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}><span className="group-open:hidden">Show JSON</span><span className="hidden group-open:inline">Hide JSON</span></summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">{JSON.stringify(e, null, 2)}</pre>
          </details>
        </Section>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-800">
        <p className="min-w-0 truncate font-mono text-xs text-gray-600 dark:text-gray-400" title={e.id}>Event id {e.id}</p>
        <button type="button" className={`${btnGhost} shrink-0`} onClick={copy}>{copied ? <><Check className="size-4 text-emerald-600" strokeWidth={2.5} aria-hidden />Copied</> : <><Copy className="size-4" strokeWidth={1.75} aria-hidden />Copy</>}</button>
      </div>
    </SlideOver>
  )
}
