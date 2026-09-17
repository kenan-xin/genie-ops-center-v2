import { useState } from 'react'
import { ArrowRight, Check, Info, Loader2, ShieldCheck } from 'lucide-react'
import type { SignInState, SignInTenantSettings, TenantBranding } from '@/../product/sections/sign-in-and-tenant-pages/types'
import { AuthFrame } from './AuthFrame'
import { focusRing, linkClass, primaryClass, useDelayed } from './helpers'

export interface SignInPageProps {
  branding: TenantBranding
  tenantSettings: SignInTenantSettings
  signInState: SignInState
  /** Member presses the continue button. Sends them to the tenant realm. */
  onContinueWithCompanyAccount?: () => void
  /** Member ticks or unticks the system-use notice acknowledgement. */
  onAcknowledgeNotice?: (acknowledged: boolean) => void
}

export function SignInPage({
  branding,
  tenantSettings,
  signInState,
  onContinueWithCompanyAccount,
  onAcknowledgeNotice,
}: SignInPageProps) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, go] = useDelayed(() => onContinueWithCompanyAccount?.())
  const notice = branding.loginNoticeText
  const gated = Boolean(notice && branding.loginNoticeRequiresAcknowledgement)
  const canContinue = !gated || acknowledged
  const local = tenantSettings.localAccountsEnabled
  const banner = signInState.banner
  const bannerText =
    signInState.id === 'session-expired'
      ? `Your session expired after ${tenantSettings.sessionIdleMinutes} minutes of inactivity. Sign in again to continue.`
      : banner?.text
  const bannerWarning = banner?.tone === 'warning'

  return (
    <AuthFrame branding={branding}>
      <div className="flex flex-col gap-6">
        {banner ? (
          <div
            role={bannerWarning ? 'alert' : 'status'}
            className={
              bannerWarning
                ? 'flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                : 'flex items-start gap-2.5 rounded-xl bg-blue-50 px-3.5 py-3 text-sm text-blue-900 dark:bg-blue-950/50 dark:text-blue-100'
            }
          >
            <Info
              className={bannerWarning ? 'mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300' : 'mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400'}
              strokeWidth={1.75}
              aria-hidden
            />
            <span>{bannerText}</span>
          </div>
        ) : null}

        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">Sign in</h1>
          <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400">{branding.loginWelcomeText}</p>
        </header>

        {notice ? (
          <section aria-labelledby="notice-heading" className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/50">
            <div className="flex items-center gap-2 px-4 pt-3.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-200/70 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <Info aria-hidden className="size-4" strokeWidth={1.75} />
                Notice
              </span>
              <h2 id="notice-heading" className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                System use
              </h2>
            </div>
            <p className="px-4 pb-4 pt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{notice}</p>
            {gated ? (
              <label className="flex cursor-pointer items-center gap-3 border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-800">
                <span className="relative flex size-5 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => {
                      setAcknowledged(e.target.checked)
                      onAcknowledgeNotice?.(e.target.checked)
                    }}
                    className={`peer size-5 appearance-none rounded-md border border-gray-500 bg-white motion-safe:transition-colors checked:border-blue-600 checked:bg-blue-600 dark:border-gray-500 dark:bg-gray-900 ${focusRing}`}
                  />
                  <Check
                    aria-hidden
                    strokeWidth={3}
                    className="pointer-events-none absolute size-4 text-white opacity-0 peer-checked:opacity-100"
                  />
                </span>
                <span className="text-gray-800 dark:text-gray-200">I acknowledge these conditions.</span>
              </label>
            ) : null}
          </section>
        ) : null}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={!canContinue}
            aria-busy={loading || undefined}
            onClick={go}
            className={`group ${primaryClass}`}
          >
            {local ? 'Continue to sign in' : 'Continue with your company account'}
            {loading ? (
              <Loader2 className="size-5 motion-safe:animate-spin" strokeWidth={1.75} aria-hidden />
            ) : (
              <ArrowRight className="size-5 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5 group-disabled:translate-x-0" strokeWidth={1.75} aria-hidden />
            )}
          </button>
          {local && tenantSettings.forgotPasswordUrl ? (
            <a
              href={tenantSettings.forgotPasswordUrl}
              className={`self-center underline-offset-4 ${linkClass}`}
            >
              Forgot your password?
            </a>
          ) : null}
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            <ShieldCheck className="mt-px size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
            <span>
              {local
                ? `Your ${branding.companyName} account is managed by your workspace administrator. Genie never sees your password.`
                : `You sign in through ${branding.companyName}. Genie never sees your password.`}
            </span>
          </p>
        </div>
      </div>
    </AuthFrame>
  )
}
