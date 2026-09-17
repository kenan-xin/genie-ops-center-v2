import { useEffect, useState } from 'react'
import data from '@/../product/sections/account-and-inbox/data.json'
import type { IdleTimeout } from '@/../product/sections/account-and-inbox/types'
import { IdleTimeoutModal } from './components/IdleTimeoutModal'

export default function IdleTimeoutModalPreview() {
  const [idle, setIdle] = useState(data.idleTimeout as IdleTimeout)

  // Preview only: counts down once a second. In the product the modal appears only after real inactivity;
  // pointer, keyboard, and touch activity extends the server session silently, throttled to half the idle window.
  useEffect(() => {
    const t = setInterval(() => setIdle((i) => (i.secondsLeft > 0 && i.isWarning ? { ...i, secondsLeft: i.secondsLeft - 1 } : i)), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <>
      <div className="rounded-2xl border border-dashed border-gray-200 p-8 dark:border-gray-800">
        <h2 className="mb-1 text-lg font-bold tracking-tight">Solutions</h2>
        <p className="max-w-prose text-sm text-gray-600 dark:text-gray-400">The page the person was on dims behind the dialog.</p>
      </div>
      <IdleTimeoutModal
        idleTimeout={idle}
        onStaySignedIn={() => {
          console.log('Stay signed in')
          setIdle((i) => ({ ...i, secondsLeft: data.idleTimeout.secondsLeft }))
        }}
        onSignOutNow={() => {
          console.log('Sign out now')
          setIdle((i) => ({ ...i, isWarning: false }))
        }}
      />
    </>
  )
}
