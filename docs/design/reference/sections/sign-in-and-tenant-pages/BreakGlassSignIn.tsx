import { useState } from 'react'
import data from '@/../product/sections/sign-in-and-tenant-pages/data.json'
import type { BreakGlassAdmin, BreakGlassStep, TenantBranding } from '@/../product/sections/sign-in-and-tenant-pages/types'
import { BreakGlassSignIn } from './components/BreakGlassSignIn'
import { breakGlassSteps } from './components/helpers'

const FONTS =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap'

const branding = data.tenantBranding as TenantBranding
const seeded = data.breakGlassAdmin as BreakGlassAdmin

export default function BreakGlassSignInPreview() {
  // Preview only: ?step=<step>&error=1&limited=1&enrolled=1 pick the card for screenshots.
  // Default data is a first sign-in (credentials, change-password, enroll). ?enrolled=1 shows the enrolled door (credentials, code).
  const params = new URLSearchParams(window.location.search)
  const admin: BreakGlassAdmin = params.get('enrolled') === '1' ? { ...seeded, mustChangePassword: false, mustEnrollAuthenticator: false } : seeded
  const steps = breakGlassSteps(admin)
  const wanted = params.get('step') as BreakGlassStep | null
  const initialStep = wanted && steps.includes(wanted) ? wanted : 'credentials'
  const [step, setStep] = useState<BreakGlassStep>(initialStep)
  const [limited, setLimited] = useState(params.get('limited') === '1')
  const [error, setError] = useState<string | null>(
    params.get('error') === '1' ? (initialStep === 'credentials' ? admin.errors.credentials : initialStep === 'change-password' ? admin.errors.notAdmin : admin.errors.code) : null,
  )

  const go = (s: BreakGlassStep) => {
    setStep(s)
    setError(null)
  }
  const after = (s: BreakGlassStep) => steps[steps.indexOf(s) + 1] ?? 'credentials'

  return (
    <>
      <link rel="stylesheet" href={FONTS} />
      <BreakGlassSignIn
        key={step}
        branding={branding}
        admin={admin}
        step={step}
        error={error}
        tooManyAttempts={limited}
        onSubmitCredentials={(email, pw) => {
          console.log('Credentials:', email, pw.length)
          go(after('credentials'))
        }}
        onSubmitAuthenticatorCode={(code) => {
          console.log('Code:', code)
          go(after('authenticator-code'))
        }}
        onChangePassword={(cur, next) => {
          console.log('Change password:', cur.length, next.length)
          go(after('change-password'))
        }}
        onConfirmEnrollment={(code) => {
          console.log('Enrollment code:', code)
          go('credentials')
        }}
        onUseDifferentAccount={() => go('credentials')}
        onGoToMemberSignIn={() => console.log('Go to member sign-in')}
      />
      {/* Preview-only switcher. Not part of the exported component. Hidden with ?shot=1 for screenshots. */}
      <div hidden={params.get('shot') === '1'} className="fixed bottom-3 right-3 z-50 flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 font-mono text-xs uppercase tracking-[0.08em] text-gray-500 shadow-lg">
        {steps.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => go(s)}
            className={`rounded-lg px-2 py-1 ${s === step ? 'bg-blue-50 text-blue-700' : 'hover:text-gray-900'}`}
          >
            {s}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <button
          type="button"
          onClick={() =>
            setError((e) =>
              e ? null : step === 'credentials' ? admin.errors.credentials : step === 'authenticator-code' || step === 'authenticator-enroll' ? admin.errors.code : admin.errors.notAdmin,
            )
          }
          className={`rounded-lg px-2 py-1 ${error ? 'bg-red-50 text-red-700' : 'hover:text-gray-900'}`}
        >
          error
        </button>
        <button
          type="button"
          onClick={() => setLimited((v) => !v)}
          className={`rounded-lg px-2 py-1 ${limited ? 'bg-blue-50 text-blue-700' : 'hover:text-gray-900'}`}
        >
          limited
        </button>
      </div>
    </>
  )
}
