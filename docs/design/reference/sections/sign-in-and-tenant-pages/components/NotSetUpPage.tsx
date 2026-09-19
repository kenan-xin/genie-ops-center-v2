import { Check, Circle, X } from 'lucide-react'
import type { SetupStep } from '@/../product/sections/sign-in-and-tenant-pages/types'
import { PlainFrame } from './PlainFrame'
import { focusRing } from './helpers'

export interface NotSetUpPageProps {
  productName: string
  steps: SetupStep[]
  /** Shown only when tenant branding already provides one; branding may not be seeded yet. */
  supportEmail?: string | null
}

/** Shown on every route until `genie-ops setup` completes. Nothing a visitor can do, so no button. */
export function NotSetUpPage({ productName, steps, supportEmail }: NotSetUpPageProps) {
  const done = steps.filter((s) => s.state === 'done').length
  return (
    <PlainFrame productName={productName}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">This deployment is not set up yet</h1>
          <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400">
            An operator must finish <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-sm dark:bg-gray-800">genie-ops setup</code> before anyone can sign in.
          </p>
        </header>

        <section aria-label="Setup progress" className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-800 dark:text-gray-200">Setup steps</span>
            <span className="font-mono text-gray-500">{done} of {steps.length} done</span>
          </div>
          <ol className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {steps.map((s) => {
              const Icon = s.state === 'done' ? Check : s.state === 'failed' ? X : Circle
              const tone =
                s.state === 'done'
                  ? 'bg-emerald-500 text-white'
                  : s.state === 'failed'
                    ? 'bg-red-600 text-white'
                    : 'border border-gray-300 text-gray-400 dark:border-gray-600'
              return (
                <li key={s.step} className="flex items-start gap-3 px-3.5 py-2.5">
                  <span aria-hidden className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${tone}`}>
                    {s.state === 'pending' ? null : <Icon className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <code className="font-mono text-sm text-gray-900 dark:text-gray-100">{s.step}</code>
                      <span className={`text-xs ${s.state === 'failed' ? 'font-semibold text-red-700 dark:text-red-300' : 'text-gray-500'}`}>{s.state}</span>
                    </span>
                    {s.state === 'failed' && s.detail ? <span className="text-xs leading-relaxed text-red-700 dark:text-red-300">{s.detail}</span> : null}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        {supportEmail ? (
          <p className="text-center text-xs text-gray-600 dark:text-gray-400">
            Questions? Contact{' '}
            <a href={`mailto:${supportEmail}`} className={`rounded-lg underline-offset-4 hover:underline ${focusRing}`}>
              {supportEmail}
            </a>
          </p>
        ) : null}
      </div>
    </PlainFrame>
  )
}
