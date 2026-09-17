import { useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import type { IdleTimeout } from '@/../product/sections/account-and-inbox/types'
import { btnPrimary, btnSecondary } from './helpers'

export interface IdleTimeoutModalProps {
  idleTimeout: IdleTimeout
  /** Extend the session. */
  onStaySignedIn?: () => void
  /** End the session now. */
  onSignOutNow?: () => void
}

/** Countdown dialog over the dimmed shell. Focus is trapped on the two buttons. Escape does nothing. */
export function IdleTimeoutModal({ idleTimeout, onStaySignedIn, onSignOutNow }: IdleTimeoutModalProps) {
  const stayRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    stayRef.current?.focus()
  }, [])
  if (!idleTimeout.isWarning) return null

  const m = Math.floor(idleTimeout.secondsLeft / 60)
  const s = idleTimeout.secondsLeft % 60

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-body"
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.preventDefault()
          if (e.key === 'Tab') {
            e.preventDefault()
            const focusables = e.currentTarget.querySelectorAll<HTMLElement>('button')
            const idx = Array.from(focusables).indexOf(document.activeElement as HTMLElement)
            const next = focusables[(idx + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length]
            next?.focus()
          }
        }}
        className="w-full rounded-t-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/10 sm:max-w-[480px] sm:rounded-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="px-5 pt-5 pb-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <Clock className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="idle-title" className="text-lg font-bold tracking-tight">Still there?</h2>
            <p id="idle-body" className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              You have been inactive for a while. For your security, this session ends after {idleTimeout.idleMinutes} minutes without activity.
            </p>
          </div>
        </div>
        <div className="mt-5">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Signing out in</div>
          <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight" role="timer" aria-live="polite">
            {m}:{String(s).padStart(2, '0')}
          </div>
        </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row sm:justify-end sm:border-0 sm:px-6 sm:pb-6 sm:pt-0 dark:border-gray-800">
          <button type="button" className={`${btnSecondary} h-11 justify-center sm:h-10`} onClick={() => onSignOutNow?.()}>Sign out now</button>
          <button ref={stayRef} type="button" className={`${btnPrimary} h-11 justify-center sm:h-10`} onClick={() => onStaySignedIn?.()}>Stay signed in</button>
        </div>
      </div>
    </div>
  )
}
