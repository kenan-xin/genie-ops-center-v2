import { goTo } from '@/shell/components/routes'

/** Where an audit target opens. Design tree only: the real app asks the owning module's resolver for a path. */
const AUDIT_TARGET_HREF: Record<string, string> = {
  user: '/admin/people',
  group: '/admin/groups',
  role: '/admin/roles',
  role_assignment: '/admin/roles',
  solution: '/admin/solutions/solutions',
  tenant_settings: '/admin/settings',
  tenant_module: '/admin/modules',
  tenant_branding: '/admin/branding',
  session: '/account',
}
import data from '@/../product/sections/audit-and-tenant-settings/data.json'
import type { AuditEvent, AuditFilterOptions, AuditFilters, DateRangePreset, SettingsViewer } from '@/../product/sections/audit-and-tenant-settings/types'
import { AuditLog } from './components/AuditLog'

// ?event=<eventId> opens the detail sheet; add &json=1 to open its JSON disclosure. ?empty=1 shows the empty state.
// Filters: ?actor=<id|system>&action=<key>&target=<type>&q=<text>&range=<today|7d|30d|custom>&from=YYYY-MM-DD&to=YYYY-MM-DD
export default function AuditLogPreview() {
  const params = new URLSearchParams(window.location.search)
  const empty = params.get('empty') === '1'
  const filters: Partial<AuditFilters> = {}
  if (params.get('actor')) filters.actorId = params.get('actor')!
  if (params.get('action')) filters.action = params.get('action')!
  if (params.get('target')) filters.targetType = params.get('target')!
  if (params.get('q')) filters.query = params.get('q')!
  if (params.get('range')) filters.range = params.get('range') as DateRangePreset
  if (params.get('from')) filters.from = params.get('from')
  if (params.get('to')) filters.to = params.get('to')
  return (
    <AuditLog
      viewer={data.viewer as SettingsViewer}
      auditEvents={empty ? [] : (data.auditEvents as AuditEvent[])}
      auditTotal={empty ? 0 : data.auditTotal}
      auditFilterOptions={data.auditFilterOptions as AuditFilterOptions}
      initialEventId={params.get('event')}
      initialJsonOpen={params.get('json') === '1'}
      initialFilters={filters}
      onChangeAuditFilters={(f) => console.log('Filters:', f)}
      onLoadMoreAuditEvents={() => console.log('Load more')}
      onOpenAuditTarget={(type) => goTo(AUDIT_TARGET_HREF[type] ?? '/admin/audit')}
      onCopyEventId={(id) => console.log('Copied event id:', id)}
    />
  )
}
