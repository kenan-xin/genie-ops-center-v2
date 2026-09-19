import { Mail } from 'lucide-react'
import type { EmptyStateCopy, TenantSupport } from '@/../product/sections/account-and-inbox/types'
import { btnSecondary } from './helpers'

export interface SolutionsEmptyStateProps {
  copy: EmptyStateCopy
  support: TenantSupport
}

/** The Solutions hub when the person holds no solution grant. Copy: "No solutions yet" and "Ask your administrator to grant you access to a solution." */
export function SolutionsEmptyState({ copy, support }: SolutionsEmptyStateProps) {
  const href = support.supportUrl ?? (support.supportEmail ? `mailto:${support.supportEmail}` : null)
  return (
    <div className="flex min-h-[60vh] items-center justify-center rounded-xl border border-dashed border-gray-200 p-8 dark:border-gray-800">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        {/* Tenant letter tile, same style as the shell TenantMark. */}
        <span aria-hidden className="flex size-14 items-center justify-center rounded-xl border border-gray-200 bg-white text-2xl font-extrabold text-blue-700 dark:border-gray-700 dark:bg-gray-900 dark:text-blue-400">
          {support.companyName.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-bold tracking-tight">{copy.heading}</h2>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">{copy.body}</p>
        </div>
        {href ? (
          <a href={href} className={btnSecondary}>
            <Mail className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />
            Contact {support.companyName} support
          </a>
        ) : null}
      </div>
    </div>
  )
}
