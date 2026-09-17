import type { TenantBranding } from '@/../product/sections/sign-in-and-tenant-pages/types'
import { focusRing } from './helpers'

interface AuthFrameProps {
  branding: Pick<
    TenantBranding,
    | 'companyName'
    | 'productName'
    | 'logoLightUrl'
    | 'logoDarkUrl'
    | 'loginBackgroundColor'
    | 'loginBackgroundUrl'
    | 'supportEmail'
    | 'supportUrl'
    | 'termsUrl'
    | 'privacyUrl'
  >
  children: React.ReactNode
}

/**
 * Centered auth surface: a soft tinted page, a rounded white card with a
 * hairline border, the tenant mark in a bordered rounded tile, links under it.
 * Font: Plus Jakarta Sans. Tokens: blue actions, gray neutrals, semantic status colors only.
 */
export function AuthFrame({ branding, children }: AuthFrameProps) {
  const support = branding.supportUrl ?? (branding.supportEmail ? `mailto:${branding.supportEmail}` : null)
  const supportLabel = branding.supportUrl ? 'Support' : branding.supportEmail
  const links = [
    support ? { href: support, label: supportLabel ?? 'Support' } : null,
    branding.termsUrl ? { href: branding.termsUrl, label: 'Terms of use' } : null,
    branding.privacyUrl ? { href: branding.privacyUrl, label: 'Privacy' } : null,
  ].filter((l): l is { href: string; label: string } => l !== null)

  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-(--auth-bg) px-4 py-10 font-[Plus_Jakarta_Sans] text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100"
      // Tenant background color applies in the light theme only. Dark falls back to gray-950.
      style={{ '--auth-bg': branding.loginBackgroundColor } as React.CSSProperties}
    >
      {branding.loginBackgroundUrl ? (
        <img src={branding.loginBackgroundUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" />
      ) : (
        // Soft blue wash from the top so the page is not a flat gray.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[55vh] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(37,99,235,.10),transparent_70%)] dark:bg-[radial-gradient(60%_60%_at_50%_0%,rgba(59,130,246,.16),transparent_70%)]"
        />
      )}

      <div className="relative flex w-full max-w-[440px] flex-col items-center">
        <div className="auth-reveal mb-6 flex flex-col items-center gap-3 text-center" style={{ animationDelay: '0ms' }}>
          <span className="flex size-14 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
            {branding.logoLightUrl || branding.logoDarkUrl ? (
              <>
                <img src={branding.logoLightUrl ?? branding.logoDarkUrl ?? ''} alt="" className="size-9 object-contain dark:hidden" />
                <img src={branding.logoDarkUrl ?? branding.logoLightUrl ?? ''} alt="" className="hidden size-9 object-contain dark:block" />
              </>
            ) : (
              <span aria-hidden className="text-2xl font-extrabold text-blue-700 dark:text-blue-400">
                {branding.companyName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>
          <span className="flex flex-col">
            <span className="text-lg font-bold tracking-tight">{branding.companyName}</span>
            <span className="text-xs text-gray-600 dark:text-gray-400">{branding.productName}</span>
          </span>
        </div>

        <div
          className="auth-reveal w-full rounded-2xl border border-gray-200 bg-white p-7 shadow-[0_8px_30px_-12px_rgba(15,23,42,.12)] sm:p-8 dark:border-gray-800 dark:bg-gray-900"
          style={{ animationDelay: '80ms' }}
        >
          {children}
        </div>

        <div
          className="auth-reveal mt-5 flex w-full flex-col items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
          style={{ animationDelay: '160ms' }}
        >
          <nav aria-label="Legal and support" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {links.map((l) => (
              <a key={l.href} href={l.href} className={`rounded-lg hover:text-gray-900 dark:hover:text-gray-100 ${focusRing}`}>
                {l.label}
              </a>
            ))}
          </nav>
          {/* One deployment serves one customer; the app never inspects the hostname, so the label is the product name. */}
          <span className="text-xs text-gray-500">{branding.productName}</span>
        </div>
      </div>

      <style>{`
        @keyframes auth-reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: no-preference) { .auth-reveal { animation: auth-reveal 200ms ease-out both; } }
      `}</style>
    </div>
  )
}
