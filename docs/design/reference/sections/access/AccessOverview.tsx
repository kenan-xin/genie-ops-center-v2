import { goTo } from '@/shell/components/routes'
import data from '@/../product/sections/access/data.json'
import type { AccessModule, AccessProps, AccessRecord, Grant, OverviewSubject, Recipient } from '@/../product/sections/access/types'
import { OverviewScreen } from './components/OverviewScreen'
import { Tabs } from './components/ui'

/** Preview switches: `?recipient=<id>`, `?module=<id>`, or `?record=<id>` load that subject at once. */
export default function AccessOverviewPreview() {
  const params = new URLSearchParams(window.location.search)
  // `?off=<moduleId>` previews a tenant whose module is switched off, so its grants read as inactive.
  const off = (params.get('off') ?? '').split(',').filter(Boolean)
  const modules = (data.modules as unknown as AccessModule[]).map((m) => (off.includes(m.id) ? { ...m, enabled: false } : m))
  const recipient = params.get('recipient')
  const moduleId = params.get('module')
  const record = params.get('record')
  const subject: OverviewSubject | null = recipient
    ? { kind: 'recipient', id: recipient }
    : record
      ? { kind: 'record', id: record }
      : moduleId
        ? { kind: 'module', id: moduleId }
        : null

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <Tabs
        tabs={[{ id: 'grants' as const, label: 'Grants' }, { id: 'overview' as const, label: 'Overview' }]}
        value="overview"
        onChange={(t) => t === 'grants' && goTo('/admin/access')}
      />
      <OverviewScreen
        currentUserId={data.currentUserId}
        recipients={data.recipients as Recipient[]}
        modules={modules}
        records={data.records as AccessRecord[]}
        grants={data.grants as unknown as Grant[]}
        customRoles={data.customRoles as AccessProps['customRoles']}
        initialSubject={subject}
        onNavigate={goTo}
      />
    </div>
  )
}
