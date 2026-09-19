import { goTo } from '@/shell/components/routes'
import data from '@/../product/sections/sign-in-and-tenant-pages/data.json'
import type { TenantBranding } from '@/../product/sections/sign-in-and-tenant-pages/types'
import { LimitedSessionPage } from './components/LimitedSessionPage'

const FONTS = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap'

const branding = data.tenantBranding as TenantBranding

export default function LimitedSessionPagePreview() {
  // Preview only: ?done=password marks the password change as done; default is neither.
  const done = new URLSearchParams(window.location.search).get('done')
  return (
    <>
      <link rel="stylesheet" href={FONTS} />
      <LimitedSessionPage
        productName={branding.productName}
        passwordChanged={done === 'password'}
        authenticatorEnrolled={false}
        onContinueSetup={() => goTo('/admin/login')}
      />
    </>
  )
}
