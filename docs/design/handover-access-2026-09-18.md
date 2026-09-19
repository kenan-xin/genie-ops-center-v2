# Handover: centralized access management

Date: 2026-09-18. Round: Access. Reviewer: another agent reviews `docs/design/` before approval.

## Continuation, fourth pass

The simple grant flow is unchanged: pick a group, move rows between Catalog and Granted, save. This pass adds the explanation and the sources, and it changes no step of that flow.

What v1 gave. Its guidance is one short line of plain language next to the control it explains, for example "Categories organize the sidebar only. Access is granted to groups in Access" in `categories-directory.tsx`, and "Grant solutions to a group, or explore who can reach what" in `access-screen.tsx`. The tone is right and the placement is right. Two things did not carry over: v1 keeps the line always open, which repeats on every visit, and v1 states that access comes entirely from groups, which is not the v2 model. So v2 keeps the tone and the placement, collapses the text behind a labelled button, and states the additive model instead.

The help disclosure. `HelpNote` is one pattern, recorded in the design system. A labelled button carries a question-mark icon and `aria-expanded`, and it opens a 320 px callout on click, on tap, and on Enter or Space. Escape closes it, a click outside closes it, and a Close link at the foot closes it for touch. It appears once per screen, on Grants, Overview, the group inspector, the person inspector Roles tab, and the Roles directory, with the text matched to the concept each screen raises. It never carries a consequence that a confirmation must carry.

Sources in Grants. For a person, the screen now reads the grants their groups carry. A catalogue row the person already reaches reads "Also through Claims Review", and one line under the list says that this screen writes the direct assignments only. A row on the Catalog side therefore never means that the person has no access. A group needs none of this, because a group receives nothing through another group.

Consequences at the press. While a removal waits, the pending bar names the first path that stays. Save then opens a confirmation that lists every path: "Claims Triage Assistant stays reachable through Claims Review and AI Pilot Cohort." Removing the "Every solution" grant names how many rows stay granted one by one. Nothing reports a revoke. Removing members from a local group now confirms first, and the confirmation says that direct roles and other group memberships still give access and that this does not remove them.

Sources in Overview. Every row already named Direct assignment or via a group, and the second path. It now also names the scope, "One record" or "Whole tenant", and the phone card list carries the "also through" line that only the desktop table carried.

Sample data. The tenant gained `ra_16`, a direct solution grant to Marcus Lee, who belongs to no group. The three cases asked for are now all present: group-only (Alex Morgan), direct-only (Marcus Lee), and overlapping (Amara Osei, who reaches Claims Triage Assistant through Claims Review and directly).

Simulated, not verified against a backend. Every screen in this repository runs on `data.json` in the browser. A save writes nothing: it flips a local list, shows the button's loading state, and reports that the change is written to the audit log. The "Also through" line and the removal consequence are computed in the browser from the same sample grants. Whether the server returns those other sources, refuses the same writes, and applies the last-administrator rule cannot be checked here. The checks below are interaction checks only.

Checked in the browser, 36 checks, all passing (`scripts/capture/verify-access.mjs`): granted one solution and one module to Claims Review in one save; a direct role assigned to a person through Advanced access; a person with group-only, direct-only, and overlapping grants read correctly in Grants and in Overview; a removal with another path open named that path in the pending bar and in the confirmation, and never claimed a revoke; a group membership removal named what stays; a switched-off module blocked the row checkbox, select all, and Add all shown while its kept grant stayed removable, and Add all shown added only the enabled module; the module switched on again read as active; Cancel dropped the pending list and changing the recipient with unsaved changes asked first; the help disclosure opened by mouse, by Enter, and by tap, and closed on Escape; no sideways overflow at 390 px on the four changed screens; no console errors.

## Correction, third pass

Two focused fixes, with the group dropdown and the Catalog and Granted layout unchanged.

Modules beside solutions. The catalogue already built module rows, so the missing rows were sample data, not design: only Approvals qualified, and it was switched off and already granted. The sample tenant gained Service requests, an enabled module that owns no records, with its seeded `Service requests user` role, granted to one group and not to the others. A module row writes that role with no scope, which is use and not administration. A solution row writes the solutions user role scoped to that solution. The solutions module itself is still never a row: access to every solution stays the separate broader-access choice.

Disabled modules. A switched-off module now blocks every path that adds: the row checkbox on the Catalog side, select all, Add all shown, the broader-access checkbox, and the module, level, record and direct-role controls inside Advanced access. Kept grants stay, carry an Inactive pill and the sentence "Inactive, the <module> module is off", and stay selectable on the Granted side so they can be removed. The Overview counts them apart, as "4 assignments for Clinical Operations, 4 not in effect", and marks each row "Not in effect". Switching the module on again restores the effect of the kept assignments, because nothing was deleted. The catalogue heading is now "Access assignments", with one line that says Granted means an assignment exists and not that the resource works today.

Preview switch: `?off=solutions` renders the same tenant with the module switched off. Drop it to preview the module switched on again.

Verified in the browser, in one run: granted Claims Triage Assistant and Service requests to Clinical Operations, saved, and the Granted side showed five rows with the pending bar gone; removed both again and the Granted side returned to three. With `?off=solutions`, all four solution rows are blocked with the reason and Service requests stays addable, "Every solution" is blocked, Add all shown reaches only the unblocked row, the three kept grants stay removable, and Advanced access shows the amber block line with its record list disabled. The Overview reads "4 not in effect" with the module off and "1 not in effect" with it on, which is the Approvals grant. No sideways overflow at 1280 px or 390 px, and the type check, lint and layout detector are clean.

## Correction, second pass

The first pass put a module choice and an access level in front of every grant. The product owner asked for v1's simplicity instead, and v1 is the evidence: `src/features/groups/components/grants-panel.tsx` is a group `Select` followed straight by the Catalog and Granted transfer list, with the role implied by the mutation, and `access-screen.tsx` folds Grants and Overview into one screen with a segmented control.

The Grants tab now follows that shape. Pick a group from a searchable dropdown, move rows between Catalog and Granted, save. Every row means "can use": one row per solution, and one row per other enabled module whose use grant needs no record. A Show filter narrows the catalogue and is never required. "Grant to a person instead" switches the dropdown, and a person is the exception.

Broader access is its own card under the catalogue, one checkbox per module that owns records, reading "Every solution, now and in the future" with the count it covers today. It is never a catalogue row, so a bulk action on rows can never widen a grant to future records.

Advanced access is one action at the right of the toolbar. It holds administration levels, core administration, the audit role, one record of a module that owns records, and custom roles at a scope, with the last-administrator and self-protection guards unchanged. It writes through the same procedure.

Rows the catalogue cannot show are named, not hidden: one line under the transfer list lists them with their role and links into Advanced access.

Changed in this pass: `src/sections/access/components/GrantsScreen.tsx` rewritten, `AdvancedAccess.tsx` added, `TransferList.tsx` gained a type badge and an inactive pill, `ui.tsx` gained the slide-over, `product/sections/access/types.ts` gained `CatalogItem` and `BroaderGrant`, `product/sections/access/spec.md` rewritten, eleven Grants captures retaken, and the shell page description reworded.

Verified in the browser: the dropdown opens, searches and closes on Escape or an outside click; picking a group loads the catalogue at once; Add 2 moves two rows and the pending bar reads "2 changes not saved, 2 to add, 0 to remove"; the Show filter narrows to modules only; Add all shown adds only the rows the search left; ticking "Every solution, now and in the future" marks itself Pending and warns that the rows above add nothing; a disabled module keeps its Inactive pill; the unnamed grant line appears with a link to Advanced access; Advanced access opens with the module list and the direct-role form; the last-administrator guard still blocks the last core administration grant; no sideways overflow at 1280 px or 390 px.

## What changed

Granting and revoking access now happens in one core screen. An administrator picks a recipient, a module, an access level, then the records, and saves. The screen picks the module's own predefined role, so nobody has to find a role first. Roles keeps the definitions and nothing else. Every other screen that used to edit access now reads it and links to Access with the subject preselected.

Access sits in the Core group of the admin portal, not under Solutions, so it stays reachable when the solutions module is switched off.

## Changed files

New section:

Fourth pass:

- `src/sections/access/components/ui.tsx` and `src/sections/people-groups-and-roles/components/ui.tsx`: the `HelpNote` disclosure.
- `src/sections/access/components/GrantsScreen.tsx`: the other sources of a person, the removal consequences, the save confirmation, and the help disclosure.
- `src/sections/access/components/TransferList.tsx`: a row can carry one `note` line.
- `src/sections/access/components/OverviewScreen.tsx`: the scope label, the help disclosure, and the "also through" line on phones.
- `src/sections/people-groups-and-roles/components/GroupInspector.tsx`: the member removal confirmation and the help disclosure.
- `src/sections/people-groups-and-roles/components/PersonInspector.tsx`, `RolesDirectory.tsx`, `index.ts`: the help disclosure.
- `product/sections/access/data.json`: `ra_16`, one direct-only person.
- `product/sections/access/spec.md`, `product/sections/people-groups-and-roles/spec.md`, `product/design-system/tokens.md`, `product/CHANGELOG.md`, and this file.
- `scripts/shots.mjs`: a dark shot sets the stored theme, and an action can pick a select option.
- `scripts/capture/verify-access.mjs` and `scripts/capture/access-help.json`: the 36 interaction checks and the capture manifest.
- Nine new captures and twenty-six retaken ones, in `product/sections/access/` and `product/sections/people-groups-and-roles/`.

Earlier passes:

- `product/sections/access/spec.md`, `types.ts`, `data.json`, and eighteen captures.
- `src/sections/access/AccessGrants.tsx`, `AccessOverview.tsx`.
- `src/sections/access/components/GrantsScreen.tsx`, `OverviewScreen.tsx`, `TransferList.tsx`, `ui.tsx`, `helpers.ts`.

Changed:

- `product/sections/people-groups-and-roles/spec.md` and `types.ts`: Roles is definitions only, and `onManageAccess` replaces the two assignment callbacks.
- `src/sections/people-groups-and-roles/components/RoleDetail.tsx`, `PersonInspector.tsx`, `GroupInspector.tsx`, `PeopleDirectory.tsx`, `GroupsDirectory.tsx`, `index.ts`, and the three preview wrappers.
- `src/sections/people-groups-and-roles/components/AssignmentForm.tsx`: deleted. Its job moved to the Grants screen and its secondary dialog.
- `product/sections/solutions/spec.md`: the Access tab is read-only, and the standalone overview moved to core.
- `src/sections/solutions/components/ConfigureSolutionSlideOver.tsx`, `AdminSolutions.tsx`, `index.ts`, and `src/sections/solutions/AdminSolutions.tsx`.
- `src/sections/solutions/AccessOverview.tsx` and `src/sections/solutions/components/AccessOverview.tsx`: deleted.
- `product/sections/audit-and-tenant-settings/spec.md` and `src/sections/audit-and-tenant-settings/components/ModulesPage.tsx`: the Access column links to Access.
- `product/shell/spec.md`, `src/shell/components/ShellWrapper.tsx`, `src/shell/components/routes.ts`: Access is a Core entry at `/admin/access`.
- `product/design-system/tokens.md`: the transfer list has two forms.
- `product/CHANGELOG.md`.

Also fixed on the way, unrelated to access but blocking the type check:

- `CategoriesPage` counted solutions, which core cannot count (`DEC-51`). It counts modules only.
- `ChatThemes` and `ConfigureSolutionSlideOver` read a `isDefault` flag the type no longer carries. They read the seed id.

## Preview links

The design server runs at `http://localhost:3000`. Use the `/fullscreen` routes, because the framed route drops the query string.

- Grants, nothing chosen: `/sections/access/screen-designs/AccessGrants/fullscreen`
- Grants, prefilled: `/sections/access/screen-designs/AccessGrants/fullscreen?recipient=grp_clinops&module=solutions&level=use`
- Grants, the last administrator guard: `?recipient=grp_admins&module=core&level=admin`
- Grants, a module with no admin role declared: `?recipient=grp_finance&module=contracts`
- Grants, a module with no records: `?recipient=grp_finance&module=approvals&level=use`
- Grants, the secondary role dialog: `?recipient=grp_pilot&dialog=role`
- Overview, nothing chosen: `/sections/access/screen-designs/AccessOverview/fullscreen`
- Overview, by person, group, module, record: `?recipient=usr_amara`, `?recipient=grp_clinops`, `?module=solutions`, `?record=sol_claims`
- Grants, a person who also reaches solutions through two groups: `/sections/access/screen-designs/AccessGrants/fullscreen?recipient=usr_amara`
- Grants, a direct-only person: `?recipient=usr_marcus`
- Grants, a module switched off: `?recipient=grp_finance&off=solutions`. Drop `off` to preview it switched on again.
- Group inspector, help and member removal: `/sections/people-groups-and-roles/screen-designs/GroupsDirectory/fullscreen?group=grp_pilot`
- Person inspector, Roles tab: `/sections/people-groups-and-roles/screen-designs/PeopleDirectory/fullscreen?person=usr_amara&tab=roles`
- Roles directory: `/sections/people-groups-and-roles/screen-designs/RolesDirectory/fullscreen`

## Checks performed

Simulated in the browser, against sample data. No backend exists in this tree, so nothing below is proof of server behavior.

- Grant: ticking two catalogue rows and pressing Add moved them to Granted, the pending bar read "2 changes not saved, 2 to add, 0 to remove", and Save cleared it.
- Revoke: ticking a granted row offers Remove, and the pending bar counts it as a removal.
- Inherited access: the Overview for Amara Osei shows three paths to two targets, and names the second path in the How column as "also through Claims Review".
- Whole-tenant grant: choosing "All solutions, including later ones" disables the record list and states that the listed record grants add nothing.
- Disabled module: Approvals carries a Disabled pill and the note that grants are kept and apply again when it is switched on.
- Missing contract: Contracts has no role carrying `contracts:admin`, so Administer is disabled and the gap is named.
- Last administrator: the core administration grant for the only holder is disabled with the reason.
- Prefilled links: the Modules page link resolves to `/admin/access?module=solutions&level=use`, and the Grants screen opens with the module and the level chosen.
- Roles: Role detail has no Add assignment control and one Manage in Access button.
- Empty states: both tabs render their own empty state, and the Overview loads nothing before a subject is chosen.
- Keyboard: every control is reachable by Tab, the rows are real checkboxes, and the focus ring is the shared one.
- Layout: zero sideways overflow at 1280 px and at 390 px.
- Light and dark: both captured. Dark needs `localStorage.theme = "dark"` before the page loads, because the Design OS theme toggle rewrites the class on mount.
- Type check and lint: `npx tsc -b` and `npx eslint src/sections src/shell` are clean.

Not verified, and not verifiable here: server refusals, the audit writes, the real `can()` and `scopesFor()` answers, iframe and content security policy behavior, and any error state that a network failure produces. The design shows the refusal copy; the platform owns the refusal.

## Spec requirements covered

- One writer of `role_assignment` (`DEC-39`): the Access screen writes, every other screen reads.
- Predefined roles from the module contract: the level picks `<Display name> user` for Use and the declared admin role for Administer.
- Record scope from the module's declared record type (`DEC-39` as amended, module contract, Record types).
- An administration key is never record-scoped (Spec 04, R-16).
- A disabled module keeps its grants (`DEC-50`).
- Self-protection and the last-administrator rule (Spec 02, R-38).
- An archived group grants nothing while archived (Spec 02, R-32). The Overview marks such a row "Not in effect".
- Mobile first, card lists under 768 px (`DEC-25`).
- One tenant color, neutral tinted surfaces (`DEC-47`).
- No core Dashboard and no landing slot (`DEC-49`).

## Required amendments and open decisions

See `amendments-access-2026-09-18.md`. Seven documents need a wording change, and five questions are open. The one that blocks nothing but matters most: `DEC-50` still names the Roles screen as the one writer.

## What is not done

- `docs/design/` in the platform repository is a full mirror of the design tree as of this round. The sync removed the captures of the two screens this round deleted, the solutions Access overview and the assignment form, and added the eighteen Access captures. It also removed a doubled `reference/sections/sections/` folder that an earlier copy left behind.
- `docs/design/prototypes/README.md` said the prototype must not introduce a cross-module access screen. That line is now marked superseded, because the product owner asked for one. The prototype file itself is untouched and stays a record of the experiment.
- The captures of screens this round did not change are older than this morning's layout fixes. They are retaken in the full handover.
- Nothing outside `docs/design/` was written. The platform repository had uncommitted changes in `docs/architecture/`, `docs/core/`, `docs/specs/`, `docs/modules/`, and `docs/runbooks/` before this round started, and they are untouched.
