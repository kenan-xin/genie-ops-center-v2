import { useEffect, useRef, useState } from 'react'
import type { BreakGlassAdmin, BreakGlassStep } from '@/../product/sections/sign-in-and-tenant-pages/types'

/** The one focus ring (tokens.md): solid blue-500 (blue-400 in dark) with a 2px offset, on every interactive element. */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-950'

export const inputClass = `h-11 w-full rounded-lg border border-gray-500 bg-white px-3.5 text-base text-gray-900 placeholder:text-gray-500 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 ${focusRing}`
export const labelClass = 'text-sm font-semibold text-gray-800 dark:text-gray-200'
export const primaryClass = `flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-base font-semibold text-white shadow-sm shadow-blue-600/20 motion-safe:transition-colors hover:bg-blue-600/90 active:bg-blue-600/80 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600 ${focusRing}`

/**
 * Design-only loading state (tokens.md, Buttons): `trigger` flips `loading` for `ms`, then runs `fn`.
 * A press while loading is ignored.
 */
export function useDelayed(fn: () => void, ms = 900): [boolean, () => void] {
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const trigger = () => {
    if (loading) return
    setLoading(true)
    timer.current = setTimeout(() => {
      setLoading(false)
      fn()
    }, ms)
  }
  return [loading, trigger]
}

/**
 * The door in order (B9). Enrolled account: credentials, then code.
 * Not enrolled (first sign-in or after rotation): credentials, change-password, enroll; no code step,
 * because there is no authenticator to ask a code from.
 */
export function breakGlassSteps(admin: Pick<BreakGlassAdmin, 'mustChangePassword' | 'mustEnrollAuthenticator'>): BreakGlassStep[] {
  return [
    'credentials',
    ...(admin.mustEnrollAuthenticator ? [] : (['authenticator-code'] as const)),
    ...(admin.mustChangePassword ? (['change-password'] as const) : []),
    ...(admin.mustEnrollAuthenticator ? (['authenticator-enroll'] as const) : []),
  ]
}

export const linkClass = `rounded-lg text-sm font-medium text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`
