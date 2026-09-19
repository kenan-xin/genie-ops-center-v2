# Amendments the settings navigator needs

Date: 2026-09-18. Author: design owner. Status: raised, not applied.

Tenant settings becomes a section navigator: two groups, Tenant and Modules, one section's form at a time, and one search over every setting. The page of stacked cards does not survive a tenant with a dozen modules. This file lists what the platform documents must say for the screen to be buildable. Nothing under `/home/kenan/work/genie-ops-center-v2` was edited.

## Amendments

### A1. Spec 03, R-75: one section per module, not one card per module

Today: "The page must render one configuration card per entitled module that declares a `configSchema`, in module order."

Needed: the page renders a settings navigator. The Tenant group holds Sign-in & accounts and Sessions; the Modules group holds one section per installed module that declares a `configSchema`, in module order. One section's form shows at a time. The rules that do not change: a module without a schema contributes no section, `ConfigForm` renders the form, and each section saves on its own.

The same wording appears in `architecture/module-contract.md`, the Configuration schema row: "The Tenant Settings page renders one card per module with `ConfigForm`". It needs the same correction.

Why: the card list has no upper bound. Four modules already fill a desktop page, and the design fixtures show what twelve would do.

### A2. The module contract needs optional search keywords on a configuration field

Needed: a `configSchema` field may declare `keywords`, a short list of words a person might search for that the title and the description do not contain, for example "logout" for an idle timeout. Core reads them for the settings search and nowhere else. They are not a sixth field kind and they change no validation, so `DEC-28` stands.

Without them the search finds a setting only by the words the module already wrote, which is the difference between finding "Idle timeout" by typing "logout" and not finding it.

### A3. Spec 03 needs the search requirement

Needed: one requirement that the page carries a search over every setting the viewer may change, matching the field title, the field description, the field keywords, and the section name, with one typo tolerated from four characters. It must state what is never indexed: a saved value and a secret. A result names the setting and its section, and selecting one opens that section with the field focused.

The index is built per request from the schemas the viewer is already authorized to see, so the search needs no new store and no background job.

### A4. Spec 03 needs the disabled-module rule in words

`architecture/module-removal.md` already says that a reintroduced module registers disabled, that retained configuration is shown through core administration before activation, and that the enable path enforces required configuration. The Tenant settings requirements do not mention it.

Needed: an installed module that is switched off keeps its settings section, marked Disabled, and its fields stay editable so the tenant can be prepared before enabling. The save procedure writes `tenant_module.config` only and must refuse to write `tenant_module.enabled`, so saving settings can never enable a module. Enabling stays on the Modules page.

### A5. R-79 and the save failure

Today R-79 says every save writes one `audit_event` row and shows the shared toast. It does not say what a refused save looks like.

Needed: one line that a refused save keeps the typed values, reports the refusal in the section, and offers a retry, and that no toast is shown. The design does this and the requirement should carry it, because "failed saves must not appear successful" is the rule that a toast-only design breaks.

### A6. Authorization applies to the navigator and to the search

Needed: one line that a section the viewer may not open is absent from the navigator and contributes nothing to the search index. The page itself stays behind `core:settings:manage` (`R-93`), so today every section shares one key; the line matters when a module ever declares its own settings key.

## Unresolved, flagged rather than invented

### U1. Which key authorizes a module's settings section

Every section on this page sits behind `core:settings:manage` today. If a module ever wants its settings behind its own admin key, the navigator needs a key per section and the search needs to filter by it. The design carries no per-section key yet. Raised, not designed.

### U2. Deep linking to one section

The design opens a section from a link, which is how Modules will point at a module's settings. The route shape is not decided: `/admin/settings/<sectionId>`, or a query parameter. It matters because the unsaved-changes guard must intercept the navigation.

### U3. Search across pages

This search covers Tenant settings only. An administrator who types "branding" finds nothing, because Branding is its own page. Whether the field should reach other admin screens is a product question, and the design does not assume it.

### U4. A module with more settings than one screen holds

A module declaring thirty fields gets one long section. Sub-sections inside a module are not designed, because no module declares that many. Flagged so the navigator is not assumed to solve it.

## Design fixtures, not requirements

`Inventory` and `Service desk` exist in `product/sections/audit-and-tenant-settings/data.json` with `synthetic: true`, and the screen draws them with a Sample pill. They exist only to show the navigator holding a longer list. They are not modules, not planned, and must not be read as a commitment. `Approvals` is not a fixture: it is the sample tenant's installed module that is switched off, and it carries the disabled state.
