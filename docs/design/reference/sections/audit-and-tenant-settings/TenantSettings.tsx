import { goTo } from '@/shell/components/routes'
import data from '@/../product/sections/audit-and-tenant-settings/data.json'
import type { ConfigValue, ModuleConfig, SettingsViewer, TenantRealm, TenantSettings } from '@/../product/sections/audit-and-tenant-settings/types'
import { TenantSettingsPage } from './components/TenantSettingsPage'

/**
 * Preview switches:
 * `?section=<id>` opens one section, which is also the phone detail screen. `?q=<text>` fills the
 * search, for example `?q=timout`. `?fail=<sectionId>` makes that section's save fail, so the
 * refusal and Retry can be read. `?draft=1` loads with unsaved changes in Sessions and in Contracts,
 * for the unsaved-navigation confirm. `?brokered=1` previews a realm without local accounts.
 */
export default function TenantSettingsPreview() {
  const params = new URLSearchParams(window.location.search)
  const fail = params.get('fail')
  const draft = params.get('draft') === '1'

  return (
    <TenantSettingsPage
      viewer={data.viewer as SettingsViewer}
      tenantSettings={data.tenantSettings as TenantSettings}
      realm={params.get('brokered') === '1' ? { supportsLocalAccounts: false } : (data.realm as TenantRealm)}
      moduleConfigs={data.moduleConfigs as unknown as ModuleConfig[]}
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
        }).then(() => console.log('Save module config:', moduleId, values))
      }
    />
  )
}
