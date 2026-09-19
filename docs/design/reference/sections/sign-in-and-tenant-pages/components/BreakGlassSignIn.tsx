import { useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Check, Copy, Eye, EyeOff, Loader2, QrCode, ShieldAlert, Timer } from 'lucide-react'
import type { BreakGlassAdmin, BreakGlassStep, TenantBranding } from '@/../product/sections/sign-in-and-tenant-pages/types'
import { AuthFrame } from './AuthFrame'
import { breakGlassSteps, focusRing, inputClass, labelClass, linkClass, primaryClass, useDelayed } from './helpers'

export interface BreakGlassSignInProps {
  branding: TenantBranding
  admin: BreakGlassAdmin
  /** Which card is shown. The host decides after each callback resolves. */
  step: BreakGlassStep
  /** Inline error for the current step, or null. */
  error?: string | null
  /** The per-deployment rate limit refused the last attempt (DEC-31). Credentials card only: inputs disabled, no retry. */
  tooManyAttempts?: boolean
  /** Step one: email and password submitted. */
  onSubmitCredentials?: (email: string, password: string) => void
  /** Enrolled account, step two: six-digit authenticator code submitted. */
  onSubmitAuthenticatorCode?: (code: string) => void
  /** Forced change: new password submitted. */
  onChangePassword?: (currentPassword: string, newPassword: string) => void
  /** Enrollment: first code from the newly added authenticator app. */
  onConfirmEnrollment?: (code: string) => void
  /** "Use a different account" from the code step returns to step one. */
  onUseDifferentAccount?: () => void
  /** "Member sign-in" link under the card. */
  onGoToMemberSignIn?: () => void
}

/** Deterministic placeholder pattern standing in for a real QR code in the design. */
function FakeQr({ seed }: { seed: string }) {
  const cells: boolean[] = []
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  for (let i = 0; i < 21 * 21; i++) { h = (h * 1103515245 + 12345) >>> 0; cells.push(((h >>> 16) & 1) === 1) }
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7)
  return (
    <svg viewBox="0 0 21 21" role="img" aria-label="QR code for the authenticator app" className="size-40 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700" shapeRendering="crispEdges">
      {cells.map((on, i) => {
        const r = Math.floor(i / 21), c = i % 21
        const f = finder(r, c)
        const fr = r < 7 ? r : r - 14, fc = c < 7 ? c : c - 14
        const fill = f ? (fr === 0 || fr === 6 || fc === 0 || fc === 6 || (fr >= 2 && fr <= 4 && fc >= 2 && fc <= 4)) : on
        return fill ? <rect key={i} x={c} y={r} width={1} height={1} fill="#111827" /> : null
      })}
    </svg>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-300" strokeWidth={1.75} aria-hidden />
      <span>{message}</span>
    </div>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className={`absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 ${focusRing}`}
        >
          {show ? <EyeOff className="size-5" strokeWidth={1.75} /> : <Eye className="size-5" strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  )
}

/**
 * Six one-digit boxes in one labeled group (spec). Auto-advance, backspace steps back, arrows move, paste fills all.
 * Remount it (a new `key`) with `autoFocus` after a wrong code so focus returns to the first box.
 */
function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '')
  const focus = (i: number) => refs.current[Math.max(0, Math.min(5, i))]?.focus()

  const setAt = (i: number, d: string) => {
    const next = digits.slice()
    next[i] = d
    onChange(next.join(''))
  }

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={`${labelClass} mb-1.5 block w-full text-center`}>Authentication code</legend>
      <div className="flex items-center justify-center gap-2">
      {digits.map((d, i) => (
        <span key={i} className="contents">
          {i === 3 ? <span aria-hidden className="mx-0.5 h-px w-3 bg-gray-300 dark:bg-gray-600" /> : null}
          <input
            ref={(el) => {
              refs.current[i] = el
            }}
            aria-label={`Digit ${i + 1} of 6`}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus={autoFocus && i === 0}
            maxLength={1}
            value={d}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '')
              if (!v) return setAt(i, '')
              if (v.length > 1) {
                // Paste or autofill landed here: spread from this box.
                const next = digits.slice()
                for (let k = 0; k < v.length && i + k < 6; k++) next[i + k] = v[k]
                onChange(next.join(''))
                focus(Math.min(5, i + v.length))
                return
              }
              setAt(i, v)
              if (i < 5) focus(i + 1)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !d && i > 0) {
                e.preventDefault()
                setAt(i - 1, '')
                focus(i - 1)
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                focus(i - 1)
              } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                focus(i + 1)
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
              if (!text) return
              e.preventDefault()
              onChange(text)
              focus(text.length)
            }}
            className={`h-11 w-10 rounded-lg border bg-white text-center font-mono text-xl font-semibold text-gray-900 caret-blue-600 dark:bg-gray-950 dark:text-gray-100 ${focusRing} ${
              d ? 'border-gray-700 dark:border-gray-400' : 'border-gray-500 dark:border-gray-500'
            }`}
          />
        </span>
      ))}
      </div>
    </fieldset>
  )
}

/**
 * The shared rule, client side, in the order of admin.passwordPolicy.rules: length, three of four classes, not equal to the email.
 * Rule 4 (not the provisioning password) is checked only on submit and is not scored.
 */
function evaluateRules(pw: string, email: string, min: number) {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length
  return [pw.length >= min, classes >= 3, pw.length > 0 && pw.toLowerCase() !== email.toLowerCase()]
}

export function BreakGlassSignIn({
  branding,
  admin,
  step,
  error = null,
  tooManyAttempts = false,
  onSubmitCredentials,
  onSubmitAuthenticatorCode,
  onChangePassword,
  onConfirmEnrollment,
  onUseDifferentAccount,
  onGoToMemberSignIn,
}: BreakGlassSignInProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [enrollCode, setEnrollCode] = useState('')
  const [copied, setCopied] = useState(false)
  const steps = breakGlassSteps(admin)
  const stepIndex = Math.max(0, steps.indexOf(step)) + 1
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  // A wrong code clears every box (spec). Render-phase reset on a changed error, no effect needed.
  const [seenError, setSeenError] = useState(error)
  if (error !== seenError) {
    setSeenError(error)
    if (error) { setCode(''); setEnrollCode('') }
  }
  const [signingIn, signIn] = useDelayed(() => onSubmitCredentials?.(email, password))
  const [settingPassword, setPassword2] = useDelayed(() => onChangePassword?.(current, next))

  const met = evaluateRules(next, admin.email, admin.passwordPolicy.minLength)
  const score = met.filter(Boolean).length
  const rulesMet = score === met.length
  const confirmOk = next.length > 0 && next === confirm
  const strengthLabel = rulesMet ? 'Meets the rule' : `${score} of ${met.length} rules`
  const strengthTone = rulesMet ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-500'

  return (
    <AuthFrame branding={branding}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              <ShieldAlert className="size-4" strokeWidth={1.75} aria-hidden />
              Administrator
            </span>
            <span className="font-mono text-xs text-gray-500">Step {stepIndex} of {steps.length}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold leading-tight tracking-tight">
              {step === 'credentials' ? 'Administrator sign-in' : step === 'authenticator-code' ? 'Enter your code' : step === 'change-password' ? 'Set a new password' : 'Add an authenticator app'}
            </h1>
            <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400">
              {step === 'credentials'
                ? 'For the tenant break-glass account only. Members sign in with their company account.'
                : step === 'authenticator-code'
                  ? `Open your authenticator app and enter the six-digit code for ${admin.email}.`
                  : step === 'change-password'
                    ? 'Your temporary password must be replaced before you continue.'
                    : 'Scan the code with an authenticator app, then confirm with the code it shows. This account cannot be used without one.'}
            </p>
          </div>
        </header>

        {error ? <ErrorBlock message={error} /> : null}

        {step === 'credentials' ? (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (!tooManyAttempts) signIn()
            }}
          >
            {tooManyAttempts ? (
              <div role="status" className="flex items-start gap-2.5 rounded-lg bg-gray-100 px-3.5 py-3 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                <Timer className="mt-0.5 size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
                <span>Too many sign-in attempts. Try again in {admin.retryAfterMinutes} minutes.</span>
              </div>
            ) : null}
            <fieldset disabled={tooManyAttempts} className="contents">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bg-email" className={labelClass}>
                Email
              </label>
              <input
                id="bg-email"
                type="email"
                autoComplete="username"
                placeholder="breakglass@company.example"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <PasswordField id="bg-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
            <button type="submit" className={`${primaryClass} mt-1`} disabled={!email || !password} aria-busy={signingIn || undefined}>
              {signingIn ? <Loader2 className="size-5 motion-safe:animate-spin" strokeWidth={1.75} aria-hidden /> : null}
              Sign in
            </button>
            </fieldset>
          </form>
        ) : null}

        {step === 'authenticator-code' ? (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              onSubmitAuthenticatorCode?.(code)
            }}
          >
            <div className="flex flex-col gap-1.5">
              <CodeInput key={error ?? ''} value={code} onChange={setCode} autoFocus />
              <p className="text-center text-xs text-gray-600 dark:text-gray-400">Codes change every 30 seconds.</p>
            </div>
            <button type="submit" className={`${primaryClass} mt-1`} disabled={code.length !== 6}>
              Verify
            </button>
            <button
              type="button"
              onClick={() => onUseDifferentAccount?.()}
              className={`inline-flex items-center justify-center gap-1.5 ${linkClass}`}
            >
              <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
              Use a different account
            </button>
          </form>
        ) : null}

        {step === 'change-password' ? (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              setPassword2()
            }}
          >
            <PasswordField id="bg-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
            <div className="flex flex-col gap-2">
              <PasswordField id="bg-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
              <div className="flex items-center gap-2" aria-live="polite">
                <div className="flex flex-1 gap-1">
                  {met.map((_, i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? strengthTone : 'bg-gray-200 dark:bg-gray-800'}`} />
                  ))}
                </div>
                <span role="status" aria-live="polite" className="w-28 text-right text-xs font-medium text-gray-600 dark:text-gray-400">{next ? strengthLabel : ''}</span>
              </div>
              <ul className="flex flex-col gap-1 rounded-lg bg-gray-50 px-3.5 py-3 text-sm text-gray-700 dark:bg-gray-950/60 dark:text-gray-300">
                {admin.passwordPolicy.rules.map((rule, i) => {
                  const deferred = i >= met.length
                  const ok = !deferred && met[i]
                  return (
                    <li key={rule} className="flex items-center gap-2">
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-emerald-500 text-white' : deferred ? 'bg-gray-200 dark:bg-gray-700' : 'border border-gray-300 dark:border-gray-600'}`}
                        aria-hidden
                      >
                        {ok ? <Check className="size-4" strokeWidth={2.5} /> : null}
                      </span>
                      <span className="sr-only">{deferred ? 'Checked when you save:' : ok ? 'Met:' : 'Not met:'}</span>
                      <span>{rule}{deferred ? <span className="text-xs text-gray-500 dark:text-gray-400"> · Checked when you save</span> : null}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
            <PasswordField id="bg-confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {confirm && !confirmOk ? <p className="-mt-2 text-xs text-red-600 dark:text-red-300">Passwords do not match.</p> : null}
            <button type="submit" className={`${primaryClass} mt-1`} disabled={!current || !rulesMet || !confirmOk} aria-busy={settingPassword || undefined}>
              {settingPassword ? <Loader2 className="size-5 motion-safe:animate-spin" strokeWidth={1.75} aria-hidden /> : null}
              Set password and continue
            </button>
            <p className="text-center text-xs text-gray-600 dark:text-gray-400">Until enrollment is complete, every other page brings you back here.</p>
          </form>
        ) : null}

        {step === 'authenticator-enroll' ? (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              onConfirmEnrollment?.(enrollCode)
            }}
          >
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <FakeQr seed={admin.enrollment.otpauthUri} />
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                <p className="flex items-start gap-1.5 text-gray-700 dark:text-gray-300"><QrCode className="mt-0.5 size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />Scan with any authenticator app. Cannot scan? Enter this key by hand.</p>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
                  <code className="flex-1 font-mono text-sm tracking-wider">{admin.enrollment.manualKey}</code>
                  <button type="button" aria-label={copied ? 'Key copied' : 'Copy key'} onClick={() => { void navigator.clipboard?.writeText(admin.enrollment.manualKey.replace(/\s/g, '')); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className={`-my-1 -mr-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900 ${focusRing}`}>{copied ? <Check className="size-5 text-emerald-600" strokeWidth={2} /> : <Copy className="size-5" strokeWidth={1.75} />}</button>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Issuer {admin.enrollment.issuer} · account {admin.email}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <CodeInput key={error ?? ''} value={enrollCode} onChange={setEnrollCode} autoFocus={Boolean(error)} />
              <p className="text-center text-xs text-gray-600 dark:text-gray-400">Enter the current code to prove the app is set up.</p>
            </div>
            <button type="submit" className={`${primaryClass} mt-1`} disabled={enrollCode.length !== 6}>
              Confirm and open the console
            </button>
            <p className="text-center text-xs text-gray-600 dark:text-gray-400">Until enrollment is complete, every other page brings you back here.</p>
          </form>
        ) : null}

        <button
          type="button"
          onClick={() => onGoToMemberSignIn?.()}
          className={`self-center rounded-lg text-sm text-gray-600 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-gray-100 ${focusRing}`}
        >
          Member sign-in
        </button>
      </div>
    </AuthFrame>
  )
}
