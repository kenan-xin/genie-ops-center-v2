import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowUpRight, Loader2 } from 'lucide-react'
import type { CompiledModule, RetainedConfigField, RetainedGrant } from '@/../product/sections/audit-and-tenant-settings/types'
import { accessHref, btnPrimary, btnSecondary, fmtDate, focusRing, looksLikeCode, settingsHref } from './helpers'
import { CloseButton, Pill, SlideOver, WarningNote } from './ui'

export interface ModuleReviewProps {
  /** The module under review. Null keeps the panel closed. */
  module: CompiledModule | null
  onClose: () => void
  /**
   * Runs the shared server activation procedure, the one the command line runs. It resolves on
   * success and rejects with the server's reason. A rejection leaves the module switched off.
   */
  onActivate?: (moduleId: string) => void | Promise<void>
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">{title}</h3>
      {children}
    </section>
  )
}

/**
 * One kept setting, as the server rendered it. Read only: editing stays in the module's settings
 * section. A field the server refused carries its own message, so the fix has an address.
 */
function ConfigRow({ f }: { f: RetainedConfigField }) {
  const bad = Boolean(f.status)
  return (
    <div className="flex flex-col gap-0.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0 sm:flex-row sm:gap-3 dark:border-gray-800">
      <dt className="text-xs font-semibold text-gray-600 sm:w-36 sm:shrink-0 sm:pt-0.5 dark:text-gray-400">{f.title}</dt>
      <dd className="min-w-0 flex-1">
        <span className={bad ? 'text-sm text-gray-500' : looksLikeCode(f.value) ? 'font-mono text-xs' : 'text-sm'}>{f.value}</span>
        {f.message ? <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">{f.message}</p> : null}
      </dd>
    </div>
  )
}

/**
 * One retained assignment. Read only here: the name links to Access with this recipient and this
 * module already chosen, and Access owns every change (`DEC-39`). Removing it there and reopening
 * this panel shows a shorter list.
 */
function Grant({ g, moduleId }: { g: RetainedGrant; moduleId: string }) {
  const invalid = g.status === 'invalid'
  const scope = [g.roleName, g.scopeLabel, g.recipientKind === 'group' ? `${g.memberCount ?? 0} members` : null].filter(Boolean).join(' · ')
  return (
    <li className="flex flex-col gap-1 border-t border-gray-100 py-2.5 first:border-t-0 first:pt-0 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a href={accessHref(moduleId, g.recipientId)} className={`rounded text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing} ${invalid ? 'line-through decoration-gray-400' : ''}`}>{g.recipientName}</a>
        <Pill tone={invalid ? 'gray' : 'emerald'}>{invalid ? 'Does not restore now' : 'Restores'}</Pill>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">{scope}</p>
      {g.reason ? <p className="text-xs text-gray-600 dark:text-gray-400">{g.reason}</p> : null}
    </li>
  )
}

/**
 * Mounted under a key of the module id, so every opening starts a fresh review and a confirmation is
 * never carried from one module to the next. A failed activation is not a remount, so the ticked box
 * survives it and Retry is one press.
 *
 * The retained-access review a reintroduced module must pass before it can be enabled
 * (`architecture/module-removal.md`, "Reintroduction and deliberate access restoration").
 *
 * It reads: what the tenant kept, what enabling restores, and what enabling does not bring back.
 * It writes nothing except the one activation call. Configuration is edited in Tenant settings and
 * assignments are changed in Access, so this panel links to both instead of repeating either.
 *
 * The checkbox is the administrator's decision, not the boundary. The server runs the same checks
 * for this screen and for `genie-ops module enable`, so a client that skips the panel is refused.
 */
export function ModuleReview({ module: m, onClose, onActivate }: ModuleReviewProps) {
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  // The panel opens with the keyboard inside it, at the sentence that says what is being decided.
  useEffect(() => { heading.current?.focus() }, [])

  if (!m) return null
  const a = m.activation
  const grants = a.retainedGrants ?? []
  const config = a.retainedConfig ?? []
  const restoring = grants.filter((g) => g.status === 'valid')
  const configBlocked = a.configStatus === 'invalid'
  const canEnable = confirmed && !configBlocked && !busy

  const activate = async () => {
    if (!canEnable) return
    setBusy(true)
    setFailure(null)
    try {
      await onActivate?.(m.id)
      onClose()
    } catch (e) {
      // The module is still off. The panel stays open with the tick intact, so Retry sends the same decision.
      setFailure(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const link = (href: string, label: string) => (
    <a href={href} className={`group inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-semibold text-blue-700 hover:underline sm:min-h-0 dark:text-blue-400 ${focusRing}`}>
      {label}
      <ArrowUpRight className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
    </a>
  )

  return (
    <SlideOver open onClose={onClose} title={`Review ${m.displayName} before enabling`}>
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="min-w-0">
          <h2 ref={heading} tabIndex={-1} className="text-base font-bold tracking-tight outline-none">Review {m.displayName} before enabling</h2>
          <p className="mt-0.5 font-mono text-xs text-gray-500">{m.id}</p>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <WarningNote size="md" role="status">
          <p className="font-semibold">{m.displayName} returned to this deployment{a.returnedAt ? ` on ${fmtDate(a.returnedAt)}` : ''} after it was removed.</p>
          <p className="mt-0.5">It is switched off, whatever it was before. Read what the tenant kept, then decide. Closing this panel changes nothing.</p>
        </WarningNote>

        <Block title="Retained configuration">
          {configBlocked ? (
            <p role="alert" className="flex flex-wrap items-start gap-x-1.5 gap-y-1 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
              <span className="min-w-0 flex-1">{a.configMessage ?? 'One required setting is not valid.'} {m.displayName} cannot be enabled until this is fixed.</span>
            </p>
          ) : (
            <p className="text-sm text-gray-700 dark:text-gray-300">These are the settings the tenant kept. The module runs with them when you enable it.</p>
          )}
          {config.length ? <dl className="flex flex-col">{config.map((f) => <ConfigRow key={f.key} f={f} />)}</dl> : null}
          <p className="text-xs text-gray-600 dark:text-gray-400">This list only reads. Change a setting in the module's own section, then reopen this review. Saving settings never switches a module on.</p>
          {link(settingsHref(m.id), `Open ${m.displayName} settings`)}
        </Block>

        <Block title={`Retained access · ${restoring.length} of ${grants.length} restore`}>
          {grants.length ? (
            <ul className="flex flex-col">{grants.map((g) => <Grant key={g.id} g={g} moduleId={m.id} />)}</ul>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">The tenant kept no assignment for this module. Enabling grants nobody anything.</p>
          )}
          <p className="text-xs text-gray-600 dark:text-gray-400">This list only reads. Remove an assignment you do not want before you enable, in Access, then reopen this panel. A row marked Does not restore now is kept, not deleted: it gives nothing in this activation, and a later membership or status change is judged again by ordinary authorization.</p>
          {link(accessHref(m.id), 'Change assignments in Access')}
        </Block>

        {a.notRestored?.length ? (
          <Block title="What enabling does not bring back">
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-gray-700 marker:text-gray-400 dark:text-gray-300">
              {a.notRestored.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </Block>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        {failure ? (
          <p role="alert" className="flex flex-wrap items-start gap-x-1.5 gap-y-1 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1">Not enabled. {failure} {m.displayName} is still switched off and nothing was restored. Your review is still here.</span>
          </p>
        ) : null}
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-800 dark:text-gray-200">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={configBlocked}
            onChange={(e) => setConfirmed(e.target.checked)}
            className={`mt-0.5 size-4 shrink-0 rounded border-gray-500 text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          />
          <span>I read the retained access. Enabling {m.displayName} restores the {restoring.length} {restoring.length === 1 ? 'assignment' : 'assignments'} marked Restores, and nothing else.</span>
        </label>
        <p className="text-xs text-gray-600 dark:text-gray-400">The server runs these checks for this screen and for <span className="font-mono">genie-ops module enable</span>. This box records your decision; it is not what enforces it.</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={`${btnSecondary} h-11 justify-center sm:h-10`} onClick={onClose}>Cancel</button>
          <button type="button" className={`${btnPrimary} h-11 justify-center sm:h-10 sm:min-w-40`} disabled={!canEnable} aria-busy={busy || undefined} onClick={activate}>
            {busy ? <Loader2 className="size-4 motion-safe:animate-spin" strokeWidth={2} aria-hidden /> : null}
            {failure ? 'Retry enabling' : `Enable ${m.displayName}`}
          </button>
        </div>
      </div>
    </SlideOver>
  )
}
