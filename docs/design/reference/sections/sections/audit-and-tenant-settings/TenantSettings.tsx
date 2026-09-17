import data from '@/../product/sections/audit-and-tenant-settings/data.json'
import type { ModuleConfig, SettingsViewer, TenantSettings as TenantSettingsModel } from '@/../product/sections/audit-and-tenant-settings/types'
import { TenantSettingsPage } from './components/TenantSettingsPage'

// ?brokered=1 shows a realm without local accounts (switch disabled). ?nomodules=1 hides module cards.
// ?dirty=1 opens with an unsaved idle timeout. ?invalid=1 opens the Contracts card with one failing value per field kind.
const INVALID_CONTRACTS = {
  registryName: '',
  approvalThreshold: 20000000,
  scopeDimension: '',
  notifyEmails: ['legal@meridianhealth.example', 'not-an-email'],
}
export default function TenantSettingsPreview() {
  const params = new URLSearchParams(window.location.search)
  const brokered = params.get('brokered') === '1'
  return (
    <TenantSettingsPage
      viewer={data.viewer as SettingsViewer}
      tenantSettings={data.tenantSettings as TenantSettingsModel}
      realm={{ supportsLocalAccounts: brokered ? false : data.realm.supportsLocalAccounts }}
      moduleConfigs={params.get('nomodules') === '1' ? [] : (data.moduleConfigs as ModuleConfig[])}
      initialDraft={params.get('dirty') === '1' ? { sessionIdleMinutes: 30 } : undefined}
      initialModuleDrafts={params.get('invalid') === '1' ? { contracts: INVALID_CONTRACTS } : undefined}
      onSaveTenantSettings={(input) => console.log('Save tenant settings:', input)}
      onSaveModuleConfig={(moduleId, values) => console.log('Save module config:', moduleId, values)}
    />
  )
}
