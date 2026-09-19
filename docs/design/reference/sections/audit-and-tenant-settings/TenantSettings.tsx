import { goTo } from '@/shell/components/routes'
import data from '@/../product/sections/audit-and-tenant-settings/data.json'
import type { ConfigValue, ModuleConfig, SettingsViewer, TenantRealm, TenantSettings } from '@/../product/sections/audit-and-tenant-settings/types'
import { TenantSettingsPage } from './components/TenantSettingsPage'
import { readDemoNav, resetDemoNavIfRequested, useDemoNav } from '@/shell/demoState'

resetDemoNavIfRequested()

const baseConfigs = data.moduleConfigs as unknown as ModuleConfig[]

/**
 * Preview switches:
 * `?section=<id>` opens one section, which is also the phone detail screen. `?q=<text>` fills the
 * search, for example `?q=timout`. `?fail=<sectionId>` makes that section's save fail, so the
 * refusal and Retry can be read. `?draft=1` loads with unsaved changes in Sessions and in Contracts,
 * for the unsaved-navigation confirm. `?brokered=1` previews a realm without local accounts.
 * `?reset=1` puts the sample tenant back.
 *
 * A saved module section is kept in the shared preview record, so the reintroduction review on
 * Modules shows the value on its next opening. The record carries configuration only: this screen
 * never writes `tenant_module.enabled`, so saving here cannot switch a module on.
 */
export default function TenantSettingsPreview() {
  const params = new URLSearchParams(window.location.search)
  const [nav, setNav] = useDemoNav()
  const fail = params.get('fail')
  const draft = params.get('draft') === '1'
  const moduleConfigs = baseConfigs.map((c) => (nav.moduleConfig[c.moduleId] ? { ...c, values: { ...c.values, ...nav.moduleConfig[c.moduleId] }, updatedBy: 'Priya Nair', updatedAt: new Date().toISOString() } : c))

  return (
    <TenantSettingsPage
      viewer={data.viewer as SettingsViewer}
      tenantSettings={data.tenantSettings as TenantSettings}
      realm={params.get('brokered') === '1' ? { supportsLocalAccounts: false } : (data.realm as TenantRealm)}
      moduleConfigs={moduleConfigs}
      initialSectionId={params.get('section') ?? undefined}
      initialQuery={params.get('q') ?? undefined}
      initialDraft={draft ? { sessionIdleMinutes: 45 } : undefined}
      initialModuleDrafts={draft ? { contracts: { ...(data.moduleConfigs[0].values as unknown as Record<string, ConfigValue>), registryName: 'Vendor agreements' } } : undefined}
      onNavigate={goTo}
      onSaveTenantSettings={(input) =>
        new Promise<void>((resolve, reject) => {
          window.setTimeout(() => (fail === 'accounts' || fail === 'sessions' || fail === 'all' ? reject(new Error('The server refused the change (503).')) : resolve()), 700)
        }).then(() => console.log('Save tenant settings:', input))
      }
      onSaveModuleConfig={(moduleId, values) =>
        new Promise<void>((resolve, reject) => {
          window.setTimeout(() => (fail === moduleId || fail === 'all' ? reject(new Error('The server refused the change (503).')) : resolve()), 700)
        }).then(() => {
          // `tenant_module.config` only. `enabled` is untouched here and on the server procedure.
          const current = readDemoNav()
          setNav({ ...current, moduleConfig: { ...current.moduleConfig, [moduleId]: { ...current.moduleConfig[moduleId], ...values } } })
        })
      }
    />
  )
}
