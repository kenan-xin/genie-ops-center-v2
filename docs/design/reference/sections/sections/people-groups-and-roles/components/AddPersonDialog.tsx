import { useState } from 'react'
import { Info } from 'lucide-react'
import type { AccountType, NewPersonInput, Role, TenantSettingsSummary } from '@/../product/sections/people-groups-and-roles/types'
import { btnPrimary, btnSecondary, focusRing, inputClass, labelClass } from './helpers'
import { Dialog, LoadingButton, Pill } from './ui'

export interface AddPersonDialogProps {
  open: boolean
  onClose: () => void
  roles: Role[]
  settings: TenantSettingsSummary
  onSubmit?: (input: NewPersonInput) => void
  /** DEC-31: add person is rate limited per deployment. When set, the dialog shows the refusal and disables submit. */
  rateLimited?: { retryAfterMinutes: number }
}

const choice = (on: boolean) => `inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium motion-safe:transition-colors ${focusRing} ${on ? 'border-blue-600 bg-gray-100 text-gray-900 dark:border-blue-400 dark:bg-gray-800 dark:text-gray-100' : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`

export function AddPersonDialog({ open, onClose, roles, settings, onSubmit, rateLimited }: AddPersonDialogProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [roleIds, setRoleIds] = useState<string[]>([])
  const [accountType, setAccountType] = useState<AccountType>('brokered')
  const [touched, setTouched] = useState(false)
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  const local = settings.localAccountsEnabled && accountType === 'local'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add person"
      description={local ? 'They sign in with a password held in this tenant. Roles you pick now apply at first sign-in.' : `They sign in with their ${settings.identitySource} account. Roles you pick now apply at first sign-in.`}
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <LoadingButton
            className={btnPrimary}
            disabled={!emailOk || !!rateLimited}
            onPress={() => { onSubmit?.({ email, name: name || undefined, roleIds, accountType: local ? 'local' : 'brokered' }); onClose() }}
          >
            Add person
          </LoadingButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {rateLimited ? (
          <p role="status" className="rounded-xl bg-gray-50 px-3.5 py-3 text-sm text-gray-700 dark:bg-gray-950/60 dark:text-gray-300">Too many people added in a short time. Try again in {rateLimited.retryAfterMinutes} minutes.</p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ap-email" className={labelClass}>Work email</label>
          <input id="ap-email" type="email" autoFocus value={email} onBlur={() => setTouched(true)} onChange={(e) => setEmail(e.target.value)} placeholder="name@meridianhealth.example" aria-invalid={touched && email && !emailOk ? true : undefined} aria-describedby={touched && email && !emailOk ? 'ap-email-error' : undefined} className={inputClass} />
          {touched && email && !emailOk ? <p id="ap-email-error" className="text-xs text-red-700 dark:text-red-300">Enter a valid email address.</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ap-name" className={labelClass}>Display name <span className="font-normal text-gray-500">(optional)</span></label>
          <input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={local ? 'Shown until they set one' : 'Filled from the directory at first sign-in'} className={inputClass} />
        </div>
        {settings.localAccountsEnabled ? (
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Account</span>
            <div role="radiogroup" aria-label="Account type" className="flex flex-wrap gap-2">
              <button type="button" role="radio" aria-checked={accountType === 'brokered'} onClick={() => setAccountType('brokered')} className={choice(accountType === 'brokered')}>{settings.identitySource}</button>
              <button type="button" role="radio" aria-checked={accountType === 'local'} onClick={() => setAccountType('local')} className={choice(accountType === 'local')}>Local password</button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">The account type cannot be changed later.</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Roles now <span className="font-normal text-gray-500">(optional)</span></span>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => {
              const on = roleIds.includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setRoleIds((s) => (on ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium motion-safe:transition-colors ${focusRing} ${on ? 'border-blue-600 bg-gray-100 text-gray-900 dark:border-blue-400 dark:bg-gray-800 dark:text-gray-100' : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`}
                >
                  {r.name}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">Tenant-wide. Scoped access is added later from the person or the role.</p>
        </div>
        <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3.5 py-3 text-sm text-gray-700 dark:bg-gray-950/60 dark:text-gray-300">
          <Info className="mt-0.5 size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
          <span>
            {settings.onboardingMode === 'jit' && !local ? (
              <>People in your identity provider can also sign in without being added here. Adding someone now lets you assign roles before their first sign-in; they show as <Pill>Pending</Pill> until then.</>
            ) : (
              <>The person shows as <Pill>Pending</Pill> until their first sign-in.</>
            )}
            {local ? ' The realm sends a set-password email to this address; there is no manual activation.' : settings.onboardingMode === 'jit' ? '' : ` Make sure that they are assigned to Genie in ${settings.identitySource}.`}
          </span>
        </div>
      </div>
    </Dialog>
  )
}
