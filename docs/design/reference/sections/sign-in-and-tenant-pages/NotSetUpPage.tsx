import data from '@/../product/sections/sign-in-and-tenant-pages/data.json'
import type { SetupStep, TenantBranding } from '@/../product/sections/sign-in-and-tenant-pages/types'
import { NotSetUpPage } from './components/NotSetUpPage'

const FONTS = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap'

const branding = data.tenantBranding as TenantBranding
const steps = data.setupSteps as SetupStep[]

export default function NotSetUpPagePreview() {
  // Preview only: ?fresh=1 shows a brand-new deployment (all pending, branding not seeded so no support line).
  const fresh = new URLSearchParams(window.location.search).get('fresh') === '1'
  const shown = fresh ? steps.map((s) => ({ ...s, state: 'pending' as const, detail: null })) : steps
  return (
    <>
      <link rel="stylesheet" href={FONTS} />
      <NotSetUpPage productName={branding.productName} steps={shown} supportEmail={fresh ? null : branding.supportEmail} />
    </>
  )
}
