export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950'

export const inputClass = `h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-base text-gray-900 placeholder:text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 ${focusRing}`
export const labelClass = 'text-sm font-semibold text-gray-800 dark:text-gray-200'
export const primaryClass = `flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-gray-800 dark:disabled:text-gray-500 ${focusRing}`
import type { BreakGlassAdmin, BreakGlassStep } from '@/../product/sections/sign-in-and-tenant-pages/types'

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

export const linkClass = `rounded-lg text-sm font-medium text-blue-700 hover:underline dark:text-blue-300 ${focusRing}`
