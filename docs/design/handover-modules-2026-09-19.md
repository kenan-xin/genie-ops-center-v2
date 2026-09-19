# Handover: module reintroduction review on the Modules page

Date: 2026-09-19. Round: Modules, P1 correction. Source: the settings design review of 2026-09-19, finding "reintroduction can be enabled without its mandatory review".

## What was wrong

The Modules screen treated every switched-off module alike. The switch called `setEnabled(id, true)`, which enabled the module at once and showed a success toast. A module that returned after a controlled removal therefore reached its enabled state without the retained-access review that `architecture/module-removal.md` requires. The help copy made it worse by saying that switching a module on returns it to everyone's navigation.

## What the screen does now

The module list carries a server-owned activation verdict. `ready` is an ordinary installed module. `review-required` is a module reintroduced after a removal. The screen never derives the state from `enabled === false`, because an ordinary switched-off module carries that too.

An ordinary module keeps its old flow exactly: a switch, an immediate save on switching on, and the danger-tone confirm on switching off. Nothing about it changed.

A reintroduced module has no switch at all. Its row reads Review needed in amber instead of Off in gray, and its Enabled cell holds a Review and enable button. A switch would imply a one-step enable that the policy forbids, so the control is not disabled, it is absent.

Review and enable opens the shared slide-over, 480px on desktop and a full-height sheet on a phone. Focus moves to the title. It reads in four parts.

1. An amber note saying the module returned on its date and stays off whatever it was before, and that closing the panel changes nothing.
2. Retained configuration: the server's verdict, then the settings the tenant kept as read-only label and value rows, then the line that the list only reads and that saving settings never switches a module on, then the link to the module's settings section. The server renders each value, so an enum reads as its label, an unset field as Not set, and a secret as a placeholder. A field the server refused is marked in the list with its own recovery message.
3. Retained access: one row per kept assignment, with the recipient, the role, the scope, the group member count, and a Restores or Will not restore pill. An invalid one carries its reason, for example a group archived since removal or a permission the module no longer declares. The heading counts how many of the kept assignments restore. The list only reads, and Change assignments in Access opens `/admin/access?module=<id>&level=use`. There is no second permission editor.
4. What enabling does not bring back: revoked inbound credentials, cancelled work, stopped schedules, and deleted assignments.

The footer holds one confirmation that names the outcome, "I read the retained access. Enabling Asset register restores the 3 assignments marked Restores, and nothing else." Enable is refused until the box is ticked and the required configuration is valid. One line states that the server runs these checks for the screen and for `genie-ops module enable`, and that the box records the decision rather than enforcing it. The preview does not claim that a client-side checkbox is a security control.

Invalid required configuration blocks the confirmation itself. A one-line refusal sits above the list and the field at fault is marked inside it, for example "Register name is required. Set it in the settings section, then reopen this review." Saving in that section writes `tenant_module.config` and never `tenant_module.enabled`, so the administrator comes back to Modules to enable.

A refused activation keeps the panel open, says the module is still switched off and nothing was restored, keeps the ticked review, and turns the button into Retry enabling. No success toast appears.

Cancel, the close button, Escape and the scrim all cancel. Nothing is written and reopening starts with the box unticked.

## Responsibilities stay apart

Settings configures. Access assigns. Modules enables. The review links to the first two and performs only the third.

## Changed files

- `src/sections/audit-and-tenant-settings/components/ModuleReview.tsx`: new. The review slide-over.
- `src/sections/audit-and-tenant-settings/components/ModulesPage.tsx`: the two enable controls, the Review needed pill, the wider Enabled column, the review wiring, and the help and footer copy.
- `src/sections/audit-and-tenant-settings/components/helpers.ts`: `accessHref` moved here and `settingsHref` added, so the table and the review share one definition.
- `src/sections/audit-and-tenant-settings/components/index.ts`: exports `ModuleReview`.
- `src/sections/audit-and-tenant-settings/ModulesPage.tsx`: the preview switches and the activation callback.
- `product/sections/audit-and-tenant-settings/types.ts`: `ModuleActivationState`, `RetainedGrant`, `RetainedConfigField`, `ModuleActivation`, the required `CompiledModule.activation`, and the `onActivateModule` callback. `onSetModuleEnabled` is documented as the ordinary path only.
- `product/sections/audit-and-tenant-settings/data.json`: `activation` on every module, the new `Asset register` fixture with its retained grants, and its settings section.
- `product/sections/audit-and-tenant-settings/spec.md`: the reintroduction flows, the Enabled column rule, the review panel and its failure state, and the lifecycle work that is out of scope.
- `product/amendments-modules-2026-09-19.md`: new. The backend contract this needs, and what is deliberately left open.
- `product/CHANGELOG.md` and this file.
- `scripts/capture/verify-modules.mjs`: new, 56 checks.
- `scripts/capture/modules-reintroduction.json`: new capture manifest. The module entries left `scripts/capture/categories.json`, so there is one source for them.
- `scripts/capture/verify-categories.mjs`: the uncategorized count moved from 4 to 5, because the new module has a workspace entry and no category.

## Fixtures

| Fixture | Where | What it shows |
| --- | --- | --- |
| Ordinary disabled | `Approvals` in the sample data | `activation.state` is `ready`. Switch, Off pill, one-step enable. |
| Reintroduced, awaiting review | `Asset register` in the sample data | `activation.state` is `review-required`. No switch, Review needed pill, five retained grants of which three restore. |
| Validation failure | `?config=invalid` | Required configuration invalid. The confirmation cannot be ticked and Enable stays refused. |
| Activation failure | `?fail=1` | The server refuses. The module stays off, the review is kept, Retry enabling is offered. |
| Successful activation | the default path | The panel closes, the toast reports it, and the row becomes an ordinary enabled module. |

`Asset register` is the sample tenant's reintroduced module, not a planned product module. `Approvals` stays the ordinary switched-off one, so the two states sit next to each other in the table.

## Preview links

The design server runs at `http://localhost:3000`. Use the `/fullscreen` routes, because the framed route drops the query string. The base is `/sections/audit-and-tenant-settings/screen-designs/ModulesPage/fullscreen`.

- The list, both states side by side: `?reset=1`
- The review: `?reset=1&review=assets`
- Invalid required configuration: `?reset=1&review=assets&config=invalid`
- A refused activation: `?reset=1&review=assets&fail=1`, then tick and press Enable
- The ordinary switch-off confirm, unchanged: `?reset=1&confirm=contracts`
- The module's settings section: `/sections/audit-and-tenant-settings/screen-designs/TenantSettings/fullscreen?section=assets`
- The central Access screen the review links to: `/sections/access/screen-designs/AccessGrants/fullscreen?module=assets&level=use`

## Checks performed

Simulated in the browser against sample data. No backend exists in this tree, so nothing below proves server behavior.

- `node scripts/capture/verify-modules.mjs`: 62 of 62 pass. It covers the two disabled states, the panel contents including the inline configuration rows and that they hold no editable control, the confirmation gate, cancellation by Escape and by Cancel, the invalid-configuration refusal, the settings round trip including that saving does not enable, the Access round trip and the return, the refused activation, the successful activation and its survival across a reload, keyboard-only operation from the table button to activation, the phone sheet, and sideways overflow at 390px.
- `node scripts/capture/verify-categories.mjs`: 37 of 37 pass after the count correction.
- `node scripts/capture/verify-access.mjs`: 42 of 42 pass, unchanged.
- `node scripts/capture/verify-settings.mjs`: 43 of 43 pass, after the restored help disclosure described below. It crashed at its last check before that.
- `npx tsc -b`: no errors.
- `npx eslint src/sections/audit-and-tenant-settings`: no issues.
- Captures: 16 through `scripts/capture/modules-reintroduction.json`, 10 through `scripts/capture/categories.json`, 20 of 21 through `scripts/capture/settings.json`. No capture reported sideways overflow.

### Another session is editing this repository at the same time

`src/sections/audit-and-tenant-settings/components/ModulesPage.tsx` changed on disk at 17:42, in the middle of this work. The search field gained a wrapper and the help disclosure became `iconOnly`, so its label is now an `aria-label` and no longer page text. `product/CHANGELOG.md` also gained an entry from outside this session. The changes are compatible with this correction and the added paragraph about reintroduction survived, but whoever imports this must re-read those two files rather than trust this list alone.

One capture broke on that change and was fixed here: `modules-help` now clicks `role=button[name="What a module is here"]` instead of matching button text, which works for an icon-only disclosure.

### Also fixed: Tenant settings had lost its help disclosure

`TenantSettingsPage.tsx` carried no `HelpNote` and did not import one, although `spec.md`, `handover-settings-2026-09-18.md` and `help-disclosure-audit-2026-09-19.md` all describe a "What is searched" disclosure beside the search field. `verify-settings.mjs` crashed at its last check waiting for the button, and the `tenant-settings-search-help` capture failed for the same reason.

The disclosure is restored, icon-only, bound to the search field with a 4px gap, which is the pattern the Modules screen now uses. It states what the index holds, the one-typo rule, and that a saved value and a secret are never read. That rule is otherwise only visible in the empty search state, which a successful search never shows. The audit file is corrected: the row moved from "already present" to "added", and the counts read 5 and 9.

`verify-settings.mjs` now completes: 43 of 43 pass. All 21 settings captures succeed. The capture manifest clicks the accessible name rather than button text, so an icon-only disclosure still matches.

### Also fixed: the help panel was clipped on a phone

The panel anchored to its trigger, so where the button trails a row it ran off the right edge. Four screens were affected, not the two first reported: Tenant settings, Modules, Access grants and People directory. Access grants was broken although it passes `align="right"`, which shows that prop was never the answer.

Under `sm` the panel is now pinned to the viewport with 16px gutters instead of anchoring to the button, and the `align` branch is scoped to `sm` so nothing competes below 640px. All five copies of `HelpNote` carry the identical change. At 320px and 390px all four screens measure fully inside; at 1280px every box is unchanged. Nine captures that open a help panel were refreshed, and three more capture selectors moved from button text to the accessible name, because a text selector cannot match an icon-only button.

Detail and the measurements are in `product/help-disclosure-audit-2026-09-19.md` and `product/CHANGELOG.md`.

### Also fixed: the capture manifests were fighting over 31 screenshots

`scripts/capture/radius.json` and `scripts/capture/rest-audit.json` were first reported here as historical passes holding stale module entries. That reading was wrong on both counts. They are load-bearing, and the problem was not staleness.

31 of the 342 capture names had two or more producers, and 13 disagreed about the viewport, so the file on disk depended on which manifest ran last. 34 duplicate entries were removed, keeping one definition per name. Nothing was lost: every duplicate pair had an identical `url` and identical `actions`, so only the image size ever differed, and all 342 names still have exactly one producer.

`scripts/capture/check-manifests.mjs` is new and guards it. It reports clean: 342 entries, 342 names, 342 files, no orphan, no missing file, no size mismatch. No capture needed recapturing, because in every conflict the surviving definition was also the one that ran last. Detail is in `product/CHANGELOG.md`.

## Choices a reviewer may reject

- **The review lists the retained configuration rather than only linking to it.** A first pass linked out instead. That was wrong: a decision made one navigation away from its own facts is not a review, and the brief says the review shows retained configuration while only assignment changes link out. The server returns the values already rendered, so core needs no copy of the module's schema and no raw read of `tenant_module.config` leaves the tenant. See `product/amendments-modules-2026-09-19.md`, A4.
- **The reintroduced module has no switch rather than a disabled switch.** A disabled switch still reads as "one press away". The row shows the Review and enable button in the same column instead.
- **The failure injections are preview switches, not extra data fixtures.** `?config=invalid` and `?fail=1` follow the existing convention of this repository, where `?fail=`, `?denied=1` and `?brokered=1` already drive failure and permission states. Adding two more modules to the sample tenant would have changed the Categories counts and the settings navigator for no extra clarity.

## Unresolved

Five questions are in `product/amendments-modules-2026-09-19.md`: how the review is recorded durably; which tables hold the activation verdict and the retained-grant validity; what the server does when the grants change between the review and the confirmation; whether a recorded review expires; and how deliberate work resumption is offered once it is defined. None is invented here.

One question is new and belongs to another owner: Tenant settings has lost the "What is searched" disclosure that its specification and the help-disclosure audit both require. It is reported, not fixed, because it is outside this finding.
