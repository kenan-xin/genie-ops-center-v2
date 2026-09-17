import { useEffect, useId } from 'react'
import { X } from 'lucide-react'
import type { ScanStatus } from '@/../product/sections/branding/types'
import { btnDanger, btnGhost, btnPrimary, btnSecondary } from './helpers'

/* Shared building blocks: rounded cards, semantic pills, the confirm dialog. */

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${className}`}>{children}</section>
}

export type Tone = 'gray' | 'blue' | 'green' | 'red' | 'amber'
const TONES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}
export function Pill({ tone = 'gray', children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  )
}

/** Platform `pending` reads Scanning. Scanning and Skipped are neutral, Clean is success, Infected is danger. */
export function ScanPill({ status }: { status: ScanStatus }) {
  const map: Record<ScanStatus, { tone: Tone; label: string }> = {
    pending: { tone: 'gray', label: 'Scanning' },
    clean: { tone: 'green', label: 'Clean' },
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
  /** Destructive actions render the action button in the danger tone. */
  danger?: boolean
  onConfirm: () => void
  /** Escape, the scrim, and Cancel all cancel. */
  onClose: () => void
  /** Optional detail block between the description and the actions, for example the changed fields. */
  children?: React.ReactNode
}

/** 480px on desktop, full width with a bottom action bar on phones. Cancel is focused first. */
export function ConfirmDialog({ open, title, description, confirmLabel, danger, onConfirm, onClose, children }: ConfirmDialogProps) {
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
      <button type="button" aria-label="Cancel" onClick={onClose} className="absolute inset-0 bg-gray-900/30 backdrop-blur-[1px]" />
      <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/10 sm:max-w-[480px] sm:rounded-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="px-5 pt-5 sm:px-6">
          <h2 id={`${id}-title`} className="text-lg font-bold tracking-tight">{title}</h2>
          <p id={`${id}-body`} className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 sm:px-6">{children}</div> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:border-0 sm:px-6 sm:pb-6 sm:pt-0 dark:border-gray-800">
          <button type="button" autoFocus className={`${btnSecondary} h-11 justify-center sm:h-10`} onClick={onClose}>Cancel</button>
          <button type="button" className={`${danger ? btnDanger : btnPrimary} h-11 justify-center sm:h-10`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
