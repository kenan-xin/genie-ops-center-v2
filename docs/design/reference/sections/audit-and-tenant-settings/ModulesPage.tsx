import data from '@/../product/sections/audit-and-tenant-settings/data.json'
import type { Category, CompiledModule } from '@/../product/sections/audit-and-tenant-settings/types'
import { ModulesPage } from './components/ModulesPage'
import { categoryOf, readDemoNav, resetDemoNavIfRequested, useDemoNav } from '@/shell/demoState'

resetDemoNavIfRequested()

const baseCategories = data.categories as Category[]
const baseModules = data.modules as CompiledModule[]

/**
 * Preview switches: `?empty=1` empties every Access column, `?confirm=<moduleId>` opens the
 * switch-off confirm, `?reset=1` puts the sample tenant back.
 *
 * The category and the switch live in the shared preview record, so a change here shows on the
 * Categories page and in the solution configure sheet.
 */
export default function ModulesPagePreview() {
  const params = new URLSearchParams(window.location.search)
  const [nav, setNav] = useDemoNav()
  const cats = nav.categories ?? baseCategories.map((c) => ({ id: c.id, name: c.name, position: c.position }))
  const modules = baseModules.map((m) => ({
    ...m,
    enabled: nav.enabled[m.id] ?? m.enabled,
    categoryId: categoryOf(nav, m.id, m.categoryId),
    holders: params.get('empty') === '1' ? { groups: [], people: [] } : m.holders,
  }))
  const categories: Category[] = cats
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ ...c, moduleCount: modules.filter((m) => m.categoryId === c.id).length }))

  return (
    <ModulesPage
      modules={modules}
      categories={categories}
      initialConfirmModuleId={params.get('confirm') ?? undefined}
      onSetModuleEnabled={(id, enabled) => { const c = readDemoNav(); setNav({ ...c, enabled: { ...c.enabled, [id]: enabled } }) }}
      onSetModuleCategory={(id, categoryId) => { const c = readDemoNav(); setNav({ ...c, items: { ...c.items, [id]: categoryId } }) }}
    />
  )
}
