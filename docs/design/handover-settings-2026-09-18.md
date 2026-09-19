# Handover: Tenant settings as a section navigator

Date: 2026-09-18. Round: Tenant settings. Reviewer: another agent reviews `docs/design/` before approval.

## What was chosen, and what was not

The layout direction is variant A of `docs/design/prototypes/settings-navigator.prototype.html`, the section navigator. The prototype's implementation, its styling, and its illustrative module settings were not taken. The screen is built on the v2 design system and the existing shell: the same card, the same control heights, the same focus ring, the same confirm dialog, the same `ConfigForm`.

## What the screen does

One row at the top holds Search all settings and a What is searched help disclosure. Below it, a 232px navigator and one section's form. The navigator holds two groups. Tenant carries Sign-in & accounts, which is the onboarding mode and the local accounts switch, and Sessions, which is the idle timeout. Modules carries one row per installed module that declares a configuration schema, in module order. Solutions declares no tenant configuration, so it has no row, and nothing was invented for it.

The search reads the field title, the field description, the field keywords, and the section name. It reads no saved value and no secret: searching "supplier" finds nothing, although "Supplier contracts" is the saved registry name. It tolerates one edit or one swap from four characters, so "timout" finds Idle timeout and "remidners" finds Renewal reminders. A result is the setting name over its breadcrumb, `Tenant › Sessions`. Choosing one opens that section, focuses the field, and rings it for two and a half seconds.

Each section saves on its own, keeps its own Discard, keeps the change attribution line, and keeps the validation that blocks Save. A refused save keeps the typed values, says "Not saved" with the reason, and offers Retry; no toast appears. Unsaved work is protected on three paths out: choosing another section, following a search result, and the phone Back control. The navigator marks an unsaved section with a dot.

An installed module that is switched off keeps its section, marked Disabled in the navigator, with its fields editable, so a tenant can be prepared before the module is enabled. One amber note says that saving changes settings only and never switches the module on, and links to Modules. `architecture/module-removal.md` already asks for exactly this before activation. Saving writes `tenant_module.config` and never `tenant_module.enabled`.

On a phone the search field and the section list are the first screen, a section is the next, and All settings goes back. It is not a squeezed sidebar.

Responsibilities stay apart: Settings configures, Modules enables and disables, Access assigns. The navigator says so in one line, and the disabled note links to Modules rather than offering a switch.

## Scale fixtures

`Inventory` and `Service desk` carry `synthetic: true` in the sample data, a Sample pill in the navigator, and one line in their section saying they exist to show the navigator at scale. They are not modules and not a plan. `Approvals` is not a fixture: it is the sample tenant's installed module that is switched off.

## Changed files

- `src/sections/audit-and-tenant-settings/components/TenantSettingsPage.tsx`: rewritten as the navigator.
- `src/sections/audit-and-tenant-settings/components/ConfigForm.tsx`: a `highlightKey` ring, and an id on the boolean field so a search result can focus a switch.
- `src/sections/audit-and-tenant-settings/components/helpers.ts`: `matchesQuery`, the typo-tolerant match with transposition.
- `src/sections/audit-and-tenant-settings/components/ui.tsx`: `HelpNote`, `WarningNote`, and an optional id on `Switch` and `SwitchRow`.
- `src/sections/audit-and-tenant-settings/TenantSettings.tsx`: the preview switches.
- `product/sections/audit-and-tenant-settings/types.ts`: `SettingsSectionSummary`, `SettingsSearchHit`, `ConfigField.keywords`, `ModuleConfig.enabled` and `synthetic`, and the two save callbacks now return a promise.
- `product/sections/audit-and-tenant-settings/data.json`: keywords on every field, Approvals switched off, and the two scale fixtures.
- `product/sections/audit-and-tenant-settings/spec.md`, `product/design-system/tokens.md`, `product/CHANGELOG.md`, `product/amendments-settings-2026-09-18.md`, and this file.
- `scripts/capture/settings.json` and `scripts/capture/verify-settings.mjs`.
- Twenty-one captures in `product/sections/audit-and-tenant-settings/`.

## Preview links

The design server runs at `http://localhost:3000`. Use the `/fullscreen` routes, because the framed route drops the query string. The base is `/sections/audit-and-tenant-settings/screen-designs/TenantSettings/fullscreen`.

- Default: no parameter
- One section: `?section=accounts`, `?section=sessions`, `?section=contracts`
- Search: `?q=reminders`; typo: `?q=timout` and `?q=remidners`; no results: `?q=supplier`
- Disabled module: `?section=approvals`
- Refused save: `?section=contracts&fail=contracts`, or `?fail=all`
- Unsaved changes on load: `?draft=1&section=sessions`
- A realm without local accounts: `?section=accounts&brokered=1`

## Checks performed

Simulated in the browser against sample data. No backend exists in this tree, so nothing below proves server behavior. 42 checks pass in `scripts/capture/verify-settings.mjs`.

The navigator lists both core sections and every module that declares settings, and no module that does not. The disabled module is marked and the fixtures are marked. A search result carries the name and the breadcrumb, and choosing it opened Contracts with the focus on `cfg-remindersEnabled` and a ring on that field. "timout" found Idle timeout; "remidners" found Renewal reminders; "supplier", which is a saved value, found nothing, and the empty state says values and secrets are never read. The switched-off module's fields were editable and its save reported itself without any change to the module's enabled state. Validation blocked Save on an out-of-range idle timeout. A forced refusal kept the typed value, reported it, showed no toast, and offered Retry. Unsaved changes were caught when changing section and when following a search result, Cancel kept the edit, Discard followed through. The phone list leads to the detail and back, with no sideways overflow. The help disclosure opens on click and closes on Escape. The type check, the lint, and the other two suites, 42 access checks and 37 category checks, all still pass.

## Unresolved

Four questions are in `product/amendments-settings-2026-09-18.md`: which key authorizes a module's settings section if it is ever not `core:settings:manage`; the route shape for deep linking into one section, which the unsaved guard must intercept; whether the search should reach other admin pages, since Branding is its own page and finds nothing today; and what a module with more fields than one screen holds should do. None is invented here.
