/* Shared building blocks for the Account and Inbox screens. Rounded cards, hairline borders, blue actions. */
import { useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { btnDanger, btnPrimary, btnSecondary, focusRing } from './helpers'

export function Card({ id, title, description, action, children }: { id?: string; title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
      <div className="border-t border-gray-100 dark:border-gray-800">{children}</div>
    </section>
  )
}

export function Pill({ tone = 'gray', children }: { tone?: 'gray' | 'emerald' | 'red'; children: React.ReactNode }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

/** Mono chip: JetBrains Mono, uppercase, letter-spaced. THIS DEVICE and the like. */
export function MonoChip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wide text-gray-700 dark:bg-gray-800 dark:text-gray-300">{children}</span>
}

export interface ConfirmDialogProps {
  open: boolean
  /** Names the object: "Sign out iPhone?" */
  title: string
  /** One sentence of consequence. */
  description: string
  confirmLabel: string
  /** Danger tone for destructive actions. */
  danger?: boolean
  onConfirm: () => void
  /** Escape, scrim, and Cancel all call this. */
  onClose: () => void
}

/**
 * Confirm dialog per tokens: 480px on desktop, full width with a bottom action bar on phones, Cancel focused.
 *
 * Built on the Radix dialog primitive, which is already a dependency of this repository. The markup
 * here previously set `aria-modal="true"` and handled Escape only, so it promised four behaviors and
 * delivered one: there was no focus trap, no scroll lock behind the dialog, and no focus restore on
 * close. The primitive carries all four.
 */
export function ConfirmDialog({ open, title, description, confirmLabel, danger, onConfirm, onClose }: ConfirmDialogProps) {
  /*
   * There is no `Dialog.Trigger`: the dialog opens from a row button through `open`. Radix returns
   * focus to its trigger on close, finds none, and focus falls to the document body. So record the
   * element that held focus when the dialog opened and return it there.
   */
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null
  }, [open])
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-gray-900/40" />
        {/* The wrapper takes no pointer events, so a press beside the panel reaches the overlay and dismisses. */}
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <Dialog.Content
            role="alertdialog"
            onCloseAutoFocus={(e) => { e.preventDefault(); opener.current?.focus() }}
            className="pointer-events-auto relative w-full rounded-t-xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/10 sm:max-w-[480px] sm:rounded-xl dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="px-5 pb-5 pt-5 sm:px-6">
              <Dialog.Title className="text-lg font-bold tracking-tight">{title}</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{description}</Dialog.Description>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row sm:justify-end sm:border-0 sm:px-6 sm:pb-6 sm:pt-0 dark:border-gray-800">
              {/* Cancel is first in the DOM, so the primitive focuses it by default, which the token spec asks for. */}
              <Dialog.Close asChild>
                <button type="button" className={`${btnSecondary} h-11 justify-center sm:h-10`}>Cancel</button>
              </Dialog.Close>
              <button type="button" className={`${danger ? btnDanger : btnPrimary} h-11 justify-center sm:h-10`} onClick={onConfirm}>{confirmLabel}</button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export interface ToastItem {
  id: number
  text: string
  tone?: 'success' | 'neutral' | 'error'
}

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), 4000)
    return () => clearTimeout(t)
  }, [item.id, onDismiss])
  const dot = { success: 'bg-emerald-500', neutral: 'bg-gray-400', error: 'bg-red-500' }[item.tone ?? 'success']
  return (
    <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-lg border border-gray-200 bg-white py-2.5 pl-4 pr-2 text-sm text-gray-900 shadow-lg shadow-gray-900/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${dot}`} />
      <span className="flex-1">{item.text}</span>
      <button type="button" aria-label="Dismiss" onClick={() => onDismiss(item.id)} className={`flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 ${focusRing}`}>
        <X className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  )
}

/** Toast stack per tokens: bottom center on phones, bottom right on desktop, 4 s auto-dismiss, manual close, at most three. */
export function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  if (items.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-80">
      {items.slice(-3).map((t) => <ToastRow key={t.id} item={t} onDismiss={onDismiss} />)}
    </div>
  )
}
