import data from '@/../product/sections/audit-and-tenant-settings/data.json'
import type { Category, CompiledModule } from '@/../product/sections/audit-and-tenant-settings/types'
import { ModulesPage } from './components/ModulesPage'

// ?empty=1 empties every Access column. ?confirm=<moduleId> opens the switch-off confirm for that module.
export default function ModulesPagePreview() {
  const params = new URLSearchParams(window.location.search)
  const modules = data.modules as CompiledModule[]
  return (
    <ModulesPage
      modules={params.get('empty') === '1' ? modules.map((m) => ({ ...m, holders: { groups: [], people: [] } })) : modules}
      categories={data.categories as Category[]}
      initialConfirmModuleId={params.get('confirm') ?? undefined}
      onSetModuleEnabled={(id, enabled) => console.log('Set module enabled:', id, enabled)}
      onSetModuleCategory={(id, categoryId) => console.log('Set module category:', id, categoryId)}
    />
  )
}
