import { goTo } from '@/shell/components/routes'
import { useState } from 'react'
import data from '@/../product/sections/sign-in-and-tenant-pages/data.json'
import type { SignInState, SignInStateId, SignInTenantSettings, TenantBranding } from '@/../product/sections/sign-in-and-tenant-pages/types'
import { SignInPage } from './components/SignInPage'

const FONTS =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap'

const branding = data.tenantBranding as TenantBranding
const settings = data.tenantSettings as SignInTenantSettings
const states = data.signInStates as SignInState[]

export default function SignInPagePreview() {
  // Preview only: ?state=<id>&local=1&notice=0 pick the variant for screenshots.
  const params = new URLSearchParams(window.location.search)
  const [stateId, setStateId] = useState<SignInStateId>((params.get('state') as SignInStateId | null) ?? 'default')
  const [withNotice, setWithNotice] = useState(params.get('notice') !== '0')
  const [localAccounts, setLocalAccounts] = useState(params.get('local') === '1')
  const state = states.find((s) => s.id === stateId) ?? states[0]
  const b = withNotice ? branding : { ...branding, loginNoticeText: null }
  const s: SignInTenantSettings = localAccounts
    ? { ...settings, localAccountsEnabled: true, forgotPasswordUrl: 'https://id.genie.example/realms/meridian/reset-credentials' }
    : settings

  return (
    <>
      <link rel="stylesheet" href={FONTS} />
      <SignInPage
        key={`${stateId}-${withNotice}-${localAccounts}`}
        branding={b}
        tenantSettings={s}
        signInState={state}
        onContinueWithCompanyAccount={() => goTo('/')}
        onAcknowledgeNotice={(v) => console.log('Acknowledged notice:', v)}
      />
      {/* Preview-only variant switcher. Not part of the exported component. Hidden with ?shot=1 for screenshots. */}
      <div hidden={params.get('shot') === '1'} className="fixed bottom-3 right-3 z-50 flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 font-mono text-xs uppercase tracking-[0.08em] text-gray-500 shadow-lg">
        {states.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStateId(s.id)}
            className={`rounded-lg px-2 py-1 ${s.id === stateId ? 'bg-gray-100 text-gray-900' : 'hover:text-gray-900'}`}
          >
            {s.id}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <button
          type="button"
          onClick={() => setWithNotice((v) => !v)}
          className={`rounded-lg px-2 py-1 ${withNotice ? 'bg-gray-100 text-gray-900' : 'hover:text-gray-900'}`}
        >
          notice
        </button>
        <button
          type="button"
          onClick={() => setLocalAccounts((v) => !v)}
          className={`rounded-lg px-2 py-1 ${localAccounts ? 'bg-gray-100 text-gray-900' : 'hover:text-gray-900'}`}
        >
          local accounts
        </button>
      </div>
    </>
  )
}
