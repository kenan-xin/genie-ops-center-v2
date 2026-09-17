import { useCallback, useMemo, useState } from 'react'
import type { ConfigValue, ModuleConfig, OnboardingMode, SettingsViewer, TenantRealm, TenantSettings, TenantSettingsInput } from '@/../product/sections/audit-and-tenant-settings/types'
import { btnPrimary, btnSecondary, fmtDateTime, focusRing, inputClass, labelClass, validateField } from './helpers'
import { Card, SwitchRow, Toast } from './ui'
import { ConfigForm } from './ConfigForm'

export interface TenantSettingsPageProps {
  viewer: SettingsViewer
  tenantSettings: TenantSettings
  realm: TenantRealm
  moduleConfigs: ModuleConfig[]
  onSaveTenantSettings?: (input: TenantSettingsInput) => void
  onSaveModuleConfig?: (moduleId: string, values: Record<string, ConfigValue>) => void
  /** Design-only: unsaved core settings on load. */
  initialDraft?: Partial<TenantSettingsInput>
  /** Design-only: unsaved module values on load, by module id. */
  initialModuleDrafts?: Record<string, Record<string, ConfigValue>>
}

function SettingsCard({ title, description, changedBy, changedAt, dirty, invalid, onSave, onDiscard, children, timeZone }: { title: string; description: string; changedBy: string | null; changedAt: string | null; dirty: boolean; invalid?: boolean; onSave: () => void; onDiscard: () => void; children: React.ReactNode; timeZone: string }) {
  return (
    <Card>
      <div className="px-5 pt-5">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
      <div className="px-5 py-5">{children}</div>
      <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
        <p className="text-xs text-gray-600 dark:text-gray-400">{changedAt ? <>Last changed {changedBy ? `by ${changedBy}` : 'by provisioning'} · {fmtDateTime(changedAt, timeZone)}</> : 'Never changed'}</p>
        <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
          <button type="button" className={btnSecondary} disabled={!dirty} onClick={onDiscard}>Discard</button>
          <button type="button" className={btnPrimary} disabled={!dirty || invalid} onClick={onSave}>Save</button>
        </div>
      </div>
    </Card>
  )
}

function ModuleCard({ cfg, timeZone, onSave, initialDraft }: { cfg: ModuleConfig; timeZone: string; onSave?: (moduleId: string, values: Record<string, ConfigValue>) => void; initialDraft?: Record<string, ConfigValue> }) {
  const [draft, setDraft] = useState<Record<string, ConfigValue> | null>(initialDraft ?? null)
  const values = draft ?? cfg.values
  const errors = useMemo(() => Object.fromEntries(cfg.schema.map((f) => [f.key, validateField(f, values[f.key])])), [cfg.schema, values])
  const invalid = Object.values(errors).some(Boolean)
  return (
    <SettingsCard title={cfg.moduleName} description={cfg.description} changedBy={cfg.updatedBy} changedAt={cfg.updatedAt} dirty={draft !== null} invalid={invalid} timeZone={timeZone} onDiscard={() => setDraft(null)} onSave={() => { onSave?.(cfg.moduleId, values); setDraft(null) }}>
      <ConfigForm schema={cfg.schema} values={values} errors={errors} onChange={setDraft} />
    </SettingsCard>
  )
}

export function TenantSettingsPage(p: TenantSettingsPageProps) {
  const s = p.tenantSettings
  const tz = p.viewer.timeZone
  const [saved, setSaved] = useState<TenantSettings>(s)
  const [onboarding, setOnboarding] = useState<OnboardingMode | null>(null)
  const [local, setLocal] = useState<boolean | null>(null)
  const [idle, setIdle] = useState<string | null>(p.initialDraft?.sessionIdleMinutes === undefined ? null : String(p.initialDraft.sessionIdleMinutes))
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const idleValue = idle ?? String(saved.sessionIdleMinutes)
  const idleNum = Number(idleValue)
  const idleInvalid = idleValue.trim() === '' || !Number.isInteger(idleNum) || idleNum < 5 || idleNum > 480

  const commit = (patch: Partial<TenantSettingsInput>, message: string) => {
    const next: TenantSettings = { ...saved, ...patch, updatedBy: p.viewer.name, updatedAt: new Date().toISOString() }
    setSaved(next)
    p.onSaveTenantSettings?.({ onboardingMode: next.onboardingMode, localAccountsEnabled: next.localAccountsEnabled, sessionIdleMinutes: next.sessionIdleMinutes })
    setToast(message)
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <SettingsCard title="Onboarding" description="How a person from your identity provider becomes a member of this tenant." changedBy={saved.updatedBy} changedAt={saved.updatedAt} timeZone={tz} dirty={onboarding !== null && onboarding !== saved.onboardingMode} onDiscard={() => setOnboarding(null)} onSave={() => { commit({ onboardingMode: onboarding! }, 'Onboarding mode saved'); setOnboarding(null) }}>
        <div role="radiogroup" aria-label="Onboarding mode" className="flex flex-col gap-2">
          {([['invite', 'Invite only', 'Only people an administrator adds can sign in.'], ['jit', 'Just-in-time', 'Anyone your identity provider signs in is added on first sign-in.']] as Array<[OnboardingMode, string, string]>).map(([id, label, help]) => {
            const checked = (onboarding ?? saved.onboardingMode) === id
            return (
              <label key={id} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 motion-safe:transition-colors ${checked ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60'}`}>
                <input type="radio" name="onboarding" checked={checked} onChange={() => setOnboarding(id)} className={`mt-1 size-4 rounded-full accent-blue-600 ${focusRing}`} />
                <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{help}</span></span>
              </label>
            )
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="Local accounts" description="For a tenant without an identity provider, or for guests outside it. Passwords live in the tenant realm, never in Genie." changedBy={saved.updatedBy} changedAt={saved.updatedAt} timeZone={tz} dirty={local !== null && local !== saved.localAccountsEnabled} onDiscard={() => setLocal(null)} onSave={() => { commit({ localAccountsEnabled: local! }, local ? 'Local accounts turned on' : 'Local accounts turned off'); setLocal(null) }}>
        <SwitchRow
          label="Allow local accounts"
          description="Add person also creates the account in the tenant realm and sends a set-password email."
          checked={local ?? saved.localAccountsEnabled}
          disabled={!p.realm.supportsLocalAccounts}
          onChange={setLocal}
          note={!p.realm.supportsLocalAccounts ? <span>The tenant realm is brokered only. Ask your Genie operator to add local accounts to the realm.</span> : (local ?? saved.localAccountsEnabled) ? <span>People added while this is on receive Keycloak's set-password email in your branding. Turning it off later keeps existing local accounts but stops new ones.</span> : null}
        />
      </SettingsCard>

      <SettingsCard title="Sessions" description="How long a signed-in browser stays signed in without activity." changedBy={saved.updatedBy} changedAt={saved.updatedAt} timeZone={tz} dirty={idle !== null && idleValue !== String(saved.sessionIdleMinutes)} invalid={idleInvalid} onDiscard={() => setIdle(null)} onSave={() => { commit({ sessionIdleMinutes: idleNum }, 'Idle timeout saved'); setIdle(null) }}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="idle-minutes" className={labelClass}>Idle timeout</label>
          <div className="flex items-center gap-2">
            <input id="idle-minutes" type="number" inputMode="numeric" min={5} max={480} step={1} value={idleValue} onChange={(e) => setIdle(e.target.value)} className={`${inputClass} max-w-[120px] font-mono`} aria-invalid={idleInvalid} aria-describedby={idleInvalid ? 'idle-error' : 'idle-help'} />
            <span className="text-sm text-gray-600 dark:text-gray-400">minutes</span>
          </div>
          {idleInvalid ? <p id="idle-error" role="alert" className="text-xs text-red-700">Enter a whole number from 5 to 480.</p> : <p id="idle-help" className="text-xs text-gray-600 dark:text-gray-400">5 to 480 minutes, default 15. Applies to new sessions and to existing sessions on their next activity. The idle warning fires before the session expires.</p>}
        </div>
      </SettingsCard>

      {p.moduleConfigs.length ? (
        <div className="mt-2 flex flex-col gap-4">
          <div className="px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Module settings</h2>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">One card per entitled module that declares settings. A module without settings shows no card.</p>
          </div>
          {p.moduleConfigs.map((cfg) => <ModuleCard key={cfg.moduleId} cfg={cfg} timeZone={tz} initialDraft={p.initialModuleDrafts?.[cfg.moduleId]} onSave={(id, v) => { p.onSaveModuleConfig?.(id, v); setToast(`${cfg.moduleName} settings saved`) }} />)}
        </div>
      ) : null}

      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}
