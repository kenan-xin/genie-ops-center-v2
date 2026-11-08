# Access Specification

Updated 2026-11-03 to the access model of 2026-11-02 (Specification 02, R-37 to R-37e and R-38; ticket S2-20, bead `d8l5.30`). Owner review pending at the Phase 15 dry run. The [prototype](access.prototype.html) shows every state of this file. The [import record](../../imports/2026-11-03-access-role-per-row.md) lists its source and checks. A line marked "(owner review pending)" is a design choice that no requirement settles.

Updated 2026-11-08 for effective access in Granted (owner ruling D1 of the follow-up 9 dry run, bead `d8l5.42`). No capture shows a read-only row yet. The owner reviews it at the next dry run.

## Overview
Two admin portal screens behind `core:roles:manage` (R-37e). Grants is the one screen that assigns and removes roles after creation. The roles picked in Add person go through the same role-assignment service (owner decision 2026-09-27, B1). A group or a person has access to a module exactly when it holds at least one role of that module. Access adds up across direct assignments and groups, and no deny rule exists (R-37a). The everyday flow on Grants has three steps: pick a group, move module rows between Catalog and Granted and pick the role of each Granted row, save. Overview is read-only and answers who reaches which module, with which role, and through which path. Advanced access holds what is not an everyday grant: core administration, the Auditor role, a module role at one record, and custom roles (R-37c). Access belongs to core administration, so it stays reachable when any module is switched off. Roles keeps role definitions only, and a module's own screens link here instead of editing access themselves (`DEC-39`, one writer). Designed mobile first: the phone layout is the base and desktop adds columns.

## User Flows
- Administrator opens Access, picks a group from the searchable dropdown, and sees the catalogue at once. No module or role is chosen first.
- Administrator ticks two module rows in Catalog, presses Add 2, and saves. Each row writes one assignment of that module's default access role, which the module declares as `defaultAccessRole` (`../../../architecture/module-contract.md`). The new Granted row names that role and carries a Pending pill until Save.
- Administrator changes the role choice on a Granted row, for example Invoices from Viewer to Finance. The row reads Pending, shows the old role struck through, and the pending bar counts one change. Save swaps the role.
- Administrator grants to one person instead of a group. The People segment switches the dropdown, and the empty state says that a person is the exception. The Groups empty state says that a group is the normal path, because the identity provider keeps it current.
- Administrator ticks a Granted row, presses Remove 1, and saves. A confirmation names every role of that module that goes and every other path that stays. A removal with no other path also asks, because it takes roles, and says that the recipient no longer reaches the module after Save (owner review pending).
- Administrator picks a person whose group already gives a module. Granted lists that path as a read-only row, "Through <group>", and the group name opens that group on Grants. A role that includes the module, such as Tenant administrator for Ask, reads "Included in <role>" and opens Advanced access. The Catalog row stays, with "Also through <source>", so a direct role can still be added. Granted then shows both paths. One line under the list says that this screen writes the roles given to the recipient directly, and that group paths change on Groups.
- Administrator opens the screen for a tenant with a switched-off module. The module takes no new grant: its Catalog row cannot be ticked, and select all and Add all shown skip it. Its Granted rows stay, the role choice is read-only, the row reads "Inactive, the <module> module is off", and Remove stays available.
- Administrator switches the module on again. The kept assignments apply once more. Nothing is rewritten, because nothing was deleted.
- Administrator reads a line under the transfer list that names the roles of this recipient that the catalogue does not show, for example Tenant administrator or a module role at one record, with a link into Advanced access. Nothing is hidden.
- Administrator opens Advanced access and adds or removes core administration, the Auditor role, a module role at one record of a module that owns records, or a custom role. It writes through the same role-assignment service and keeps the same safeguards.
- Administrator tries to remove the last active path to Tenant administrator, or their own Tenant administrator role. The Remove control is disabled with the reason, as on People and Groups. The rule counts the people who would still administer the tenant, not the assignment rows: only an active person counts, a path through an archived group counts for nobody, and two paths to one person are still one person (R-38).
- Administrator saves a batch that the screen believed was allowed, because somebody else removed the other administrator while this page was open. The server refuses, the screen states the reason where the pending count sits, and every unsaved change stays on the screen.
- Administrator changes the recipient with unsaved changes. A confirm step names the count and offers Discard.
- Administrator opens Overview, chooses "By group or person" or "By module", then picks one subject. Nothing loads before that. Results are searchable and paged, and each row names the holder, the module, the role, the path, and who added it (R-37b).
- Administrator reads a row that says "also through Finance team": that same person reaches that module twice, so removing one path leaves the other. Two different groups holding the same module are not each other's alternate path, and the page never says so. The page explains this under the table and links to the audit log for what changed and when.
- Administrator opens How access works beside the catalogue heading and reads that each module has its own roles, that holding any role of a module gives access, that access adds up across paths, and that a switched-off module or a disabled account still blocks access. The callout is collapsed until it is asked for.
- Administrator arrives from Modules, People, Groups, or Roles through a prefilled link and lands on the same dropdown with the recipient chosen. The link `/admin/access?role=<id>` preselects the module of that role and puts the role in the row's choice, and a link with a core role opens Advanced access (R-37a). S2-24 builds the link. The prototype does not show it.

## UI Requirements
- Renders in the admin portal chrome under one page title, Access, with two tabs: Grants and Overview. The tab is the route, so a link can open either one.
- Grants toolbar, one row at the control height: the label Grant to, a segmented control with Groups and People, the recipient dropdown, then Advanced access at the far right. Switching the segment clears the recipient, and the empty state names the choice. Under 768px the toolbar wraps to two rows.
- The recipient dropdown holds one line, an icon, the name, and one short fact such as "17 members" or the email address. It opens a panel with a search field and the list of that segment, each row with its icon, name, and detail. Groups come first. Escape and a click outside close it.
- Before a recipient is chosen the page shows one card that says a group is the normal path and why. No catalogue loads.
- Help disclosure (design system, Help disclosure): one collapsed button, How access works, beside the catalogue heading on Grants and at the end of the toolbar on Overview. It opens on click, on tap, and on Enter or Space, and Escape closes it. It explains that a role of a module is access and that access adds up. It uses no level words, and it never carries a consequence that the confirmation must carry.
- Catalogue card: the heading "Access assignments", and one line that names the recipient and says that Granted means a role exists and not that the module works today. Then the transfer list. There is no Show filter (owner review pending).
- Transfer list (design system: Transfer list, two-pane form): Catalog on the left, Granted on the right, each with a count, a select-all box, a search field, a quick action for everything shown ("Add all shown", "Remove all shown"), and one button that moves the ticked rows ("Add 3", "Remove 2"). On a phone it is the roster form: one list, Granted first, then Catalog, each under a sticky heading.
- Both panes group their rows under the captions Modules and Core. Every enabled module has a row, also a module that owns records. The Core group holds one row, Ask, which the core system role `Ask user` grants. Solutions join as a third group later (R-37a). The headings are captions inside the pane, never a second bordered box.
- Each Granted row offers the module's roles by name in a select at the sm control height, the default access role first and labelled "(default)", then the other roles in declared order. A module with one role, such as Ask with `Ask user`, shows the role name as static text and no control. On a phone the choice sits on a second line of the row, at full row width.
- A row whose change is unsaved carries a Pending pill. A swapped role shows the old role struck through under the new one.
- Granted holds the editable row of each direct role and one read-only row for each other path that opens the module. A read-only row has no checkbox. It shows its source line with the link, and a group path also shows its role as static text. A one-record path carries the One record pill. A Catalog row that the recipient reaches through such a path at whole-tenant scope carries a third line, "Also through <source>". The Granted count counts modules and Core entries, not rows.
- A row whose module is switched off reads "Inactive, the <module> module is off" in its detail line and carries an Inactive pill. On the Catalog side its text is muted and its checkbox is disabled. Muted text, not reduced opacity, keeps the contrast at AA (owner review pending; `../../design-system/tokens.md` asks for a dimmed row). On the Granted side the role choice is read-only and the checkbox stays live, so the assignment can be removed.
- A line under the transfer list, "Not shown here", names every role of this recipient that the catalogue cannot show, with its module or Core and its scope, and links to Advanced access.
- Remove confirmation (confirm dialog of the design system, a bottom sheet on a phone): the title names the module and the recipient, "Remove Invoices from Jamie Chen?". The body has one sentence of consequence, a list "Roles that go", and a list "Paths that stay" with each other path and its role. With no other path the second list is one sentence that the recipient no longer reaches the module after Save. Cancel has focus. The action uses the danger tone. The dialog never says that access was revoked when a path stays.
- Pending bar: sticky at the bottom of the page while anything is unsaved. It counts the changes as to add, to change, and to remove, and holds Cancel and Save changes. A swap counts once as to change. Under 768px the primary action also sits in the shell's bottom bar.
- Save shows the button's loading state, then a toast that says the audit log records the change.
- Advanced access: a slide-over of 560px on desktop and a full-height sheet on a phone. At the top one list, "Advanced roles of <recipient>", each row with the role, its module or Core, a scope pill (Whole tenant or One record), and Remove. Below, "Add a role": a role picker grouped Core (Tenant administrator, Auditor), Module role at one record, and Custom roles. A module role here exists only for a module that owns records, and then needs one record picked by search. A staged row carries a Pending pill, and a staged removal offers Undo. One Save writes additions and removals together through the one assignment service.
- A switched-off module blocks every add in Advanced access too, with an amber line, and keeps removal.
- A removal that the rules refuse is disabled in place with its reason on the row and in its title: "You cannot remove your own Tenant administrator role", then "Last active Tenant administrator path. Give the role to somebody else first." A switched-off module is never a reason to refuse a removal.
- Overview: a segmented control, "By group or person" and "By module", then one searchable picker. The module picker lists Modules and Core with Ask. Before a subject is chosen the page shows one card that explains the choice and says that nothing is read before then, which is why there is no all-people by all-modules matrix.
- Overview results: a header line with the count and the subject, a search field over the results, a table with Who, Module, Role, Path, and Added (the date and who added it), and a pager of ten rows that names the range and the total. Under 768px the table is a card list.
- The Path column names "Direct assignment" for a person's own role, "via <group>" for a group path, and, in a module lookup, "Group, <n> members" for a group holder. A role limited to one record carries a "One record" pill with the record, and a custom role carries a Custom role pill. A whole-tenant row carries no scope pill (owner review pending).
- A row whose assignment does not apply right now carries a "Not in effect" pill with the reason: an archived group, a disabled person, or a module that is switched off.
- A row names another path as "also through <group>" only when the sentence behind it is true: remove this assignment, and that same person still reaches that same module. The path belongs to the same person, applies right now, and covers the whole module. Groups do not nest, so the read expands a person through their own groups only (R-37d). In a module lookup two different holders are never each other's alternative path.
- Under the table, one line states that access can arrive more than once and that removing one path can leave another, and links to the audit log for history.
- Every destructive step uses the confirm dialog from the design system: the title names the object, one sentence of consequence, Cancel focused.
- Sample data in the prototype is fictional: the tenant Harbor Point, people at `example.com`, and the four built modules with their owner defaults, Invoices "Viewer", Analytics "Analytics editor", Slides "Slides editor", and Placeholder "Placeholder user", plus Ask "Ask user". Analytics is the switched-off module.
- Tokens: blue for primary actions, links, and the selected row, neutral gray label pills, amber only for a real warning, rounded-xl cards, rounded-lg controls. No screen in this section carries a debug or prototype panel, and no card explains the product at length.
- Out of scope: an all-recipients by all-modules matrix, a background access scan, a reporting engine, history of changes (the audit log owns it), and editing a module's own records.

## Captures

The prototype captures are light theme, at 390 x 844 and 1440 x 900. Open a state with `access.prototype.html?screen=grants&state=<state>`.

| State | Captures | Shows |
| --- | --- | --- |
| `role-choice` | `prototype-role-choice-390.png`, `prototype-role-choice-1440.png` | A role swap on a Granted row, Modules and Core groups |
| `add` | `prototype-add-390.png`, `prototype-add-1440.png` | Add with the default access role |
| `remove-confirm` | `prototype-remove-confirm-390.png`, `prototype-remove-confirm-1440.png` | Remove confirmation with roles that go and paths that stay |
| `remove-last` | `prototype-remove-last-390.png`, `prototype-remove-last-1440.png` | Remove confirmation with no other path |
| `module-off` | `prototype-module-off-390.png`, `prototype-module-off-1440.png` | A switched-off module |
| `core-ask` | `prototype-core-ask-390.png`, `prototype-core-ask-1440.png` | The Core group with Ask |
| `overview-recipient` | `prototype-overview-recipient-390.png`, `prototype-overview-recipient-1440.png` | Overview by person |
| `overview-module` | `prototype-overview-module-390.png`, `prototype-overview-module-1440.png` | Overview by module, two pages |
| `advanced` | `prototype-advanced-390.png`, `prototype-advanced-1440.png` | Advanced access |
| `advanced-guard` | `prototype-advanced-guard-390.png`, `prototype-advanced-guard-1440.png` | The last-administrator guard |

The captures of 2026-09-18 stay in this folder as history. Each one below shows the old model where it says "Replaced". Do not build from a replaced capture.

| Old capture | Status |
| --- | --- |
| `grants-catalog.png`, `grants-catalog-mobile.png`, `grants-mobile.png`, `grants-pending.png` | Replaced by `role-choice` and `add` |
| `grants-filter.png` | Replaced: the Show filter is gone |
| `grants-broader.png`, `grants-broader-help.png` | Replaced: the Broader access card is gone, a record limit is in Advanced access |
| `grants-remove-confirm.png`, `grants-remove-consequence.png` | Replaced by `remove-confirm` and `remove-last` |
| `grants-module-disabled.png`, `grants-module-disabled-remove.png`, `grants-module-disabled-mobile.png` | Replaced by `module-off` |
| `grants-advanced.png`, `grants-advanced-core.png`, `grants-advanced-blocked.png`, `grants-advanced-direct-roles.png`, `grants-advanced-retired-level.png`, `grants-mobile-advanced.png` | Replaced by `advanced` |
| `grants-advanced-direct-protected.png` | Replaced by `advanced-guard`, the self-protection reason has no new capture |
| `overview-person.png`, `overview-person-mobile.png`, `overview-group.png`, `overview-inactive.png`, `overview-mobile.png` | Replaced by `overview-recipient` |
| `overview-module.png`, `overview-record.png` | Replaced by `overview-module` |
| `grants-empty.png`, `overview-empty.png`, `grants-picker-open.png` | Still current, the states did not change |
| `grants-person.png` | Still current for the "Also through" line and the direct-only note, not for its rows |
| `grants-help.png`, `grants-help-dark.png`, `grants-help-mobile.png`, `overview-help.png` | Layout still current, the text is replaced by the prototype's help text |
| `overview-dark.png` | Still current for the dark theme only, not for its columns |

`data.json` and `types.ts` still describe the model of 2026-09-18, with levels and solution rows. The prototype carries its own sample data. S2-21 to S2-23 take their types from the server read of R-37d, not from `types.ts`.

## Configuration
- shell: true
