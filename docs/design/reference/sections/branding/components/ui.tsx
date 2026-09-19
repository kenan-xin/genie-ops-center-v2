import { useEffect, useId, useRef, useState } from 'react'
import { HelpCircle, Loader2, X } from 'lucide-react'
import type { ScanStatus } from '@/../product/sections/branding/types'
import { btnDanger, btnGhost, btnPrimary, btnSecondary, focusRing } from './helpers'

/* Shared building blocks: rounded cards, semantic pills, the confirm dialog. */

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${className}`}>{children}</section>
}

/**
 * The one contextual-help pattern (tokens.md, Help disclosure): a labelled button opens one collapsed
 * callout beside the control it explains, at most one per screen. It never opens on hover alone.
 * Escape and a click outside close it.
 */
export function HelpNote({ label, children, align = 'left' }: { label: string; children: React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <span ref={wrap} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-blue-700 motion-safe:transition-colors hover:bg-blue-50 sm:h-8 dark:text-blue-400 dark:hover:bg-blue-950/40 ${focusRing}`}
      >
        <HelpCircle className="size-4" strokeWidth={1.75} aria-hidden />{label}
      </button>
      {open ? (
        <div id={`${id}-panel`} role="group" aria-label={label} className={`absolute top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 bg-white p-4 text-left shadow-lg dark:border-gray-700 dark:bg-gray-900 ${align === 'right' ? 'right-0 max-sm:left-0 max-sm:right-auto' : 'left-0'}`}>
          <div className="flex flex-col gap-2 text-xs leading-relaxed text-gray-700 dark:text-gray-300">{children}</div>
          <button type="button" onClick={() => setOpen(false)} className={`mt-3 rounded text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>Close</button>
        </div>
      ) : null}
    </span>
  )
}

export type Tone = 'gray' | 'emerald' | 'red' | 'amber'
const TONES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', // unslop-ignore: the warning surface, not a cream page (tokens.md, Color roles)
}
export function Pill({ tone = 'gray', children, title, onClick, label }: { tone?: Tone; children: React.ReactNode; title?: string; onClick?: () => void; label?: string }) {
  const base = `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`
  // A pill that opens something is a button: 24px tall for the touch target, with the gray hover the header pill uses.
  if (onClick) {
    return (
      <button type="button" title={title} aria-label={label} onClick={onClick} className={`${base} min-h-6 motion-safe:transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 ${focusRing}`}>
        {children}
      </button>
    )
  }
  return (
    <span title={title} className={base}>
      {children}
    </span>
  )
}

/** Platform `pending` reads Scanning. Scanning and Skipped are neutral, Clean is success, Infected is danger. */
export function ScanPill({ status }: { status: ScanStatus }) {
  const map: Record<ScanStatus, { tone: Tone; label: string }> = {
    pending: { tone: 'gray', label: 'Scanning' },
    clean: { tone: 'emerald', label: 'Clean' },
    infected: { tone: 'red', label: 'Infected' },
    skipped: { tone: 'gray', label: 'Skipped' },
  }
  return <Pill tone={map[status].tone}>{map[status].label}</Pill>
}

export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`${btnGhost} size-11 justify-center px-0 text-gray-500 sm:size-8`}>
      <X className="size-5" strokeWidth={1.75} />
    </button>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  /** Names the object and the count: "Publish 3 changes?" */
  title: string
  /** One sentence of consequence. */
  description: string
  confirmLabel: string
  /** The action is not available yet, with the reason on the button. */
  confirmDisabled?: boolean
  confirmTitle?: string
  /** Default Cancel. A dialog that only presents something closes instead. */
  cancelLabel?: string
  /** Destructive actions render the action button in the danger tone. */
  danger?: boolean
  /** `alertdialog` interrupts with a consequence. A dialog that presents a record uses `dialog`. */
  role?: 'alertdialog' | 'dialog'
  onConfirm: () => void
  /** Escape, the scrim, and Cancel all cancel. */
  onClose: () => void
  /** Optional detail block between the description and the actions, for example the changed fields. */
  children?: React.ReactNode
  /** The action is running: spinner in place of the leading icon, label and width kept, a second press ignored. */
  loading?: boolean
}

/** 480px on desktop, full width with a bottom action bar on phones. Cancel is focused first. */
export function ConfirmDialog({ open, title, description, confirmLabel, confirmDisabled, confirmTitle, cancelLabel = 'Cancel', danger, role = 'alertdialog', onConfirm, onClose, children, loading }: ConfirmDialogProps) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label={cancelLabel} onClick={onClose} className="absolute inset-0 bg-gray-900/30 backdrop-blur-[1px]" />
      <div role={role} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/10 sm:max-w-[480px] sm:rounded-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="px-5 pt-5 sm:px-6">
          <h2 id={`${id}-title`} className="text-lg font-bold tracking-tight">{title}</h2>
          <p id={`${id}-body`} className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 sm:px-6">{children}</div> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:border-0 sm:px-6 sm:pb-6 sm:pt-0 dark:border-gray-800">
          <button type="button" autoFocus className={`${btnSecondary} h-11 justify-center sm:h-10`} onClick={onClose}>{cancelLabel}</button>
          <button type="button" aria-busy={loading || undefined} disabled={confirmDisabled} title={confirmTitle} className={`${danger ? btnDanger : btnPrimary} h-11 justify-center sm:h-10`} onClick={() => { if (!loading) onConfirm() }}>{loading ? <Loader2 className="size-5 motion-safe:animate-spin" strokeWidth={2} aria-hidden /> : null}{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
