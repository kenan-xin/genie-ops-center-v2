import { useEffect, useId, useRef, useState } from 'react'
import { MoreHorizontal, Search, X } from 'lucide-react'
import type { PersonStatus } from '@/../product/sections/people-groups-and-roles/types'
import { btnDanger, btnGhost, btnPrimary, btnSecondary, focusRing, initials } from './helpers'

/* Shared building blocks: rounded cards, hairline borders, semantic pills, slide-over, dialog, confirm dialog. */

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

export function StatusPill({ status }: { status: PersonStatus }) {
  const map: Record<PersonStatus, { tone: Tone; label: string }> = {
    active: { tone: 'green', label: 'Active' },
    pending: { tone: 'gray', label: 'Pending' },
    disabled: { tone: 'red', label: 'Disabled' },
  }
  return <Pill tone={map[status].tone}>{map[status].label}</Pill>
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = { sm: 'size-7 text-xs', md: 'size-9 text-xs', lg: 'size-14 text-base' }[size]
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200 ${cls}`}>
      {initials(name)}
    </span>
  )
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 text-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/60 focus-within:ring-offset-2 sm:max-w-xs dark:border-gray-700 dark:bg-gray-950 dark:focus-within:ring-offset-gray-950">
      <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500" />
    </label>
  )
}

export function Select({ value, onChange, children, ariaLabel }: { value: string; onChange: (v: string) => void; children: React.ReactNode; ariaLabel: string }) {
  return (
    <span className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-10 appearance-none rounded-xl border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-800 focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 ${focusRing}`}
      >
        {children}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">▾</span>
    </span>
  )
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-600 first:pl-5 last:pr-5 dark:text-gray-400 ${className}`}>{children}</th>
}
export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle text-sm first:pl-5 last:pr-5 ${className}`}>{children}</td>
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-gray-200 px-2 dark:border-gray-800">
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`-mb-px flex min-h-11 shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium motion-safe:transition-colors ${focusRing} ${
              active ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            {t.label}
            {t.count !== undefined ? <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-blue-50 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>{t.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/** Full-height sheet on phones (the base), a right slide-over of about 480px from sm. Escape closes. */
export function SlideOver({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close panel" onClick={onClose} className="absolute inset-0 bg-gray-900/25 backdrop-blur-[1px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl shadow-gray-900/10 sm:inset-y-3 sm:right-3 sm:w-[480px] sm:rounded-2xl sm:border sm:border-gray-200 dark:bg-gray-900 dark:sm:border-gray-800"
      >
        {children}
      </aside>
    </div>
  )
}

/** Icon-only close: 44px on phones, 32px from sm. */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Close" onClick={onClick} className={`${btnGhost} size-11 justify-center px-0 text-gray-500 sm:size-8`}>
      <X className="size-5" strokeWidth={1.75} />
    </button>
  )
}

/** Bottom sheet on phones with actions in a bottom bar, a 480px centered dialog from sm. */
export function Dialog({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; children?: React.ReactNode; footer?: React.ReactNode }) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-gray-900/30 backdrop-blur-[1px]" />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/10 sm:max-w-[480px] sm:rounded-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div>
            <h2 id={titleId} className="text-lg font-bold tracking-tight">{title}</h2>
            {description ? <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p> : null}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div> : <div className="h-4" />}
        {footer ? <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end dark:border-gray-800 [&>button]:min-h-11 sm:[&>button]:min-h-0">{footer}</div> : null}
      </div>
    </div>
  )
}

/** Confirm step for destructive actions (tokens: Overlays). Title names the object, one sentence of consequence, Cancel focused. Escape, scrim, and Cancel all cancel. */
export function ConfirmDialog({ open, title, description, confirmLabel, danger = false, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" autoFocus className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="button" className={danger ? btnDanger : btnPrimary} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
        </>
      }
    />
  )
}

/** Row overflow menu. The trigger is 44px on phones, 32px from sm. */
export function RowMenu({ items }: { items: Array<{ label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; title?: string }> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`${btnGhost} size-11 justify-center px-0 text-gray-500 sm:size-8`}>
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              title={it.title}
              aria-disabled={it.disabled}
              onClick={() => { if (it.disabled) return; setOpen(false); it.onSelect() }}
              className={`flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-2.5 py-2 text-left text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 dark:hover:bg-gray-800 ${focusRing} ${it.danger ? 'text-red-700 dark:text-red-300' : 'text-gray-800 dark:text-gray-200'}`}
            >
              {it.label}
              {it.disabled && it.title ? <span className="text-xs font-normal text-gray-500">{it.title}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Phone only: the page's primary action in a sticky bottom bar (shell `bottomBar` pattern, rendered in-page because the Design OS wrapper cannot pass it). */
export function PhoneBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-3 -mb-8 flex items-center gap-2 border-t border-gray-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden dark:border-gray-800 dark:bg-gray-950/95 [&>button]:h-11 [&>button]:flex-1 [&>button]:justify-center">
      {children}
    </div>
  )
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-sm text-gray-600 dark:text-gray-400">{children}</td>
    </tr>
  )
}
