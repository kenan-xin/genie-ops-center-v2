import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChevronRight, Loader2, Search, X } from 'lucide-react'
import type { ConfigValue, ModuleConfig, OnboardingMode, SettingsSearchHit, SettingsSectionSummary, SettingsViewer, TenantRealm, TenantSettings, TenantSettingsInput } from '@/../product/sections/audit-and-tenant-settings/types'
import { btnGhost, btnPrimary, btnSecondary, fmtDateTime, focusRing, inputClass, labelClass, matchesQuery, validateField } from './helpers'
import { Card, ConfirmDialog, HelpNote, Pill, SwitchRow, Toast, WarningNote } from './ui'
import { ConfigForm } from './ConfigForm'

export interface TenantSettingsPageProps {
  viewer: SettingsViewer
  tenantSettings: TenantSettings
  realm: TenantRealm
  /** One per installed module that declares a configuration schema. A module without one is absent. */
  moduleConfigs: ModuleConfig[]
  onSaveTenantSettings?: (input: TenantSettingsInput) => void | Promise<void>
  onSaveModuleConfig?: (moduleId: string, values: Record<string, ConfigValue>) => void | Promise<void>
  /** Opens another admin screen, for example the Modules page. */
  onNavigate?: (href: string) => void
  /** Design-only: the section to open on load. */
  initialSectionId?: string
  /** Design-only: the search box already filled. */
  initialQuery?: string
  /** Design-only: unsaved core settings on load. */
  initialDraft?: Partial<TenantSettingsInput>
  /** Design-only: unsaved module values on load, by module id. */
  initialModuleDrafts?: Record<string, Record<string, ConfigValue>>
}

const ACCOUNTS = 'accounts'
const SESSIONS = 'sessions'

/** The core sections' own search index. A module's fields come from its schema. */
const CORE_INDEX: Array<{ sectionId: string; fieldKey: string; title: string; description: string; keywords: string[] }> = [
  { sectionId: ACCOUNTS, fieldKey: 'onboardingMode', title: 'Onboarding mode', description: 'How a person from your identity provider becomes a member of this tenant.', keywords: ['invite', 'just in time', 'jit', 'sign up', 'registration', 'joiner'] },
  { sectionId: ACCOUNTS, fieldKey: 'localAccountsEnabled', title: 'Allow local accounts', description: 'For a tenant without an identity provider, or for guests outside it.', keywords: ['guest', 'password', 'realm', 'set password', 'contractor'] },
  { sectionId: SESSIONS, fieldKey: 'sessionIdleMinutes', title: 'Idle timeout', description: 'How long a signed-in browser stays signed in without activity.', keywords: ['timeout', 'logout', 'sign out', 'expiry', 'inactivity', 'security'] },
]

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * Tenant settings as a section navigator. One searchable list of sections on the left, one section's
 * form on the right, each section saving on its own. It replaces the single long page of cards,
 * which did not survive a tenant with more than a handful of modules.
 *
 * Settings configures. Modules enables and disables. Access assigns. Saving here writes
 * `tenant_settings` or `tenant_module.config`, never `tenant_module.enabled`.
 */
export function TenantSettingsPage(p: TenantSettingsPageProps) {
  const tz = p.viewer.timeZone
  const [saved, setSaved] = useState<TenantSettings>(p.tenantSettings)
  const [accounts, setAccounts] = useState<{ onboardingMode: OnboardingMode; localAccountsEnabled: boolean } | null>(
    p.initialDraft?.onboardingMode !== undefined || p.initialDraft?.localAccountsEnabled !== undefined
      ? { onboardingMode: p.initialDraft.onboardingMode ?? p.tenantSettings.onboardingMode, localAccountsEnabled: p.initialDraft.localAccountsEnabled ?? p.tenantSettings.localAccountsEnabled }
      : null,
  )
  const [idle, setIdle] = useState<string | null>(p.initialDraft?.sessionIdleMinutes === undefined ? null : String(p.initialDraft.sessionIdleMinutes))
  const [modDrafts, setModDrafts] = useState<Record<string, Record<string, ConfigValue>>>(p.initialModuleDrafts ?? {})
  const [sectionId, setSectionId] = useState(p.initialSectionId ?? SESSIONS)
  const [query, setQuery] = useState(p.initialQuery ?? '')
  const [saving, setSaving] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ sectionId: string; message: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [guard, setGuard] = useState<{ run: () => void } | null>(null)
  const [mobileDetail, setMobileDetail] = useState(Boolean(p.initialSectionId))
  const [highlight, setHighlight] = useState<{ sectionId: string; fieldKey: string } | null>(null)
  const pendingFocus = useRef<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const sections: SettingsSectionSummary[] = [
    { id: ACCOUNTS, name: 'Sign-in & accounts', group: 'tenant', description: 'Who can sign in, and how an account is created.' },
    { id: SESSIONS, name: 'Sessions', group: 'tenant', description: 'How long a signed-in browser stays signed in.' },
    ...p.moduleConfigs.map((m) => ({ id: m.moduleId, name: m.moduleName, group: 'modules' as const, description: m.description, moduleId: m.moduleId, disabled: !m.enabled, synthetic: m.synthetic })),
  ]
  const current = sections.find((s) => s.id === sectionId) ?? sections[0]
  const cfgOf = (id: string) => p.moduleConfigs.find((m) => m.moduleId === id) ?? null

  const idleValue = idle ?? String(saved.sessionIdleMinutes)
  const idleNum = Number(idleValue)
  const idleInvalid = idleValue.trim() === '' || !Number.isInteger(idleNum) || idleNum < 5 || idleNum > 480
  const accountsValue = accounts ?? { onboardingMode: saved.onboardingMode, localAccountsEnabled: saved.localAccountsEnabled }

  const moduleErrors = (cfg: ModuleConfig) => {
    const values = modDrafts[cfg.moduleId] ?? cfg.values
    return Object.fromEntries(cfg.schema.map((f) => [f.key, validateField(f, values[f.key])]))
  }
  const dirtyOf = (id: string) => {
    if (id === ACCOUNTS) return accounts !== null && (accounts.onboardingMode !== saved.onboardingMode || accounts.localAccountsEnabled !== saved.localAccountsEnabled)
    if (id === SESSIONS) return idle !== null && idleValue !== String(saved.sessionIdleMinutes)
    return modDrafts[id] !== undefined
  }
  const invalidOf = (id: string) => {
    if (id === SESSIONS) return idleInvalid
    const cfg = cfgOf(id)
    return cfg ? Object.values(moduleErrors(cfg)).some(Boolean) : false
  }
  const dirtySections = sections.filter((s) => dirtyOf(s.id))

  // Every path that leaves an edited section asks first. Nothing here is destructive, so the dialog
  // is the plain confirm, not the danger one.
  const guarded = (run: () => void) => (dirtySections.length > 0 ? setGuard({ run }) : run())
  const discardAll = () => { setAccounts(null); setIdle(null); setModDrafts({}) }

  const open = (id: string, fieldKey?: string) =>
    guarded(() => {
      discardAll()
      setSectionId(id)
      setQuery('')
      setFailed(null)
      setMobileDetail(true)
      if (fieldKey) {
        pendingFocus.current = id === ACCOUNTS || id === SESSIONS ? `core-${fieldKey}` : `cfg-${fieldKey}`
        setHighlight({ sectionId: id, fieldKey })
      } else {
        setHighlight(null)
      }
    })

  // A result leads to a field: the focus goes there, and a ring marks it briefly so the eye follows.
  useEffect(() => {
    if (!pendingFocus.current) return
    const el = document.getElementById(pendingFocus.current)
    pendingFocus.current = null
    el?.focus({ preventScroll: false })
  }, [sectionId, highlight])

  useEffect(() => {
    if (!highlight) return
    const t = window.setTimeout(() => setHighlight(null), 2500)
    return () => window.clearTimeout(t)
  }, [highlight])

  const hits: SettingsSearchHit[] = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    const out: SettingsSearchHit[] = []
    CORE_INDEX.forEach((f) => {
      const section = sections.find((s) => s.id === f.sectionId)!
      if (matchesQuery([f.title, f.description, f.keywords.join(' '), section.name].join(' '), q)) {
        out.push({ sectionId: f.sectionId, sectionName: section.name, group: 'tenant', fieldKey: f.fieldKey, title: f.title, description: f.description })
      }
    })
    p.moduleConfigs.forEach((m) => {
      m.schema.forEach((f) => {
        if (matchesQuery([f.title, f.description, (f.keywords ?? []).join(' '), m.moduleName].join(' '), q)) {
          out.push({ sectionId: m.moduleId, sectionName: m.moduleName, group: 'modules', fieldKey: f.key, title: f.title, description: f.description })
        }
      })
    })
    return out
    // The section list is derived from the same props on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, p.moduleConfigs])

  const runSave = (id: string, label: string, write: () => void | Promise<void>) => {
    setSaving(id)
    setFailed(null)
    Promise.resolve()
      .then(write)
      .then(() => {
        setSaving(null)
        setToast(`${label} saved. Written to the audit log.`)
      })
      .catch((e: unknown) => {
        setSaving(null)
        setFailed({ sectionId: id, message: e instanceof Error ? e.message : 'The server refused the change.' })
      })
  }

  const saveCore = (patch: Partial<TenantSettingsInput>, label: string, clear: () => void) =>
    runSave(sectionId, label, () => {
      const next: TenantSettings = { ...saved, ...patch, updatedBy: p.viewer.name, updatedAt: new Date().toISOString() }
      const result = p.onSaveTenantSettings?.({ onboardingMode: next.onboardingMode, localAccountsEnabled: next.localAccountsEnabled, sessionIdleMinutes: next.sessionIdleMinutes })
      return Promise.resolve(result).then(() => { setSaved(next); clear() })
    })

  const saveModule = (cfg: ModuleConfig) =>
    runSave(cfg.moduleId, cfg.moduleName, () => {
      const values = modDrafts[cfg.moduleId] ?? cfg.values
      return Promise.resolve(p.onSaveModuleConfig?.(cfg.moduleId, values)).then(() => {
        setModDrafts((d) => { const next = { ...d }; delete next[cfg.moduleId]; return next })
      })
    })

  const navRow = (s: SettingsSectionSummary) => {
    const active = s.id === sectionId && !query
    return (
      <li key={s.id}>
        <button
          type="button"
          aria-current={active ? 'true' : undefined}
          onClick={() => open(s.id)}
          className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm motion-safe:transition-colors md:min-h-10 ${focusRing} ${active ? 'bg-white font-semibold text-blue-700 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-blue-400 dark:ring-gray-800' : 'font-medium text-gray-700 hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-800/60'}`}
        >
          {/* The name carries its own weight so a state pill never outreads it. The face is metric-stable, so 500 to 600 does not move the label. */}
          <span title={s.name} className="min-w-0 flex-1 truncate">{s.name}</span>
          {dirtyOf(s.id) ? <span aria-label="Unsaved" title="Unsaved" className="size-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400" /> : null}
          {s.synthetic ? <Pill>Sample</Pill> : null}
          {s.disabled ? <Pill tone="amber">Disabled</Pill> : null}
          <ChevronRight className="size-4 shrink-0 text-gray-400 md:hidden" strokeWidth={2} aria-hidden />
        </button>
      </li>
    )
  }

  const navigator = (
    <nav aria-label="Settings sections" className="flex flex-col">
      {(['tenant', 'modules'] as const).map((group) => {
        const rows = sections.filter((s) => s.group === group)
        if (rows.length === 0) return null
        return (
          // The caption owns the list below it, so the space above it is roughly twice the space below.
          // Without icons the rows start at the same left edge as the caption, and equal gaps read the
          // caption as one more row to click.
          <div key={group} className="flex flex-col pt-6 first:pt-0">
            {/* One step under the row label in size and one step lighter in tone: a caption, not a peer.
                Caps lose the word shape lowercase gives, so it is tracked wider to stay legible small. */}
            <h2 className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">{group === 'tenant' ? 'Tenant' : 'Modules'}</h2>
            <ul className="flex flex-col gap-0.5">{rows.map(navRow)}</ul>
          </div>
        )
      })}
      {/* A rule, not a size, separates the closing aside from the list. At 216px the rail cannot reach a 45-character measure, so the note reads as a footnote instead of body prose. */}
      <p className="mt-4 border-t border-gray-200 px-3 pt-3 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">A module appears here only when it declares settings. Switching a module on or off happens on the Modules page.</p>
    </nav>
  )

  const footer = (id: string, changedBy: string | null, changedAt: string | null, onSave: () => void, onDiscard: () => void) => {
    const dirty = dirtyOf(id)
    const failure = failed?.sectionId === id ? failed : null
    return (
      <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
        {failure ? (
          <p role="alert" className="flex flex-wrap items-center gap-x-1.5 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
            Not saved. {failure.message} Your changes are still here.
            <button type="button" onClick={onSave} className={`rounded font-semibold underline ${focusRing}`}>Retry</button>
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-600 dark:text-gray-400">{changedAt ? <>Last changed {changedBy ? `by ${changedBy}` : 'by provisioning'} · {fmtDateTime(changedAt, tz)}</> : 'Never changed'}</p>
          <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
            <button type="button" className={btnSecondary} disabled={!dirty} onClick={onDiscard}>Discard</button>
            <button type="button" className={`${btnPrimary} justify-center sm:min-w-24`} disabled={!dirty || invalidOf(id)} aria-busy={saving === id || undefined} onClick={onSave}>
              {saving === id ? <Loader2 className="size-4 motion-safe:animate-spin" strokeWidth={2} aria-hidden /> : null}Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  const sectionHead = (title: string, description: string, extra?: React.ReactNode) => (
    <div className="flex flex-col gap-3 px-5 pt-5">
      <div>
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <p className="mt-0.5 max-w-prose text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
      {extra}
    </div>
  )

  const lit = (fieldKey: string) => (highlight?.sectionId === sectionId && highlight.fieldKey === fieldKey ? 'rounded-lg ring-2 ring-blue-500 ring-offset-4 dark:ring-blue-400 dark:ring-offset-gray-900' : '')

  const content = () => {
    if (current.id === ACCOUNTS) {
      return (
        <Card>
          {sectionHead('Sign-in & accounts', 'Who can sign in to this tenant, and how an account is created.')}
          <div className="flex flex-col gap-6 px-5 py-5">
            <div className={`flex flex-col gap-1.5 ${lit('onboardingMode')}`}>
              <span className={labelClass}>Onboarding mode</span>
              <div role="radiogroup" aria-label="Onboarding mode" className="flex flex-col gap-2">
                {([['invite', 'Invite only', 'Only people an administrator adds can sign in.'], ['jit', 'Just-in-time', 'People in a group mapped to a role are added on first sign-in.']] as Array<[OnboardingMode, string, string]>).map(([id, label, help], i) => {
                  const checked = accountsValue.onboardingMode === id
                  return (
                    <label key={id} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 motion-safe:transition-colors ${checked ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60'}`}>
                      <input id={i === 0 ? 'core-onboardingMode' : undefined} type="radio" name="onboarding" checked={checked} onChange={() => setAccounts({ ...accountsValue, onboardingMode: id })} className={`mt-1 size-4 rounded-full accent-blue-600 ${focusRing}`} />
                      <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{help}</span></span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className={lit('localAccountsEnabled')}>
              <SwitchRow
                id="core-localAccountsEnabled"
                label="Allow local accounts"
                description="Add person also creates the account in the tenant realm and sends a set-password email."
                checked={accountsValue.localAccountsEnabled}
                disabled={!p.realm.supportsLocalAccounts}
                onChange={(v) => setAccounts({ ...accountsValue, localAccountsEnabled: v })}
                note={!p.realm.supportsLocalAccounts ? <span>The tenant realm is brokered only. Ask your Genie operator to add local accounts to the realm.</span> : accountsValue.localAccountsEnabled ? <span>People added while this is on receive Keycloak's set-password email in your branding. Turning it off later keeps existing local accounts but stops new ones.</span> : null}
              />
            </div>
          </div>
          {footer(ACCOUNTS, saved.updatedBy, saved.updatedAt, () => saveCore({ onboardingMode: accountsValue.onboardingMode, localAccountsEnabled: accountsValue.localAccountsEnabled }, 'Sign-in & accounts', () => setAccounts(null)), () => setAccounts(null))}
        </Card>
      )
    }

    if (current.id === SESSIONS) {
      return (
        <Card>
          {sectionHead('Sessions', 'How long a signed-in browser stays signed in without activity.')}
          <div className="px-5 py-5">
            <div className={`flex flex-col gap-1.5 ${lit('sessionIdleMinutes')}`}>
              <label htmlFor="core-sessionIdleMinutes" className={labelClass}>Idle timeout</label>
              <div className="flex items-center gap-2">
                <input id="core-sessionIdleMinutes" type="number" inputMode="numeric" min={5} max={480} step={1} value={idleValue} onChange={(e) => setIdle(e.target.value)} className={`${inputClass} max-w-[120px] font-mono`} aria-invalid={idleInvalid} aria-describedby={idleInvalid ? 'idle-error' : 'idle-help'} />
                <span className="text-sm text-gray-600 dark:text-gray-400">minutes</span>
              </div>
              {idleInvalid ? <p id="idle-error" role="alert" className="text-xs text-red-700">Enter a whole number from 5 to 480.</p> : <p id="idle-help" className="max-w-prose text-xs text-gray-600 dark:text-gray-400">5 to 480 minutes, default 15. Applies to new sessions and to existing sessions on their next activity. The idle warning fires before the session expires.</p>}
            </div>
          </div>
          {footer(SESSIONS, saved.updatedBy, saved.updatedAt, () => saveCore({ sessionIdleMinutes: idleNum }, 'Sessions', () => setIdle(null)), () => setIdle(null))}
        </Card>
      )
    }

    const cfg = cfgOf(current.id)
    if (!cfg) return null
    const values = modDrafts[cfg.moduleId] ?? cfg.values
    return (
      <Card>
        {sectionHead(
          cfg.moduleName,
          cfg.description,
          <div className="flex flex-col gap-2">
            {cfg.synthetic ? <p className="text-xs text-gray-600 dark:text-gray-400">Sample fixture. It exists to show the navigator at scale and is not part of the product.</p> : null}
            {!cfg.enabled ? (
              <WarningNote size="md" role="status">
                <p className="font-semibold">{cfg.moduleName} is switched off.</p>
                <p className="mt-0.5">Its settings stay editable, so the tenant can be prepared before the module is enabled. Saving here changes settings only: it never switches the module on. That happens on <button type="button" className={`rounded font-semibold underline ${focusRing}`} onClick={() => p.onNavigate?.('/admin/modules')}>Modules</button>.</p>
              </WarningNote>
            ) : null}
          </div>,
        )}
        <div className="px-5 py-5">
          <ConfigForm
            schema={cfg.schema}
            values={values}
            errors={moduleErrors(cfg)}
            highlightKey={highlight?.sectionId === cfg.moduleId ? highlight.fieldKey : null}
            onChange={(v) => setModDrafts((d) => ({ ...d, [cfg.moduleId]: v }))}
          />
        </div>
        {footer(cfg.moduleId, cfg.updatedBy, cfg.updatedAt, () => saveModule(cfg), () => setModDrafts((d) => { const next = { ...d }; delete next[cfg.moduleId]; return next }))}
      </Card>
    )
  }

  const results = (
    <Card>
      <div className="px-5 py-4">
        <h2 className="text-base font-bold tracking-tight">{hits.length === 0 ? 'No setting matches' : `${n(hits.length, 'setting', 'settings')} found`}</h2>
        <p className="mt-0.5 max-w-prose text-sm text-gray-600 dark:text-gray-400">
          {hits.length === 0 ? <>Nothing matches “{query.trim()}”. The search reads the name, the description, and the keywords of every setting you may change. It does not read saved values, and it never reads a secret.</> : 'Choose one to open its section with the setting in focus.'}
        </p>
      </div>
      {hits.length > 0 ? (
        <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
          {hits.map((h) => (
            <li key={`${h.sectionId}-${h.fieldKey}`}>
              <button type="button" onClick={() => open(h.sectionId, h.fieldKey)} className={`flex min-h-11 w-full items-center gap-3 px-5 py-3 text-left motion-safe:transition-colors hover:bg-gray-50 dark:hover:bg-gray-950 ${focusRing}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{h.title}</span>
                  <span className="block truncate text-xs text-gray-600 dark:text-gray-400">{h.group === 'tenant' ? 'Tenant' : 'Modules'} › {h.sectionName}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-gray-400" strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )

  const searchRow = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* Search and its help travel together: a 4px gap binds the icon to the field it explains. */}
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:max-w-md">
        <label className="flex h-10 min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-500 bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950">
          <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search all settings" placeholder="Search all settings" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500" />
          {query ? <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className={`-mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 ${focusRing}`}><X className="size-4" strokeWidth={2} /></button> : null}
        </label>
        {/* The one rule a successful search never teaches: what the index holds. The empty state says
            it, but a person who finds what they wanted never reads the empty state. */}
        <HelpNote label="What is searched" iconOnly>
          <p>The search reads the name, the description, and the keywords of every setting you may change, and the name of the section it sits in.</p>
          <p>It tolerates one typo from four letters, so “timout” finds Idle timeout and “remidners” finds Renewal reminders.</p>
          <p className="text-gray-600 dark:text-gray-400">It never reads a saved value and never a secret. Searching “supplier” finds nothing, although Supplier contracts is the saved registry name.</p>
        </HelpNote>
      </div>
    </div>
  )

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 pb-8">
      {/* Phone: the list is one screen and the section is the next. Desktop: both at once. */}
      <div className={mobileDetail && !query ? 'hidden md:block' : ''}>{searchRow}</div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[232px_minmax(0,1fr)]">
        <div className={`min-w-0 ${query ? 'hidden md:block' : mobileDetail ? 'hidden md:block' : ''}`}>
          <div className="rounded-xl bg-gray-50 p-2 md:sticky md:top-4 dark:bg-gray-900/60">{navigator}</div>
        </div>

        <div className={`min-w-0 ${!query && !mobileDetail ? 'hidden md:block' : ''}`}>
          {query ? (
            results
          ) : (
            <>
              <button type="button" onClick={() => guarded(() => { discardAll(); setMobileDetail(false); setHighlight(null) })} className={`${btnGhost} mb-2 md:hidden`}>
                <ArrowLeft className="size-5" strokeWidth={2} aria-hidden />All settings
              </button>
              {content()}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(guard)}
        title={dirtySections.length === 1 ? `Discard the changes in ${dirtySections[0]?.name}?` : `Discard changes in ${n(dirtySections.length, 'section', 'sections')}?`}
        description="The changes you have not saved are dropped. Nothing was written yet."
        confirmLabel="Discard"
        onConfirm={() => { guard?.run(); setGuard(null) }}
        onClose={() => setGuard(null)}
      />
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}
