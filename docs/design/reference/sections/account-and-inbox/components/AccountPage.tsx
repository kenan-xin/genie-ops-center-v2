import { useCallback, useState } from 'react'
import { Building2, Check, ChevronDown, ExternalLink, Eye, EyeOff, KeyRound, Laptop, LogOut, Monitor, RotateCcw, ShieldCheck, Smartphone } from 'lucide-react'
import type { AccountUser, Group, Preference, RoleGrant, Session, ThemeChoice } from '@/../product/sections/account-and-inbox/types'
import { Card, ConfirmDialog, MonoChip, Pill, Toasts, type ToastItem } from './ui'
import { btnPrimary, btnSecondary, evaluatePassword, focusRing, initials, inputClass, relativeTime } from './helpers'

export interface AccountPageProps {
  user: AccountUser
  groups: Group[]
  sessions: Session[]
  preference: Preference
  roleGrants: RoleGrant[]
  /** Sign out one non-current session. */
  onRevokeSession?: (sessionId: string) => void
  /** Sign out every session except the current one. */
  onRevokeOtherSessions?: () => void
  /** Save one preference. Pass null to return to the tenant default. */
  onChangePreference?: (key: 'locale' | 'timeZone' | 'theme', value: string | null) => void
  /** Local-account tenants only: the realm's account page for password changes. */
  accountManagementUrl?: string | null
  /** Break-glass variant: the shared password rule shown as met or unmet. */
  passwordPolicy?: { minLength: number; rules: string[] }
  /** Break-glass variant: when the authenticator was enrolled. */
  authenticatorEnrolledAt?: string | null
  onChangeBreakGlassPassword?: (currentPassword: string, newPassword: string) => void
  onReenrollAuthenticator?: () => void
}

const labelClass = 'text-sm font-semibold text-gray-800 dark:text-gray-200'

function PasswordInput({ id, label, value, onChange, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>{label}</label>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} pr-11`} />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className={`absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-xl text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 ${focusRing}`}>{show ? <EyeOff className="size-5" strokeWidth={1.75} /> : <Eye className="size-5" strokeWidth={1.75} />}</button>
      </div>
    </div>
  )
}

function DeviceIcon({ device }: { device: string }) {
  const cls = 'size-4 text-gray-500'
  if (/iphone|android|phone/i.test(device)) return <Smartphone className={cls} strokeWidth={1.75} aria-hidden />
  if (/mac|laptop/i.test(device)) return <Laptop className={cls} strokeWidth={1.75} aria-hidden />
  return <Monitor className={cls} strokeWidth={1.75} aria-hidden />
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' })
}

function Select({ value, onChange, children, label }: { value: string; onChange: (v: string) => void; children: React.ReactNode; label: string }) {
  return (
    <div className="relative">
      <select aria-label={label} className={`${inputClass} appearance-none pr-10`} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
      <ChevronDown aria-hidden strokeWidth={1.75} className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" />
    </div>
  )
}

function Field({ label, defaultLabel, overridden, onReset, children }: { label: string; defaultLabel: string; overridden: boolean; onReset: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className={labelClass}>{label}</span>
        {overridden ? (
          <button type="button" onClick={onReset} className={`inline-flex items-center gap-1 rounded-lg text-xs font-medium text-blue-700 hover:underline dark:text-blue-300 ${focusRing}`}>
            <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
            Use tenant default
          </button>
        ) : null}
      </div>
      {children}
      <span className="text-xs text-gray-600 dark:text-gray-400">Tenant default: {defaultLabel}</span>
    </div>
  )
}

type Confirm = { kind: 'all' } | { kind: 'one'; session: Session } | null

export function AccountPage({ user, groups, sessions, preference, roleGrants, onRevokeSession, onRevokeOtherSessions, onChangePreference, accountManagementUrl, passwordPolicy, authenticatorEnrolledAt, onChangeBreakGlassPassword, onReenrollAuthenticator }: AccountPageProps) {
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const breakGlass = Boolean(user.isBreakGlass)
  const met = evaluatePassword(next, user.email, passwordPolicy?.minLength ?? 14)
  const pwOk = met.every(Boolean) && next === confirmPw && cur.length > 0
  const ordered = sessions.slice().sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent))
  const others = sessions.filter((s) => !s.isCurrent)
  const d = preference.tenantDefaults
  const localeLabel = (code: string) => preference.availableLocales.find((l) => l.code === code)?.label ?? code
  const themeLabel: Record<ThemeChoice, string> = { light: 'Light', dark: 'Dark', system: 'System' }
  const theme = preference.theme ?? d.theme
  const prefLabel = { locale: 'Language', timeZone: 'Time zone', theme: 'Theme' }

  const toast = (text: string) => setToasts((t) => [...t, { id: Date.now() + Math.random(), text }])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const closeConfirm = useCallback(() => setConfirm(null), [])
  const changePref = (key: 'locale' | 'timeZone' | 'theme', value: string | null) => {
    onChangePreference?.(key, value)
    toast(value === null ? `${prefLabel[key]} reset to the tenant default.` : `${prefLabel[key]} saved.`)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-8">
      <Card title="Profile" description={breakGlass ? 'Local administrator account. Password and authenticator are managed on this page.' : 'Synced from your company directory at each sign-in.'}>
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-start sm:px-6">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="size-16 rounded-full object-cover" />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">{initials(user.name)}</span>
          )}
          <dl className="grid flex-1 grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-600 dark:text-gray-400">Name</dt>
              <dd className="mt-0.5 text-base font-semibold">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-600 dark:text-gray-400">Email</dt>
              <dd className="mt-0.5 text-base">{user.email}</dd>
            </div>
            {breakGlass ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-gray-600 dark:text-gray-400">Identity</dt>
                <dd className="mt-0.5 text-base">{user.identitySource}</dd>
              </div>
            ) : (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-gray-600 dark:text-gray-400">Groups</dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {groups.map((g) => (
                    <Pill key={g.id} tone={g.source === 'idp' ? 'gray' : 'blue'}>
                      {g.source === 'idp' ? <Building2 className="size-4" strokeWidth={1.75} aria-hidden /> : null}
                      {g.name}
                    </Pill>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-3 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-gray-800 dark:text-gray-400">
          <p>{breakGlass ? 'This account belongs to the tenant, not to a person. It is hidden from People and appears only in the audit log.' : `Name, email, and directory groups come from ${user.identitySource}. Change them there, not in Genie. Last synced ${relativeTime(user.lastSyncedAt)}.`}</p>
          {accountManagementUrl && !breakGlass ? (
            <a href={accountManagementUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg font-semibold text-blue-700 hover:underline sm:min-h-0 dark:text-blue-300 ${focusRing}`}>
              <KeyRound className="size-4" strokeWidth={1.75} aria-hidden />Change password<ExternalLink className="size-4" strokeWidth={1.75} aria-label="Opens in a new tab" />
            </a>
          ) : null}
        </div>
      </Card>

      {breakGlass ? (
        <Card title="Change password" description="The shared rule applies. Your current password is required.">
          <form className="flex flex-col gap-4 px-5 py-5 sm:px-6" onSubmit={(e) => { e.preventDefault(); if (!pwOk) return; onChangeBreakGlassPassword?.(cur, next); setCur(''); setNext(''); setConfirmPw(''); toast('Password changed.') }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PasswordInput id="bg-cur" label="Current password" value={cur} onChange={setCur} autoComplete="current-password" />
              <div />
              <PasswordInput id="bg-next" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
              <PasswordInput id="bg-confirm" label="Confirm new password" value={confirmPw} onChange={setConfirmPw} autoComplete="new-password" />
            </div>
            <ul aria-live="polite" className="grid grid-cols-1 gap-1.5 rounded-xl bg-gray-50 px-3.5 py-3 text-sm text-gray-700 sm:grid-cols-2 dark:bg-gray-950/60 dark:text-gray-300">
              {(passwordPolicy?.rules ?? []).map((rule, i) => {
                const deferred = i >= met.length
                const ok = !deferred && met[i] && next.length > 0
                return (
                  <li key={rule} className="flex items-center gap-2">
                    <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-emerald-500 text-white' : deferred ? 'bg-gray-200 dark:bg-gray-700' : 'border border-gray-300 dark:border-gray-600'}`}>{ok ? <Check className="size-4" strokeWidth={2.5} /> : null}</span>
                    <span>{rule}{deferred ? <span className="text-xs text-gray-500 dark:text-gray-400"> · Checked when you save</span> : null}</span>
                  </li>
                )
              })}
            </ul>
            {confirmPw && next !== confirmPw ? <p role="alert" className="text-xs text-red-700 dark:text-red-300">Passwords do not match.</p> : null}
            <div><button type="submit" className={btnPrimary} disabled={!pwOk}>Save password</button></div>
          </form>
        </Card>
      ) : null}

      {breakGlass ? (
        <Card title="Authenticator" description="Required at every sign-in. Re-enroll if you change phones.">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><ShieldCheck className="size-5" strokeWidth={1.75} aria-hidden /></span><div><div className="text-sm font-semibold">Authenticator app enrolled</div><div className="text-xs text-gray-600 dark:text-gray-400">{authenticatorEnrolledAt ? `Since ${fmt(authenticatorEnrolledAt)}` : 'Enrollment date unknown'}. Re-enrolling replaces the current app and asks for a code from the new one.</div></div></div>
            <button type="button" className={btnSecondary} onClick={() => onReenrollAuthenticator?.()}><RotateCcw className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Re-enroll</button>
          </div>
        </Card>
      ) : null}

      <Card
        id="sessions"
        title="Sessions"
        description="Where you are signed in right now."
        action={
          others.length > 0 ? (
            <button type="button" className={btnSecondary} onClick={() => setConfirm({ kind: 'all' })}>
              <LogOut className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />
              Sign out all other sessions
            </button>
          ) : null
        }
      >
        {/* Phone: card list, current session first. */}
        <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
          {ordered.map((s) => (
            <li key={s.id} className="flex items-start gap-3 p-4">
              <span className="mt-0.5"><DeviceIcon device={s.device} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{s.device}</span>{s.isCurrent ? <MonoChip>This device</MonoChip> : null}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{s.browser} · <code className="font-mono">{s.ipAddress}</code></div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Signed in {fmt(s.signedInAt)} · {s.isCurrent ? 'Active now' : `Active ${relativeTime(s.lastActiveAt)}`}</div>
              </div>
              {s.isCurrent ? null : <button type="button" className={`${btnSecondary} h-11`} onClick={() => setConfirm({ kind: 'one', session: s })}>Sign out</button>}
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-600 dark:bg-gray-950/60 dark:text-gray-400">
                <th className="px-5 py-2.5 font-semibold sm:px-6">Device</th>
                <th className="px-3 py-2.5 font-semibold">IP address</th>
                <th className="px-3 py-2.5 font-semibold">Signed in</th>
                <th className="px-3 py-2.5 font-semibold">Last active</th>
                <th className="px-5 py-2.5 sm:px-6"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((s) => (
                <tr key={s.id} className="border-t border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60">
                  <td className="px-5 py-3 sm:px-6">
                    <div className="flex items-center gap-2.5">
                      <DeviceIcon device={s.device} />
                      <div>
                        <div className="font-medium">{s.device}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">{s.browser}</div>
                      </div>
                      {s.isCurrent ? <MonoChip>This device</MonoChip> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{s.ipAddress}</td>
                  <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{fmt(s.signedInAt)}</td>
                  <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{s.isCurrent ? 'Now' : relativeTime(s.lastActiveAt)}</td>
                  <td className="px-5 py-3 text-right sm:px-6">
                    {s.isCurrent ? null : (
                      <button type="button" className={btnSecondary} onClick={() => setConfirm({ kind: 'one', session: s })}>Sign out</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {breakGlass ? null : (
      <Card title="Preferences" description="Your overrides of the tenant defaults. Saved as you change them.">
        <div className="grid grid-cols-1 gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
          {preference.availableLocales.length > 1 ? (
            <Field label="Language" defaultLabel={localeLabel(d.locale)} overridden={preference.locale !== null} onReset={() => changePref('locale', null)}>
              <Select label="Language" value={preference.locale ?? d.locale} onChange={(v) => changePref('locale', v)}>
                {preference.availableLocales.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field label="Time zone" defaultLabel={d.timeZone} overridden={preference.timeZone !== null} onReset={() => changePref('timeZone', null)}>
            <Select label="Time zone" value={preference.timeZone ?? d.timeZone} onChange={(v) => changePref('timeZone', v)}>
              {preference.availableTimeZones.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Theme" defaultLabel={themeLabel[d.theme]} overridden={preference.theme !== null} onReset={() => changePref('theme', null)}>
            <div role="radiogroup" aria-label="Theme" className="inline-flex h-10 items-center rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
              {(['light', 'dark', 'system'] as ThemeChoice[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  onClick={() => changePref('theme', t)}
                  className={`h-8 rounded-lg px-3.5 text-sm font-medium transition-colors ${focusRing} ${theme === t ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-950 dark:text-gray-100' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}
                >
                  {themeLabel[t]}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Card>
      )}

      {breakGlass ? null : (
      <Card title="Roles and access" description="What you can open, and how you got it.">
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {roleGrants.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 sm:px-6 sm:py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                <Check className="size-4" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {r.roleName} <span className="font-normal text-gray-600 dark:text-gray-400">in {r.moduleName}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {r.scopeType ? `Scope: ${r.scopeLabel}` : 'Whole tenant'}
                  {r.via ? ` · through ${r.via}` : ' · assigned directly'}
                </div>
              </div>
              <Pill>{r.permissionCount} {r.permissionCount === 1 ? 'permission' : 'permissions'}</Pill>
            </li>
          ))}
        </ul>
        <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-600 sm:px-6 dark:border-gray-800 dark:text-gray-400">
          Roles are read-only here. Ask a tenant administrator to change your access.
        </p>
      </Card>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'one' ? `Sign out ${confirm.session.device}, ${confirm.session.browser}?` : `Sign out ${others.length} other ${others.length === 1 ? 'session' : 'sessions'}?`}
        description={confirm?.kind === 'one' ? 'That device is signed out at once and has to sign in again.' : 'Every device except this one is signed out at once and has to sign in again.'}
        confirmLabel="Sign out"
        danger
        onClose={closeConfirm}
        onConfirm={() => {
          if (confirm?.kind === 'one') onRevokeSession?.(confirm.session.id)
          else onRevokeOtherSessions?.()
          setConfirm(null)
        }}
      />
      <Toasts items={toasts} onDismiss={dismiss} />
    </div>
  )
}
