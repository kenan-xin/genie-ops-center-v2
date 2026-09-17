import { useEffect, useState } from 'react'
import data from '@/../product/sections/account-and-inbox/data.json'
import type { AccountUser, Group, Preference, RoleGrant, Session } from '@/../product/sections/account-and-inbox/types'
import { AccountPage } from './components/AccountPage'

export default function AccountPagePreview() {
  const [sessions, setSessions] = useState(data.sessions as Session[])
  const [preference, setPreference] = useState(data.preference as Preference)
  const breakGlass = new URLSearchParams(window.location.search).get('breakglass') === '1'
  // Preview only: /account#sessions (the link in a new-sign-in notification) scrolls the shell's main area to the block.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  return (
    <AccountPage
      user={(breakGlass ? data.breakGlassUser : data.user) as AccountUser}
      passwordPolicy={data.passwordPolicy}
      authenticatorEnrolledAt={data.authenticatorEnrolledAt}
      onChangeBreakGlassPassword={(c, n) => console.log('Change break-glass password', c.length, n.length)}
      onReenrollAuthenticator={() => console.log('Re-enroll authenticator')}
      groups={data.groups as Group[]}
      sessions={sessions}
      preference={preference}
      roleGrants={data.roleGrants as RoleGrant[]}
      accountManagementUrl={new URLSearchParams(window.location.search).get('local') === '1' ? data.tenantSupport.accountManagementUrl : null}
      onRevokeSession={(id) => {
        console.log('Revoke session:', id)
        setSessions((s) => s.filter((x) => x.id !== id))
      }}
      onRevokeOtherSessions={() => {
        console.log('Revoke other sessions')
        setSessions((s) => s.filter((x) => x.isCurrent))
      }}
      onChangePreference={(key, value) => {
        console.log('Preference:', key, value)
        setPreference((p) => ({ ...p, [key]: value }))
      }}
    />
  )
}
