import data from '@/../product/sections/audit-and-tenant-settings/data.json'
import type { Category, CompiledModule, ConfigValue, ModuleActivation, RetainedConfigField } from '@/../product/sections/audit-and-tenant-settings/types'
import { ModulesPage } from './components/ModulesPage'
import { categoryOf, readDemoNav, resetDemoNavIfRequested, useDemoNav } from '@/shell/demoState'

resetDemoNavIfRequested()

const baseCategories = data.categories as Category[]
const baseModules = data.modules as CompiledModule[]

/**
 * Preview switches. The five module-lifecycle fixtures this screen must show:
 *
 * - Ordinary disabled: `Approvals` in the sample data. `activation.state` is `ready`, so it keeps
 *   the switch and the one-step flow.
 * - Reintroduced, awaiting review: `Asset register`. `activation.state` is `review-required`, so it
 *   has no switch. `?review=assets` opens its review panel on load.
 * - Validation failure: `?review=assets&config=invalid` marks its required configuration invalid, so
 *   activation is refused and the confirmation cannot be ticked.
 * - Activation failure: `?review=assets&fail=1` makes the server refuse the activation call.
 * - Successful activation: `?review=assets`, tick the confirmation, press Enable. The module becomes
 *   an ordinary enabled module, because the server returns `ready` once it is activated.
 *
 * - Ordinary disable after a successful activation: activate `Asset register`, then switch it off.
 *   It becomes an ordinary switched-off module with a switch, not a second review.
 *
 * Also: `?empty=1` empties every Access column, `?confirm=<moduleId>` opens the switch-off confirm,
 * `?reset=1` puts the sample tenant back.
 *
 * The category and the switch live in the shared preview record, so a change here shows on the
 * Categories page and in the solution configure sheet. The same record carries the assignments
 * Access revoked and the values Tenant settings saved, so the review is a read of one tenant state
 * rather than a fixed sample: remove `Biomedical engineering` from Asset register in Access and
 * this review lists one assignment fewer, and save a register name in settings and this review
 * shows it, still switched off.
 */

/** The label the review shows for a saved value: an enum reads as its option label. */
function savedLabel(moduleId: string, key: string, value: ConfigValue): string {
  const field = (data.moduleConfigs as { moduleId: string; schema: { key: string; kind: string; options?: { value: string; label: string }[] }[] }[])
    .find((c) => c.moduleId === moduleId)?.schema.find((f) => f.key === key)
  if (field?.kind === 'enum') return field.options?.find((o) => o.value === value)?.label ?? String(value)
  return Array.isArray(value) ? value.join(', ') : String(value)
}
export default function ModulesPagePreview() {
  const params = new URLSearchParams(window.location.search)
  const [nav, setNav] = useDemoNav()
  const configInvalid = params.get('config') === 'invalid'
  const failActivation = params.get('fail') === '1'
  const cats = nav.categories ?? baseCategories.map((c) => ({ id: c.id, name: c.name, position: c.position }))
  const revoked = new Set(nav.revokedGrants)
  const modules = baseModules.map((m) => {
    const enabled = nav.enabled[m.id] ?? m.enabled
    // A returned module needs its review once. After that it is an ordinary module, so switching it
    // off again is the ordinary flow and never asks for a second review.
    const reviewed = nav.activated[m.id] ?? false
    // The assignments Access removed are gone from the review, the way a second server read would
    // return them. The saved settings replace the kept values, and neither one switches the module on.
    const saved = nav.moduleConfig[m.id]
    const retainedGrants = (m.activation.retainedGrants ?? []).filter((g) => !revoked.has(g.id))
    const retainedConfig: RetainedConfigField[] = (m.activation.retainedConfig ?? []).map((f) =>
      saved && f.key in saved ? { ...f, value: savedLabel(m.id, f.key, saved[f.key]), status: undefined, message: undefined } : f,
    )
    // Server-owned in the product. Here: a reintroduced module that is still off keeps its review
    // state, and one the preview has activated is an ordinary module again.
    const activation: ModuleActivation =
      m.activation.state === 'review-required' && !enabled && !reviewed
          ? configInvalid && !saved?.registerName
            ? {
                ...m.activation,
                retainedGrants,
                configStatus: 'invalid',
                configMessage: 'One required setting is not valid, so the module cannot be enabled yet.',
                retainedConfig: retainedConfig.map((f) =>
                  f.key === 'registerName'
                    ? { ...f, value: 'Not set', status: 'missing' as const, message: 'Register name is required. Set it in the settings section, then reopen this review.' }
                    : f,
                ),
              }
            : { ...m.activation, retainedGrants, retainedConfig }
        : { state: 'ready' }
    return {
      ...m,
      enabled,
      activation,
      categoryId: categoryOf(nav, m.id, m.categoryId),
      holders: params.get('empty') === '1' ? { groups: [], people: [] } : m.holders,
    }
  })
  const categories: Category[] = cats
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ ...c, moduleCount: modules.filter((m) => m.categoryId === c.id).length }))

  return (
    <ModulesPage
      modules={modules}
      categories={categories}
      initialConfirmModuleId={params.get('confirm') ?? undefined}
      initialReviewModuleId={params.get('review') ?? undefined}
      onSetModuleEnabled={(id, enabled) => { const c = readDemoNav(); setNav({ ...c, enabled: { ...c.enabled, [id]: enabled } }) }}
      // In the product this is one server procedure, shared with `genie-ops module enable`. It
      // re-checks the review, the required configuration, and the retained grants before it writes.
      onActivateModule={(id) =>
        new Promise<void>((resolve, reject) => {
          window.setTimeout(() => {
            if (failActivation) {
              reject(new Error('The activation procedure failed while restoring assignments (503).'))
              return
            }
            const c = readDemoNav()
            setNav({ ...c, enabled: { ...c.enabled, [id]: true }, activated: { ...c.activated, [id]: true } })
            resolve()
          }, 900)
        })
      }
      onSetModuleCategory={(id, categoryId) => { const c = readDemoNav(); setNav({ ...c, items: { ...c.items, [id]: categoryId } }) }}
    />
  )
}
