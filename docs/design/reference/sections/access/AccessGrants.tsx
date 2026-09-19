import { useState } from 'react'
import { goTo } from '@/shell/components/routes'
import data from '@/../product/sections/access/data.json'
import type { AccessModule, AccessProps, AccessRecord, Grant, LevelId, PendingChange, Recipient } from '@/../product/sections/access/types'
import { GrantsScreen } from './components/GrantsScreen'
import { Tabs } from './components/ui'

/**
 * Preview switches: `?recipient=<id>` picks the group or the person, the way a link from Modules,
 * People, Groups, Roles, or one solution does. `?module=<id>` and `?level=use|admin|audit` prefill
 * the advanced sheet, and `?dialog=advanced` opens it.
 */
export default function AccessGrantsPreview() {
  const params = new URLSearchParams(window.location.search)
  const [grants, setGrants] = useState(data.grants as unknown as Grant[])
  const level = params.get('level')
  // `?off=solutions,contracts` previews a tenant whose module is switched off. Drop it to preview the
  // same tenant after an administrator switches the module on again.
  const off = (params.get('off') ?? '').split(',').filter(Boolean)
  const modules = (data.modules as unknown as AccessModule[]).map((m) => (off.includes(m.id) ? { ...m, enabled: false } : m))

  const apply = (changes: PendingChange[]) => {
    setGrants((list) => {
      const kept = list.filter((g) => !changes.some((c) => c.kind === 'revoke' && c.grantId === g.id))
      const added: Grant[] = changes
        .filter((c) => c.kind === 'grant')
        .map((c, i) => {
          const mod = modules.find((m) => m.id === c.moduleId)
          const lvl = mod?.levels.find((l) => l.id === c.level)
          const recipient = (data.recipients as Recipient[]).find((r) => r.id === c.recipientId)
          return {
            id: `ra_new_${Date.now()}_${i}`,
            recipientId: c.recipientId,
            recipientType: recipient?.type ?? 'group',
            moduleId: c.moduleId,
            level: c.level,
            roleId: lvl?.roleId ?? '',
            roleName: lvl?.roleName ?? '',
            scopeType: c.scopeId ? mod?.recordType?.type ?? null : null,
            scopeId: c.scopeId,
            createdBy: 'Priya Nair',
            createdAt: new Date().toISOString(),
          }
        })
      return [...kept, ...added]
    })
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <Tabs
        tabs={[{ id: 'grants' as const, label: 'Grants' }, { id: 'overview' as const, label: 'Overview' }]}
        value="grants"
        onChange={(t) => t === 'overview' && goTo('/admin/access/overview')}
      />
      <GrantsScreen
        currentUserId={data.currentUserId}
        recipients={data.recipients as Recipient[]}
        modules={modules}
        records={data.records as AccessRecord[]}
        grants={grants}
        customRoles={data.customRoles as AccessProps['customRoles']}
        initial={{
          recipientId: params.get('recipient') ?? undefined,
          moduleId: params.get('module') ?? undefined,
          level: level === 'use' || level === 'admin' || level === 'audit' ? (level as LevelId) : undefined,
          recordId: params.get('record') ?? undefined,
        }}
        initialDialog={params.get('dialog') === 'advanced' ? 'advanced' : undefined}
        onSave={apply}
        onNavigate={goTo}
      />
    </div>
  )
}
