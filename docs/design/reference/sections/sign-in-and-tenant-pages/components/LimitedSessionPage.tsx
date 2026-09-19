import { Check } from 'lucide-react'
import { PlainFrame } from './PlainFrame'
import { primaryClass } from './helpers'

export interface LimitedSessionPageProps {
  productName: string
  passwordChanged: boolean
  authenticatorEnrolled: boolean
  /** "Continue setup" returns to the break-glass flow at the first unmet step. */
  onContinueSetup?: () => void
}

/**
 * While must_change_password is true or the authenticator is not enrolled, every router refuses
 * except the endpoints that clear the condition. This is what those refusals render.
 */
export function LimitedSessionPage({ productName, passwordChanged, authenticatorEnrolled, onContinueSetup }: LimitedSessionPageProps) {
  const items = [
    { label: 'Change your temporary password', done: passwordChanged },
    { label: 'Enroll an authenticator app', done: authenticatorEnrolled },
  ]
  return (
    <PlainFrame productName={productName}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">Finish setting up your account</h1>
          <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400">
            Other pages open after the password change and the authenticator enrollment.
          </p>
        </header>
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3.5 py-3 text-sm dark:border-gray-800">
              <span
                aria-hidden
                className={`flex size-5 shrink-0 items-center justify-center rounded-full ${it.done ? 'bg-emerald-500 text-white' : 'border border-gray-300 dark:border-gray-600'}`}
              >
                {it.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
              <span className="sr-only">{it.done ? 'Done:' : 'To do:'}</span>
              <span className={it.done ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}>{it.label}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => onContinueSetup?.()} className={primaryClass}>
          Continue setup
        </button>
      </div>
    </PlainFrame>
  )
}
