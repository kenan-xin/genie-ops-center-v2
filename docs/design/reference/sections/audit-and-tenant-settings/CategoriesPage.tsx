import data from '@/../product/sections/audit-and-tenant-settings/data.json'
import type { AssignableItem, Category, CompiledModule } from '@/../product/sections/audit-and-tenant-settings/types'
import { CategoriesPage } from './components/CategoriesPage'
import { categoryOf, readDemoNav, resetDemoNavIfRequested, useDemoNav, type DemoCategory } from '@/shell/demoState'

resetDemoNavIfRequested()

const baseCategories = data.categories as Category[]
const baseModules = data.modules as CompiledModule[]
const baseRecords = data.assignableRecords as AssignableItem[]

/**
 * Preview switches:
 * `?confirm=<categoryId>` opens the delete confirm. `?fail=<itemId>` or `?fail=all` makes the save
 * of that row fail, so the error and Retry can be read. `?denied=1` signs in an administrator who
 * holds `core:settings:manage` and not `solutions:admin`. `?off=<moduleIds>` switches modules off.
 * `?reset=1` puts the sample tenant back.
 *
 * The category of every item lives in the shared preview record, so a change here shows on the
 * Modules page and in the solution configure sheet, and the other way round.
 */
export default function CategoriesPagePreview() {
  const params = new URLSearchParams(window.location.search)
  const [nav, setNav] = useDemoNav()
  const fail = params.get('fail')
  const denied = params.get('denied') === '1'
  const off = (params.get('off') ?? '').split(',').filter(Boolean)

  const cats: DemoCategory[] = nav.categories ?? baseCategories.map((c) => ({ id: c.id, name: c.name, position: c.position }))
  const modules = baseModules.map((m) => ({
    ...m,
    enabled: off.includes(m.id) ? false : nav.enabled[m.id] ?? m.enabled,
    categoryId: categoryOf(nav, m.id, m.categoryId),
  }))
  // The count comes from `tenant_module.category_id` alone. There is no solutions count, because
  // `solution_category` is a module table that core does not read (R-88, DEC-51).
  const categories: Category[] = cats
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ ...c, moduleCount: modules.filter((m) => m.categoryId === c.id).length }))

  const items: AssignableItem[] = [
    ...modules
      .filter((m) => m.staticEntries > 0)
      .map((m) => ({
        id: m.id,
        label: m.displayName,
        detail: m.description,
        kind: 'module' as const,
        ownerModuleId: m.id,
        typeLabel: 'Module',
        categoryId: m.categoryId,
        writeKey: 'core:settings:manage',
      })),
    // A switched-off module answers nothing, so it contributes no record rows. What it stored is kept.
    ...baseRecords
      .filter((r) => modules.find((m) => m.id === r.ownerModuleId)?.enabled)
      .map((r) => ({ ...r, categoryId: categoryOf(nav, r.id, r.categoryId) })),
  ]

  const permissions = denied ? data.viewer.permissions.filter((k) => k !== 'solutions:admin') : data.viewer.permissions

  return (
    <CategoriesPage
      categories={categories}
      modules={modules}
      assignableItems={items}
      permissions={permissions}
      initialConfirmId={params.get('confirm') ?? undefined}
      onSetItemCategory={(itemId, categoryId) =>
        new Promise<void>((resolve, reject) => {
          window.setTimeout(() => {
            if (fail === itemId || fail === 'all') {
              reject(new Error('The server refused the change (503).'))
              return
            }
            const current = readDemoNav()
            setNav({ ...current, items: { ...current.items, [itemId]: categoryId } })
            resolve()
          }, 700)
        })
      }
      onCreateCategory={(name) => setNav({ ...nav, categories: [...cats, { id: `cat_${Date.now()}`, name, position: cats.length + 1 }] })}
      onRenameCategory={(id, name) => setNav({ ...nav, categories: cats.map((c) => (c.id === id ? { ...c, name } : c)) })}
      onReorderCategories={(ids) => setNav({ ...nav, categories: cats.map((c) => ({ ...c, position: ids.indexOf(c.id) + 1 })) })}
      // Nothing else is written. Every reader treats an id that no longer exists as no category (R-91).
      onDeleteCategory={(id) => setNav({ ...nav, categories: cats.filter((c) => c.id !== id) })}
    />
  )
}
