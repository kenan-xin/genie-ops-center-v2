# Genie Ops Center design change log

One entry per design change in this repository, newest first. Each entry names what changed and why. A platform decision is cited by its `DEC-` number. The root `CHANGELOG.md` belongs to Design OS, the tool that runs this repository, and is a different file.

## 2026-09-19

### Changed, four pieces of accepted guidance are now carried by the design source

- **Scroll locking has a definition now.** It means two things and only two: a person cannot scroll the background, and focus cannot leave the panel. Scrolling inside the panel keeps working. Hiding the overflow of `body` and of every scrolling ancestor of the panel is the whole mechanism, and no scroll-position freezing is added on top of it. `tokens.md` says so in place, and it names what the tree measures and what it does not.
- The modal check now measures a wheel inside the open panel as well, on the module review, which is the longest sheet in the tree. The panel moved 300px on desktop and 700px on a phone while the page behind it moved 0px. A keyboard page-down while focus is inside a panel moves the shell 0px on both.
- Measured: a wheel over the page, a keyboard page-down, and a wheel inside the panel, on desktop and phone. Not measured and not claimed: a touch drag, a trackpad momentum fling, a scrollbar drag, and any assistive-technology scroll. The withdrawn desktop measurement from before 2026-09-19 is marked as withdrawn at the top of `verify-modals.mjs` and in `tokens.md`.
- **Every retained assignment stays reachable.** The Advanced list no longer keys on `level === "custom"`. It lists everything the level controls cannot reach: a role picked directly, a level the module has retired, a level whose role the module no longer declares, and a module that is no longer compiled. Each row names what the deployment no longer declares and stops there; it never says what a retired or unknown key still grants, because that is the server's answer under the permission evolution policy.
- A representative fixture carries it: `ra_old_audit` is held at the `audit` level of Solutions, which that module does not offer, and its role is not in the picker either. It is not a `custom` grant, so a list keyed on that value misses it. The check stages its removal, saves it through the one Save, and reopens to confirm. The archived group holding it does not block the removal, and the administrator safeguards are unchanged.
- **B4 and B5 are accepted in v2 and the design follows them.** The decision file marks both closed and points at `docs/architecture/module-contract.md` as the authority rather than copying it. `product/sections/audit-and-tenant-settings/spec.md` gained the points the design did not carry: per-row outcomes with retry rather than a cross-module transaction, a disabled compiled module keeping its record placement while contributing no editable record rows, placement never granting access, and the section permission being an AND restriction on top of `core:settings:manage` rather than a substitute for it. The two 2026-09-18 amendment files are marked accepted and note where the accepted text is stricter than what they asked for.
- B1 to B3 and B6 to B8 remain open and unchanged.
- **Capture provenance.** The inventory is 345 entries, one more than before: `grants-advanced-retired-level`. Every capture was regenerated, and the bytes of nine changed: the five Advanced sheets, because the card heading changed, `overview-module` and `overview-record`, because the new retained assignment appears in them, and three unrelated files. Of those three, `solution-viewer-streaming` is reproducibly unstable between runs, because it captures a frame of a streaming animation; a byte difference there never means the source changed. The other two were stable on an immediate second run, so their first difference looks like cold-start timing rather than a source change. The manifest check counts names, files and sizes. It is an inventory, not proof that any image was made from the current source.
- Files: `src/sections/access/components/AdvancedAccess.tsx`, `product/sections/access/data.json`, `product/sections/audit-and-tenant-settings/spec.md`, `product/design-system/tokens.md`, `product/decisions-open-2026-09-19.md`, `product/amendments-{categories-2026-09-18,settings-2026-09-18}.md`, `scripts/capture/{rest-access.json,verify-access.mjs,verify-modals.mjs}`.
- Checks after this round: 20 guard checks, and 86 + 85 + 43 + 20 + 37 + 135 browser checks.

### Fixed, a directly assigned role could be added but never taken back

- Grants named the roles it cannot edit and sent the administrator to Advanced access to change them. Advanced listed only the additions staged in that sitting, so an existing directly assigned role had no removal path anywhere in the screen.
- The card is now "Roles assigned directly", one list holding what the recipient already holds and what is staged to be added. Each existing row names its module and its scope and carries Remove; a staged removal marks the row Pending removal and offers Undo. An empty list says so by name.
- Nothing is written until Save, and one Save writes additions and removals together through the same procedure. No callback and no writer was added.
- A refused removal is disabled in place with its reason on the row: self-protection first, then the last active holder rule with the line about giving the role to somebody else first. A switched-off module is never a reason to refuse a removal, so a kept grant stays removable there too.
- Preview switches for the guard cases: `?admins=picked` gives Leila the role through the direct path and takes the administrators group's grant away, so hers is the only active path; `?admins=self` gives the signed-in administrator the same role, so her own row is refused while somebody else still holds it.
- Two captures were added for the new list: `grants-advanced-direct-roles` and `grants-advanced-direct-protected`. The inventory is 344 entries.
- Files: `src/sections/access/components/AdvancedAccess.tsx`, `src/sections/access/AccessGrants.tsx`, `product/sections/access/spec.md`, `scripts/capture/{rest-access.json,verify-access.mjs}`.

### Fixed, the open-decisions file counted its own rows wrong and called the first round closed

- `product/decisions-open-2026-09-19.md` said "six" in three places while its table already held eight rows, B1 to B8, and it described the first round of corrections as closed. The v2 owner's verification confirmed that round only in part, so the closure claim was wrong when it was written.
- The count is corrected, the first round is described as what it was, and the two later rounds are named. The eight rows themselves are untouched and remain proposed and open. The owner's narrower positions on B2 and B3 are pointed at, not folded in, because the rows stay open until the canonical amendments are applied.
- Files: `product/decisions-open-2026-09-19.md`.

### Fixed, the modal scroll check did not measure the shell's own scroller

- The check looked for any element that happened to overflow. On a desktop viewport it found none and reported zero movement, which reads as a pass and proves nothing. The v2 verification said so and was right.
- It now names `main`, the shell's scroll container, states whether that container can scroll at all before it measures, and drives a real wheel event rather than only a script.
- The desktop run moved to 1280 by 720, because the People directory fits inside 900 and the check would again have nothing to measure.
- Recorded rather than fixed: hiding the overflow stops a person scrolling, not a script. The container still moves under `element.scrollTop = n`, and the check prints how far. Pinning the scroll position is a different mechanism and was not asked for. `tokens.md` says this in place.
- Files: `scripts/capture/verify-modals.mjs`, `product/design-system/tokens.md`.
- Checks after this round: 20 guard checks, and 80 + 85 + 43 + 20 + 37 + 127 browser checks. All 344 captures were regenerated after the source stopped changing.

### Fixed, seven defects the independent v2 verification found

Source: the v2 owner's verification of the six corrections below, which confirmed all six only in part. Evidence: `design-correction-verification-2026-09-19`. Each fix below carries a check that fails against the code as it stood before it, so the suite catches the regression rather than passing beside it. The administrator rule was checked by reverting the predicate to its old form: the guard suite then stops at check 16 with no holders found.

- **The administrator rule read the level, not the role.** "Assign a role directly" records the Tenant administrator role at `level: custom`, and the Access guard matched `core` at `admin`, so it counted zero holders and refused nothing. The rule now resolves the role id from the core level and from the role list, and counts by role, so the route a screen took cannot change the answer. Self-protection reads the grant row the change names, for the same reason. `scripts/check-guards.ts` grew to 20 checks: the role resolves from either source, a directly picked role counts as a holder, removal of the last administrator is refused whichever route granted it, the other route stays removable while one remains, and self-protection reads the row. Reverting the predicate to the old level match fails the suite at check 16, so these checks catch the regression rather than pass beside it.
- **A link from one solution lost the solution.** Access received the module, the level, and the record, and used the first two. It now names the solution above the recipient control, keeps naming it after a recipient is chosen, and opens both lists narrowed to it, with Show everything to widen them. A record of a module that owns records is not a catalogue row, so the line points at Advanced access instead, already set to that module and level. Central Access stays the one writer.
- **An ordinary switch-off asked for a second reintroduction review.** The review state was derived from the returned-module fixture and the current enabled bit, so switching an activated module off brought the review back. A completed activation is now recorded in its own right. Access also read its own fixture for enablement and now reads the shared record, so a module enabled on Modules stops reading as switched off there.
- **"Also through" claimed paths that were not paths.** It now means one sentence only: remove this grant and that same person still reaches that same target with that same permission. It matches the permission key rather than the role name, ignores a path that is not in effect, and treats a whole-module grant as covering one record while one record does not cover the whole module. A grant made with a role picked directly carries no level, so it neither claims a path nor serves as one.
- **One audit event still described ordinary removal as deletion.** The `core:person:removed` event said the identity link was deleted and the audit trail kept under an anonymized name, which R-43 forbids. It now names a retained person and says sessions ended and memberships and direct assignments were removed, with name, email, and audit history kept and the identity-provider account untouched. The separate erased-actor event is unchanged, because erasure is a real and different thing.
- **Nested overlays fought each other.** Every overlay handled Escape and Tab, so one press closed a confirm and the sheet that raised it, Cancel dropped focus to the body, and the shell's own scroll container kept moving behind the scrim. Only the innermost overlay answers the keyboard now. Closing a confirm leaves its sheet open with focus back on the control that raised it. The outermost overlay stops `body` and every scrolling ancestor of its panel, and the last one to close gives them back. The opener is learned by following focus while the panel is closed, because a panel applies its own `autoFocus` during the same commit, and focus inside another overlay counts only when that overlay is the one this panel opens from.
- **Filled buttons kept a resting shadow.** `shadow-sm shadow-blue-600/20` and `shadow-sm shadow-red-600/20` are gone from every primary and danger style across the seven helper families. Menu, dialog, and sheet shadows are untouched. `grep -rn "shadow-sm" src/sections src/shell` returns nothing.
- Found while testing the lifecycle sequence: the Modules table drew a switch whose input is visually hidden with no label around it, so pressing the track did nothing. The bare switch now sits in a label. The labelled switch row already had one.
- Files: `src/sections/access/components/{helpers.ts,AdvancedAccess.tsx,GrantsScreen.tsx,OverviewScreen.tsx,TransferList.tsx}`, `src/sections/access/{AccessGrants,AccessOverview}.tsx`, `src/sections/audit-and-tenant-settings/{ModulesPage.tsx,components/ModulesPage.tsx}`, `src/shell/demoState.ts`. The modal hook changed in all five `components/helpers.ts` of access, people-groups-and-roles, audit-and-tenant-settings, solutions and branding; the button shadow also left account-and-inbox, email-templates and sign-in-and-tenant-pages. Documents: `product/sections/access/spec.md`, `product/sections/audit-and-tenant-settings/{spec.md,data.json}`, `product/design-system/tokens.md`. Checks: `scripts/check-guards.ts`, `scripts/capture/{verify-access,verify-modules,verify-modals}.mjs`.
- Checks after this round: 20 guard checks, and 64 + 85 + 43 + 20 + 37 + 123 browser checks. All 342 captures were regenerated after the source stopped changing.

### Fixed, the last-administrator rule counted grant rows instead of people

- The rule now counts the people who can administer the tenant right now, never the assignment rows. Only a person whose status is `active` counts: a pending person has not signed in yet and a disabled person cannot sign in, so neither can administer the tenant today. A path through an archived group counts for nobody, because an archived group keeps its assignments and grants nothing. Two paths to one person are still one person.
- Archiving a directory group is now one of the writes the rule guards, because archiving stops the group granting. The Archive control carries the reason and is refused when the group is the last active path.
- Advanced access no longer counts `core/admin` rows. It reads the same predicate the People and Groups screens read, so three grant rows that carry one active person still refuse the revoke.
- Save now models a server refusal. The screen check explains the rule first; the save runs the rule again against the assignments as they are at that moment, and a refusal keeps every unsaved change on the screen.
- `?admins=edge` on Access adds a core administration grant to a pending person and one to an archived group, so the three-rows-one-person case can be read.
- `node scripts/check-guards.ts` runs 14 checks over the pure predicate: empty groups, pending and disabled people, overlapping grants, group archival, self-protection, and a grant list that changed between load and save. The client check is not the security boundary; the server holds the rule.
- Files: `src/sections/people-groups-and-roles/components/helpers.ts`, `PeopleDirectory.tsx`, `GroupInspector.tsx`, `src/sections/people-groups-and-roles/{PeopleDirectory,GroupsDirectory}.tsx`, `src/sections/access/components/helpers.ts`, `AdvancedAccess.tsx`, `GrantsScreen.tsx`, `src/sections/access/AccessGrants.tsx`, `product/sections/access/types.ts`, `product/sections/access/spec.md`, `product/sections/people-groups-and-roles/spec.md`, `scripts/check-guards.ts`.

### Fixed, Assign a role directly looked like it saved and wrote nothing

- The action called an optional callback the preview never supplied, cleared its state, and closed. The role was never assigned.
- It now stages the request into the sheet's own pending list, beside the level changes. The pending count covers it, a Remove control takes it back, and one Save writes the whole list through the one assignment procedure. `onAssignRole` is gone: a second writer would have missed the shared guard, the module gating, the audit entry, and the notifications.
- `onSave` answers `{ ok: true }` or `{ ok: false, reason }`. A missing save procedure is a refusal, not an apparent success.
- Solutions dropped `onAddAccess` and `onRemoveAccess`. They were unused and offered a second, underspecified assignment path. Navigation to central Access is the whole contract.
- Files: `src/sections/access/components/AdvancedAccess.tsx`, `GrantsScreen.tsx`, `src/sections/access/AccessGrants.tsx`, `product/sections/access/types.ts`, `product/sections/solutions/types.ts`.

### Fixed, the module reintroduction review could not finish its own journey

- The review, central Access, and Tenant settings each read their own fixture, so the journey the screen describes could not be walked. They now share one preview record: the assignments Access revoked and the values settings saved are read back by the review.
- The Access fixture gained the Asset register module, its asset groups, its recipients, its roles, and the five retained assignments under the same ids the review lists. A retained row now links into Access with that recipient and that module already chosen.
- Proven end to end by `scripts/capture/verify-modules.mjs`: open the review at 3 of 5 restoring, follow a row into Access, remove that assignment, return, and read 2 of 4 with the row gone and the module still off. Then the corrected review activates it.
- Also proven: a value saved in the module's settings section appears in the reopened review, and saving settings never switches the module on.
- `Will not restore` became `Does not restore now`, and the panel says the assignment is kept, not deleted. The verdict is a point in time for this activation. A later membership, status, scope, permission, or entitlement change is judged again by ordinary authorization.
- Ordinary enable and disable are unchanged, and cancellation, validation failure, and activation failure behave as before.
- Files: `src/shell/demoState.ts`, `src/sections/audit-and-tenant-settings/{ModulesPage,TenantSettings}.tsx`, `components/ModuleReview.tsx`, `components/helpers.ts`, `product/sections/audit-and-tenant-settings/{types.ts,data.json,spec.md}`, `product/sections/access/data.json`, `product/amendments-modules-2026-09-19.md`, `scripts/capture/verify-modules.mjs`.

### Fixed, four pieces of copy described behavior the product does not have

- Access Overview said two unrelated groups holding one record were each other's alternate path. `also through` is now true only within one effective person. In a module or record lookup it appears only when one holder carries both rows.
- Removing a person said the identity link was deleted and the audit trail kept under an anonymized name. Removal ends every session and drops groups and direct roles. The name, the email, and the audit trail stay, and the identity-provider account is untouched. Anonymizing a person is the separate operator command.
- The audit sheet offered Open whenever the target still existed. A record resolver may return a label with no path, and a reader allowed to read the event may not be allowed to read the record. Open now needs a path the server supplied on the event, and the screen never builds a route from the target type. A target that exists without a path reads `No link`.
- Branding said a Publish applied the sender name and reply-to to the realm's SMTP settings, which its own write contract forbids. Branding owns the sender display name, the reply-to, and the footer of the emails Genie sends. The realm sender behind Keycloak's credential emails stays operator-owned and no Publish writes it.
- Files: `src/sections/access/components/OverviewScreen.tsx`, `src/sections/people-groups-and-roles/components/{PeopleDirectory,PersonInspector}.tsx`, `src/sections/audit-and-tenant-settings/{AuditLog.tsx,components/AuditEventSheet.tsx,components/AuditLog.tsx}`, `src/sections/branding/components/BrandingPage.tsx`, `src/sections/email-templates/components/MailClientFrame.tsx`, and the matching specs, types, and fixtures.

### Fixed, five modal families labelled themselves modal and trapped nothing

- The panels carried `aria-modal` and handled Escape, but the keyboard walked straight out of them, the page behind them scrolled, and focus never came back to the control that opened them.
- One hook, `useModalFocus`, now carries all four behaviors, and it sits in each section's `components/helpers.ts` beside the rest of that section's shared pieces. Focus moves into the panel, Tab and Shift+Tab cycle inside it, the page behind cannot scroll, and focus returns to the opener. The scrim left the tab order, because Escape and Cancel already close the panel.
- A confirm dialog opened inside a slide-over no longer gives the page its scroll back when it closes.
- Verified by `scripts/capture/verify-modals.mjs`: 101 checks over the Access slide-over, the module review, the person inspector, the configure-solution sheet, and a Branding dialog, on desktop and on a phone, covering Tab, Shift+Tab, Escape, Cancel, and the return of focus.
- This is the preview's stand-in. Production builds the same four behaviors on the approved Base UI dialog, which needs its own test there. The design tool's own stack did not move.
- Files: the five `components/helpers.ts` and `components/ui.tsx` pairs, `src/sections/branding/components/previews.tsx`, `product/design-system/tokens.md`, `scripts/capture/verify-modals.mjs`.

### Fixed, the token ladder and two stale descriptions

- The 14 arbitrary pixel text sizes across five reference files now use the semantic scale: a group caption is `text-xs`, a secondary row is `text-sm`, chat body copy is `text-base`. `grep -rn "text-\[[0-9.]*px\]" src/sections src/shell` returns nothing.
- The eight resting surfaces that carried `shadow-sm` now carry the documented hairline ring. A shadow is for a menu, a dialog, and a sheet.
- `rounded-sm` left Branding: the tenant letter tile takes the 6 px tile token and the inline link takes the link radius.
- `tokens.md` said menus are 8 px, two sections after the ladder that reduced them to 6 px. It says 6 px now.
- `tokens.md` described the phone help callout as anchored to its button. It is pinned to the viewport gutters under 640 px, which is what the components do and why they cannot be clipped.
- The approved fonts did not change. The preview still loads them from Google Fonts, which is a documented portability limit of this tree and not permission to ship remote fonts. Production self-hosts them.
- Files: `src/shell/components/MainNav.tsx`, `src/sections/solutions/components/{SolutionViewer,ChatThemes}.tsx`, `src/sections/branding/components/BrandingPage.tsx`, `src/sections/audit-and-tenant-settings/components/TenantSettingsPage.tsx`, `src/sections/access/components/{GrantsScreen,OverviewScreen}.tsx`, `src/sections/account-and-inbox/components/AccountPage.tsx`, `src/sections/email-templates/components/EmailGallery.tsx`, `src/sections/sign-in-and-tenant-pages/components/AuthFrame.tsx`, `product/design-system/tokens.md`.

### Added, one decision table for the product owner

- `product/decisions-open-2026-09-19.md` holds the eight questions that need an owner, not a designer: who assigns a role when a person is added, the activation read model, review freshness and stale recovery, module-owned category writes, settings search permissions, sign-in for existing local accounts once creation is off, the member and administrator shapes in Solutions, and the chat theme shape.
- Each row states a recommendation, the alternatives, what each one costs, and the canonical documents that change. Every row is proposed and open. No v2 document was amended and no design was changed for them.

### Fixed, a card drew a box inside a box inside a box

- Reported against the Branding Identity tab, and found on six more screens. A card drew a second bordered container inside itself, and on Identity that container drew a third around the artwork. Three hairline rectangles surrounded one logo file. The Typography tab lost its inner box on 2026-09-18, but the same shape stayed on Identity, on Colors, and in every preview panel.
- `product/design-system/tokens.md` gained a section, Nesting of bounded surfaces, so the rule stops depending on somebody noticing the shape again. A card, a dialog, a sheet, and a slide-over are the one frame their content gets. Inside that frame, groups are separated by space and by hairline rules. A border inside a frame is earned only when it carries a different background the content must be read against, a scroll boundary, a semantic tone, or the boundary of a control.
- Branding, Identity: the box around each image slot is gone. The specimen tile keeps its border, because a white logo on a white card needs a boundary to read as a surface, and the size strip has to show the mark at 16, 32, and 48 px against a known background. One box per slot, not two.
- Branding, Identity: with the slot box gone, Replace and Remove no longer stretch to the far card edge. The file, its facts, and its two actions pack to the left as one group. An action pinned 450 px from the file it acts on reads as belonging to nothing.
- Branding, Identity: the uploading state dropped its box too, so the four states of one slot no longer change the card's box count as the upload runs. The refused-file state keeps its red box, because that tone is the alert.
- Branding, Colors: the box around the primary color, its two specimens, and the contrast report is gone. The specimens keep their borders. This is the shape the Typography tab already carried.
- Branding, every tab: the preview fills its card edge to edge. The card border is the preview's frame, and the scaled shell, the sign-in page, the email, the footer, and the locale samples each dropped the frame they drew for themselves. The card takes `overflow-hidden` so a square preview corner stays inside the card radius. The enlarged copy keeps its own border, because there it floats on a scrim with no card around it.
- `MailClientFrame` gained a `flush` prop for the same reason. It still draws its own border in the Email templates gallery, where it floats on the page.
- Categories, phone: Assign items listed one bordered card per item inside the page card. It is a divided list now, in the card the section already had, with rows on the card's own gutter.
- People, the person slide-over: four bordered lists stacked in a 480 px panel. Audit log, the event sheet: the target block and the details list carried the same boxes. Groups, the group slide-over: two more. All of them are divided lists now, aligned to the panel gutter. The JSON block keeps its border and its gray fill, because it is a code surface with its own scroll.
- Left alone on purpose: the empty drop zone keeps its dashed border, which is the drop target; the blue-tinted blocks in the person slide-over keep theirs, which is a tone; every input, select, and segmented track keeps its own, which is a control boundary.
- Files: `src/sections/branding/components/BrandingPage.tsx`, `previews.tsx`, `src/sections/email-templates/components/MailClientFrame.tsx`, `src/sections/audit-and-tenant-settings/components/AssignItems.tsx`, `AuditEventSheet.tsx`, `src/sections/people-groups-and-roles/components/PersonInspector.tsx`, `GroupInspector.tsx`, `product/design-system/tokens.md`.
- The type check passes, the lint reports nothing, and `impeccable detect` returns an empty array over the four sections. Captured at 1280 and 390 px in both themes with no console errors. Every capture in `rest-branding`, `branding-dialogs`, `rest-people`, `rest-audit`, `categories`, and `rest-email` was refreshed.
- `scripts/capture/verify-branding.mjs` crashed before this pass, for a reason that predates it. `getByRole('button', { name: 'Publish' })` matches by substring, so it selected the "How publishing works" help button, which comes first in the DOM. The selector takes `exact: true` now and the suite reports 20 of 20 pass. `verify-categories`, `verify-modules`, and `verify-access` pass unchanged.

### Changed, the crushed search field was in every admin toolbar, not only Solutions

- The Solutions fix below treated one page. The cause was shared: `SearchField` carried `min-w-0 flex-1` with a 320px cap in every section, so it was the only control in a toolbar that could shrink and it absorbed the whole shortfall while each select kept its intrinsic width.
- The floor and the cap now hold in all three copies of `SearchField`, in `solutions`, `audit-and-tenant-settings`, and `people-groups-and-roles`: a 192px floor and a 384px cap. The field wraps to its own line instead of shrinking to nothing.
- Audit log: four selects stood in the row beside the search field. Actor, Action, Target, and Date range moved behind one Filters button with a count, and the custom date inputs moved into the panel under the range they belong to. The chips and the Clear all it already carried did not change.
- People directory: three selects stood in the row. Status and Group moved behind the Filters button. Sort stayed in the row, because it orders the list and never removes one. Removable chips and a Clear all are new here, and the no-match row now offers Clear filters instead of naming filters with no control.
- Groups, Roles, and Modules keep their one narrowing control or none, so none of them took a Filters button. Their help disclosure dropped to its icon, which returns about 180px to the search field on each page.
- Every toolbar help disclosure is the icon beside its search field now, at 44px square under `sm` and 40px from `sm`, with the label in `aria-label` and in `title`. A disclosure outside a toolbar keeps its written label. Recorded in `product/design-system/tokens.md`, Help disclosure.
- The Filters pattern is written down as its own rule, `product/design-system/tokens.md`, Filter disclosure: when a control goes behind the button, why Sort never does, and the chip row that keeps the panel from holding hidden state.
- Three Unicode glyphs standing in for icons were replaced with drawn ones while the files were open. The People select drew its chevron as a text glyph, so it rendered unlike every other section's select. A chat theme chip used an arrow glyph for the send mark, and the viewer breadcrumb used one for its separator. All three are Lucide icons now.
- The People select also moved to `pr-9` with the drawn chevron, so the three section selects read alike. The Groups archived checkbox took the 44px touch floor it was missing under `lg`.
- Files: `AuditLog.tsx`, `ModulesPage.tsx`, `PeopleDirectory.tsx`, `GroupsDirectory.tsx`, `RolesDirectory.tsx`, `ChatThemes.tsx`, `SolutionViewer.tsx`, the `ui.tsx` of `audit-and-tenant-settings` and `people-groups-and-roles`, plus `product/design-system/tokens.md` and the two section specs.
- Type check, lint, and the design detector pass. Seven screens captured at 1280 and 390 px, with the filter panel open on Audit log and People, and no console errors.

### Fixed, the help panel no longer runs off the side of a phone

- The panel was anchored to its trigger button. Where the button trails a row, the panel started at the button and ran past the right edge of the screen. Measured at 390px: x=330 to x=650 on Tenant settings, Modules and People directory, and x=234 to x=554 on Access grants. At 320px the same four ran to x=548 and x=452.
- Four screens were affected, not the two first reported. Access grants and People directory were found while fixing it. Access grants was broken even though it passes `align="right"`, which shows the prop was never the answer.
- Under `sm` the panel no longer anchors to the button at all. It is pinned to the viewport with 16px gutters, which is correct wherever the trigger sits: `max-sm:fixed max-sm:inset-x-4 max-sm:bottom-[calc(7rem+env(safe-area-inset-bottom))] max-sm:top-auto max-sm:w-auto max-sm:max-w-none`.
- Each class earns its place. `max-sm:top-auto` neutralises `top-full`, which under `fixed` means 100% of the viewport height and would throw the panel off the bottom. `max-sm:w-auto` drops `w-80`, because an explicit width beats the `right` edge and a 320px screen would still overflow by 16px. `max-sm:max-w-none` retires a cap that has no job once both edges are set.
- The `align` branch moved from `right-0 max-sm:left-0 max-sm:right-auto` and `left-0` to `sm:right-0` and `sm:left-0`. This was necessary, not tidying: Tailwind emits `inset-x` before `left` and `right`, so a base `left-0` would override the pinned left edge whatever the order in the class string. Scoping `align` to `sm` removes every horizontal rule below 640px.
- The `max-sm` flip added earlier on 2026-09-19 is gone. It was written for a right-aligned button that wraps to the start of a line on a phone. Phones no longer anchor to the button, so that case is covered too.
- Bottom offset measured, not guessed. At 390x844 the toast occupies y 736 to 780 and a sticky bottom bar occupies y 767 to 828. The panel bottom lands at 732, which clears the toast by 4px and the bar by 35px. `6rem` would have overlapped the toast by 12px. The `env()` term matches the toast's own formula so the clearance survives a notched device.
- `z-30` is unchanged and correct. It beats the bottom bars, which sit at `z-index: 10` or `auto`, and stays under the `z-40` slide-overs and `z-50` dialogs and toasts, because a modal must cover a help note.
- All five copies of `HelpNote` carry the identical change. They were already not identical: the panel div was byte-identical in four of five, and every real difference was in the trigger button, which was left alone. `access` accepts `iconOnly` but does not size for it. `branding` has no `iconOnly` prop at all. `solutions` shares its dismiss hook and panel chrome with `FilterMenu`, so the phone classes went on the `HelpNote` panel inline and `FilterMenu` is untouched.
- Verified independently of the agent that made the change. At 320px and 390px all four screens now measure x=16 to the gutter with the panel bottom at 732, fully inside. At 1280px every box is unchanged, and Tenant settings still measures x=704 to x=1024, which is the pre-fix baseline. The disclosure still opens on click, Enter and Space, closes on Escape and on an outside click, and keeps `aria-expanded`, `aria-controls` and a `role="group"` panel with the same accessible name.
- Known property of the pattern, not a screen defect: a bottom-pinned panel can cover its own trigger when the trigger scrolls into the pinned band. Escape, the Close control inside the panel and an outside click all still close it, each verified. A report that Access grants always covers its trigger did not reproduce: at 390px its trigger measures y=1191 while the panel occupies y=457 to y=732.
- Three more capture selectors were converted from button text to the accessible name, because the other session made the Modules, Tenant settings and Roles directory disclosures icon-only and a text selector no longer matches an icon. No help-label text selector remains in any manifest.
- Nine captures that open a help panel were refreshed: `grants-help`, `grants-help-dark`, `grants-help-mobile`, `grants-broader-help`, `overview-help`, `groups-inspector-help`, `roles-directory-help`, `modules-help` and `tenant-settings-search-help`.
- Files: the five `src/sections/*/components/ui.tsx`, plus `scripts/capture/access-help.json` and `scripts/capture/searchfield.json` for the selectors.
- 62, 43, 37 and 42 checks pass in the four suites, the type check passes, the lint reports nothing, and the capture guard reports 342 entries, 342 names and 342 files with no size mismatch.

### Raised for v2, the module reintroduction read contract, and four questions that are already open there

- Nothing changed in this repository in this entry. It is the handover for the v2 owner, so it can be picked up from the change log without reading the design source. Full text with the reasoning is in `product/amendments-modules-2026-09-19.md`.
- The first version of those amendments overstated what v2 is missing. v2 has already decided the behaviour and the durable state. Four points were already settled there and a v2 owner must not spend time on them: `architecture/data-shape.md` already says the durable state must distinguish a returning module from an ordinary disabled one and that its schema and reconciliation ownership are implementation-design gates; `specs/01-deployment-and-setup.md` R-79a already requires administrator review and confirmation on both the UI and the CLI enable path; the lifecycle matrix in `architecture/module-removal.md` already requires an actionable refusal with no partial activation; and that same document already names review invalidation under concurrent grant changes and deliberate work resumption as unresolved.
- What v2 has not written is the read contract: what the server hands the Modules screen so the screen can present the review at all. That is the whole of the ask below.
- **A1, the activation verdict.** The module list response must carry a server-owned verdict per module: `ready` for an ordinary installed module, `review-required` for one reintroduced after a controlled removal. A client must never derive it, because an ordinary switched-off module also carries `enabled: false`. R-79a covers the write path; this is the read path.
- **A3, retained-grant validity.** For a module awaiting review the server must return each retained assignment with its recipient, role, scope, group member count, and a verdict of valid or invalid with a reason. Valid means it restores on activation under current memberships, principal status, resource scope, permission evolution and entitlement. The screen reads this and links to Access; it carries no permission editor, because access is granted in one place (`DEC-39`).
- **A4, retained configuration returned rendered.** The server must return the kept configuration as one row per declared field, in declared order, with the value already rendered for reading. Core holds no copy of the module's schema on that screen, so it cannot turn `straight-line` into `Straight line`, and the server must decide what may leave the tenant: a secret is never sent and reads as a placeholder, an unset field reads as `Not set`. A field the server refuses carries its own status and message. This must not become a second read of raw `tenant_module.config`.
- **A5, what activation does not restore.** The short list of facts about revoked credentials, cancelled work and stopped schedules must come from the server, not from screen copy, because which of them apply depends on what the controlled removal actually did to that module.
- **A2 and A6 are one sentence each on top of existing text.** A2: state that the ordinary enable path refuses a `review-required` module, rather than being a second way in that also checks. Requiring both paths to check leaves a third caller that checks neither. A6: state that the refusal returns a message the client can print, and that the client keeps the completed review so a retry is one press.
- **U4 is the one genuinely new open question.** Whether a recorded review expires, and whether it stays valid for a later command-line activation. The screen holds no review across a page load: closing the panel discards the confirmation.
- One thing the screen will need when concurrency is settled: a confirmation refused as stale must be distinguishable from an ordinary failure, because the recovery differs. Stale asks the administrator to read the list again; a server error asks them to retry the same decision.
- Unrelated wording defect noticed while checking the anchors: `architecture/module-contract.md`, the Configuration schema row, still says "The Tenant Settings page renders one card per module with `ConfigForm`". The page is a section navigator now. `product/amendments-settings-2026-09-18.md` A1 already raised this and names both targets.
- Nothing under `/home/kenan/work/genie-ops-center-v2` was edited. It was read only, to check that these anchors still resolve.

### Fixed, 31 screenshots had two manifests fighting over them

- Every screenshot under `product/` is produced by one entry in one manifest in `scripts/capture/`. 31 of the 342 names had two or more producers, and 13 of those disagreed about the viewport. `modules.png` was a 1280x900 shot from `radius.json` or a 1280x1700 shot from `modules-reintroduction.json`, depending on which manifest ran last. `tenant-settings-mobile.png`, `categories-mobile.png`, `audit-log-mobile.png`, `people-directory-mobile.png`, `groups-directory-mobile.png`, `admin-solutions-mobile.png`, `solutions-hub-mobile.png`, `roles-directory-mobile.png`, `grants-mobile.png` and `grants-module-disabled-mobile.png` had the same problem.
- The disagreement was always the same one. `radius.json` and `access-help.json` take a long phone screen as `phone` plus `fullPage`. `scripts/shots.mjs` says in its own comment why that does not work: the shell scrolls inside its own container, so `fullPage` cannot grow the shot, and a long screen needs a tall viewport instead. The newer manifests use `phoneTall`.
- 34 duplicate entries were removed, keeping one definition per name: a tall viewport beats a short one, no `fullPage` beats `fullPage`, and the newer manifest breaks a tie. `radius.json` went from 56 entries to 41, `access-help.json` from 37 to 20, `searchfield.json` from 25 to 23.
- Nothing was lost. Every duplicate pair had an identical `url` and identical `actions`, so only the image size ever differed, and all 342 capture names still have exactly one producer.
- The three manifests are not retired. They were first read as historical one-off passes, and they are not: `radius.json` is the only producer of 41 captures, including every shell capture and every sign-in capture, and `access-help.json` is the only producer of 18. They are load-bearing.
- `scripts/capture/check-manifests.mjs` is new. It fails when a name has more than one producer, when a name has no file, when a file has no producer, and when a file's pixel size does not match the viewport its entry asks for. It does not compare pictures, so a capture can pass it and still show old content.
- The guard reports clean: 16 manifests, 342 entries, 342 names, 342 files, no orphan, no missing file, and no size mismatch. No capture needed recapturing, because in every conflict the surviving definition was also the one that ran last.
- Files: `scripts/capture/check-manifests.mjs` (new), `scripts/capture/radius.json`, `scripts/capture/access-help.json`, `scripts/capture/searchfield.json`.

### Fixed, Tenant settings had lost the help disclosure three documents describe

- `TenantSettingsPage.tsx` carried no `HelpNote` and did not import one. `spec.md`, `handover-settings-2026-09-18.md` and `help-disclosure-audit-2026-09-19.md` all describe a "What is searched" disclosure beside the search field. The audit file listed it under "already present before this pass", which was wrong, and its "Verified" section only covered the disclosures that pass added.
- Found by two checks that were already failing for one reason: `scripts/capture/verify-settings.mjs` crashed at its last check waiting for the button, and the `tenant-settings-search-help` capture failed the same way.
- The disclosure is restored, icon-only, bound to the search field with a 4px gap, which is the pattern Modules now uses. It states what the index holds, the one-typo rule from four letters, and that a saved value and a secret are never read.
- That rule has nowhere else to appear. The empty search state says it, and a person who finds the setting they wanted never reads the empty state.
- The audit file is corrected: the row moved from "already present" to "added", the counts read 5 and 9, and the correction is dated.
- The capture manifest now clicks the accessible name instead of button text, so an icon-only disclosure still matches. The same fix was needed for `modules-help`.
- Files: `src/sections/audit-and-tenant-settings/components/TenantSettingsPage.tsx`, `scripts/capture/settings.json`, `product/help-disclosure-audit-2026-09-19.md`.
- 43 checks pass in `scripts/capture/verify-settings.mjs`, which previously crashed at check 11. All 21 settings captures succeed. The type check and the lint pass.

### Found, the help panel is clipped on a phone when its button trails a row

- Nothing changed in this entry. It records a shared `HelpNote` defect so it is not lost.
- Measured at 390px on Tenant settings and on Modules. The button sits at the end of the search row at about x=330. The panel is anchored `left-0` to that button, so it runs from x=330 to x=650 on a 390px screen and about 260px of it is off-screen.
- The capture check does not catch it. The panel is clipped rather than scrollable, so `document.documentElement.scrollWidth` does not grow and `shots.mjs` reports no overflow.
- `align="right"` does not fix it. That value reverts to `left-0` under 640px, a patch made on 2026-09-19 for the opposite case: a right-aligned button that wraps to the start of a line. A trailing button and a wrapping button need opposite treatments and the component cannot tell them apart.
- It affects the five copies of `HelpNote` and every phone-width call site whose button trails a row, so the fix is a design-system change and was not made here. The candidate is to stop anchoring to the button under `sm` and pin the panel to the viewport gutters, which is what `design-system/tokens.md` already says a dialog does under 768px.
- Detail in `product/help-disclosure-audit-2026-09-19.md`. Fixed later the same day; see the entry above. Two more affected screens, Access grants and People directory, were found during the fix.

### Fixed, Modules could enable a reintroduced module without its retained-access review

- The design review of 2026-09-19 found one P1 lifecycle conflict. The switch called `setEnabled(id, true)`, which enabled any switched-off module at once and showed a success toast, and the help copy said that switching a module on returns it to everyone's navigation. A module that returned after a controlled removal therefore reached its enabled state without the review that `architecture/module-removal.md` requires before retained grants are restored.
- The module list now carries a server-owned activation verdict. `ready` is an ordinary installed module. `review-required` is a module reintroduced after a removal. The screen never reads the state from `enabled === false`, because an ordinary switched-off module carries that too.
- An ordinary module keeps its old flow unchanged: a switch, an immediate save on switching on, and the danger-tone confirm on switching off.
- A reintroduced module has no switch. Its row reads Review needed in amber instead of Off in gray, and the Enabled cell holds a Review and enable button. The control is absent rather than disabled, because a switch implies the one-step enable the policy forbids.
- The review is the shared slide-over, `ModuleReview.tsx`: the date the module returned, the retained configuration, the retained access as one row per kept assignment with a Restores or Will not restore pill and its reason, and the list of what enabling does not bring back. It only reads. Change assignments in Access opens `/admin/access?module=<id>&level=use`, so there is no second permission editor (`DEC-39`).
- The retained configuration is listed in the panel, not linked to. A first pass only linked to the module's settings section. That was wrong: a decision made one navigation away from its own facts is not a review. The server returns the values already rendered, so core needs no copy of the module's schema and no raw read of `tenant_module.config` leaves the tenant. An enum reads as its label, an unset field as Not set, and a secret as a placeholder.
- Enabling needs a ticked confirmation that names the count of assignments that restore, and valid required configuration. Invalid configuration blocks the confirmation itself: a one-line refusal sits above the list and the field at fault is marked inside it with what to do about it. Saving settings still writes `tenant_module.config` only, so it can never enable a module.
- A refused activation keeps the module off, restores nothing, keeps the completed review, and offers Retry enabling. No success toast appears. Cancel, the close button, Escape and the scrim all cancel and write nothing.
- One line in the panel states that the server runs these checks for the screen and for `genie-ops module enable`, and that the confirmation records a decision rather than enforcing it. The preview must not read as though a client-side checkbox were a security control.
- The Enabled column went from 84px to 150px so the button holds one line, the Module column from 34% to 30%, Category from 200px to 190px, and the table's minimum width from 840px to 900px. The Access column keeps room for two names at 1280px.
- Sample data gained `Asset register`, the sample tenant's reintroduced module, with five retained grants of which three restore, four not-restored facts, and its own settings section. `Approvals` stays the ordinary switched-off module, so both states sit side by side in the table. Neither is a planned product module.
- Five labelled fixtures cover the lifecycle. Ordinary disabled is `Approvals`. Reintroduced and awaiting review is `Asset register`. The two failures are preview switches, following the convention this repository already uses for `?fail=`, `?denied=1` and `?brokered=1`: `?config=invalid` marks the required configuration invalid, and `?fail=1` makes the server refuse the activation. Successful activation is the default path. `?review=<moduleId>` opens the panel on load.
- The Modules page specification wording for the Access column was corrected at the same time. It still described the pill cloud that the 2026-09-18 pass replaced with one line.
- Files: `src/sections/audit-and-tenant-settings/components/ModuleReview.tsx` (new), `ModulesPage.tsx`, `helpers.ts`, `index.ts`, `src/sections/audit-and-tenant-settings/ModulesPage.tsx`, `product/sections/audit-and-tenant-settings/types.ts`, `data.json`, `spec.md`, `product/amendments-modules-2026-09-19.md` (new), `product/handover-modules-2026-09-19.md` (new), `scripts/capture/verify-modules.mjs` (new), `scripts/capture/modules-reintroduction.json` (new), `scripts/capture/categories.json`, `scripts/capture/verify-categories.mjs`.
- The database shape, the durable review-evidence record, the concurrency rule when grants change mid-review, review expiry, and deliberate work resumption are named as backend contract requirements in `product/amendments-modules-2026-09-19.md` and are not invented here.
- Module uninstall, permanent data deletion, and controlled removal are not designed. Until controlled removal is implemented and its lifecycle tests pass, an upgrade that omits a previously installed module stays prohibited.
- `scripts/capture/verify-categories.mjs` asserts the uncategorized count on the Categories page. It moved from 4 to 5, because `Asset register` declares a workspace entry and carries no category. The assertion and its comment were corrected; no behaviour changed.
- The Modules captures moved out of `scripts/capture/categories.json` into the new `scripts/capture/modules-reintroduction.json`, so one manifest owns them.
- 62 checks pass in `scripts/capture/verify-modules.mjs`, 37 in `scripts/capture/verify-categories.mjs`, 42 in `scripts/capture/verify-access.mjs`, the type check passes, the lint reports nothing, and there is no sideways scroll at 1280px or 390px. 16 module captures, 10 category captures and 21 settings captures were refreshed.
- Another session edited `ModulesPage.tsx` and this file during the work. Its change made the Modules help disclosure icon-only, so the `modules-help` capture now clicks the accessible name instead of button text. Whoever imports this must re-read that file rather than trust the file list alone.
- This entry first reported that `scripts/capture/verify-settings.mjs` crashed and that `tenant-settings-search-help.png` stayed stale. Both were fixed later the same day. See the Tenant settings help disclosure entry above.

### Changed, the Solutions toolbar lined up eight controls and crushed the search field

- The row held a search field, four selects, a Show archived checkbox, a help disclosure with a six-word label, and the primary button. At a 1280 viewport the content column is about 960px, and the four selects alone claim about 625px of it.
- The search field was the only item in the row that could flex. Every select kept its full intrinsic width, so the field absorbed the whole shortfall and measured about 110px, narrow enough to cut its own placeholder to "Searc". It measures 380px now.
- Type, Status, Category, and Show archived moved behind one Filters button that carries the number of filters now narrowing the list. Sort stayed in the toolbar, because it orders the list and never removes a row.
- The panel holds no hidden state. Every active filter renders as a removable chip under the toolbar, Clear all sits beside the chips, and the no-match row carries Clear filters. This is the pattern the Audit log already uses.
- The help disclosure drops to its icon and moves next to the field it explains. Its panel hangs from the left edge now, because the button is no longer last in the row.
- `SearchField` takes a 192px floor and a 384px cap, in place of `min-w-0` and 320px. It wraps to its own line instead of shrinking to nothing.
- On phones the toolbar was four stacked rows, and the help icon took a whole row alone. It is two rows now: search with its help, then sort with Filters. One more solution card fits above the fold.
- `HelpNote` and the new `FilterMenu` share one `useDismiss` hook, so Escape and press-outside cannot drift apart between the two panels.
- Files: `src/sections/solutions/components/AdminSolutions.tsx`, `src/sections/solutions/components/ui.tsx`, `product/sections/solutions/spec.md`.
- Type check, lint, and the design detector pass. Captured at 1280, 1024, and 390 px, in both themes and with the panel open, with no console errors.
- The same fault on the Audit log, People, Groups, Roles, and Modules is fixed in the entry above, which was written after this one.

### Changed, the admin rail put nine rows under one CORE caption

- CORE held nine of the eleven admin rows: People, Groups, Roles, Access, Branding, Audit log, Settings, Modules, and Categories. One caption over nine peers gives the reader no grouping, so the rail read as a flat list.
- Core now carries three captions. PEOPLE AND ACCESS holds People, Groups, Roles, and Access. TENANT holds Branding, Settings, and Audit log. CATALOG holds Modules and Categories. SOLUTIONS did not change.
- No indent and no guide rail was added. The earlier workspace fix indents an entry under the category it belongs to, and the admin rail has no child level, so an indent there would bind rows to a caption that owns nothing else.
- `src/shell/ShellPreview.tsx` carried a second copy of the admin nav that had drifted. It placed Access under the Solutions module at `/admin/solutions/access`, which contradicts the Navigation Structure line that keeps Access in core. Both copies now match.
- Files: `src/shell/components/ShellWrapper.tsx`, `src/shell/ShellPreview.tsx`, `product/shell/spec.md`. `MainNav` needed no change: it already opens a new caption on each change of `section`.
- Open, and not part of this pass: `GroupLabel` in `src/shell/components/MainNav.tsx` sets `text-[11px]`, which the type scale in `product/design-system/tokens.md` forbids. Moving it to `text-xs` changes both rails and needs its own capture pass.

### Noted, every form control stands 40px tall and none of them use the shared input

- Nothing changed in this entry. It records why the search fields, the selects, and the text inputs read as tall across the whole product.
- `src/components/ui/input.tsx` sets `h-9`, which is 36px, and no section imports it. Each of the eight sections declares its own `inputClass`, `SearchField`, and `Select` at `h-10`, which is 40px. The sign-in section goes to `h-11`, which is 44px.
- The text inside is `text-sm`, so the line box is 20px and the field carries 10px of padding above and below it.
- Two details add to the height a person perceives. The border is `border-gray-500`, a dark 1px outline rather than the `border-gray-200` hairline the cards use. The focus style adds `ring-2 ring-offset-2`, so a focused field claims 48px of vertical space.
- Copies of the 40px value: `src/sections/access/components/helpers.ts`, `src/sections/account-and-inbox/components/helpers.ts`, `src/sections/audit-and-tenant-settings/components/helpers.ts`, `src/sections/branding/components/helpers.ts`, `src/sections/people-groups-and-roles/components/helpers.ts`, `src/sections/solutions/components/helpers.ts`, and the `SearchField` and `Select` definitions in the matching `ui.tsx` files.
- 40px is the current touch-target floor on phones. Dropping the controls to 36px is a change across eleven declarations and must be checked against the phone captures first.

### Changed, the Access column on Modules stacked three blocks in every row

- Each Access cell stacked a count line, a wrapping cloud of one pill per group and per person, and a "Manage in Access" link. Five rows repeated that, so the column read as five clusters instead of five values, and the pill cloud set the row height. Measured on the rendered page at 1280px: the table body ran 660px for five modules.
- The cell is one line now. It names up to two holders, groups first with their member counts, then people, then a `+n` count for the rest. The whole line is the link to that module's Access screen, so the arrow replaces the repeated link text. The body measures 380px for the same five modules.
- The per-row "Manage in Access" link is gone. Five blue links down one column were a cluster of their own. The line carries its destination through the arrow, and a screen reader hears "manage in Access" from hidden text after the names.
- "via Solutions user" is gone from every row. `userRoleName` is always `<Display name> user`, so each row repeated a fact its first column already states. The table footer states the rule once instead.
- The names past the first two, and each group's member count, stay in the link's hover title. The Access screen holds the full list and every change, which is where `DEC-39` puts them.
- A name too long for the column truncates and does not wrap, so one row with a long group name cannot grow taller than its neighbors.
- The Enabled column went from 92px to 84px and Category from 220px to 200px, which gives the Access column room for two names at 1280px. The Module column keeps its 34%.
- The phone card uses the same one line, and the link keeps a 44px touch target there.
- Files: `src/sections/audit-and-tenant-settings/components/ModulesPage.tsx`.
- The `modules*.png` captures in `product/sections/audit-and-tenant-settings/` still show the pill cloud. Recapturing them was left for a separate pass.
- Type check passes, the design detector reports nothing, and there is no sideways scroll at 1280px or 390px.

### Changed, the Profile card put Groups in a grid cell that spanned two columns

- Name and Email sat in a two-column `dl`, and Groups followed them as a `sm:col-span-2` cell. The Groups label therefore started on the left column, directly under the Name label, and read as a third field that had slipped out of the grid. The pill row under it is taller than a line of text, so it also broke the row rhythm that the two text rows set.
- The card now leads with the identity line: the avatar, the name in bold, and the email in muted text beneath it. Groups follow in their own row under a hairline, in the same band style the card footer already uses. Nothing has to align across columns any more, because there are no columns.
- The visible "Name" and "Email" labels are gone. An avatar with a bold name over a muted email states what each value is, and those two labels were the reason Groups had to span the grid.
- The avatar drops from 64px to 48px to match the two-line identity block beside it.
- The break-glass variant keeps its Identity field, which now takes the same row slot that Groups takes for a directory account.
- An empty group list now says "No directory groups." instead of rendering an empty strip.
- The spec still holds. `product/sections/account-and-inbox/spec.md` asks the Profile block for an avatar tile with initials, the name, the email, and the groups as chips with their source. All of those remain.
- Files: `src/sections/account-and-inbox/components/AccountPage.tsx`.
- Type check passes. This entry records no rendered measurement, because the change was not captured on the running page.

### Fixed, the reset link sat closer to the next field than to its own

- "Use tenant default" sat at the far right of the label row, pushed there by `justify-between` across a half-width grid cell. Measured on the rendered page: the Time zone link ended 20px from the *Theme* label and 157px from its own "Time zone" label. Proximity groups by distance, so the link read as part of the field beside it.
- The Theme link had the second half of the fault. It ended at x=1039 while the segmented control it resets ended at x=898, so it floated 141px past its own control in empty space. The two links also landed at two unrelated x positions, which left a ragged second axis down the card.
- The action now sits on the line that states the value it restores, directly after "Tenant default: Asia/Singapore", 8px from that text and 60px from the next field. Both fields share one left axis, and the label row no longer reflows when a person overrides a default.
- The link is a 16px-tall mark, which is not a usable touch target. It carries an `::after` hit area of 44px that changes nothing visually. Confirmed by a real press 12px above the text, which fired the reset.
- The copy is unchanged. "Tenant default: Asia/Singapore" now sits beside "Use tenant default", which repeats the phrase. Fixing that is a copy change and was left for a separate pass.
- Files: `src/sections/account-and-inbox/components/AccountPage.tsx`.
- Type check passes, the layout scan is clean, and there is no sideways scroll at 1280px or 390px.

### Fixed, the product's headings and mono text rendered in the tool's fonts

- Every heading in the product rendered in DM Sans while the body text beside it rendered in Plus Jakarta Sans. Every mono chip and every identifier rendered in IBM Plex Mono, not JetBrains Mono. Both faces belong to Design OS, the tool that runs this repository, and neither belongs to the product.
- Cause: `src/index.css` sets `font-family` directly on `h1`-`h6` and on `code`, `pre`, and `kbd` in its base layer. The shell root sets its font on itself and the product inherits it. A direct rule beats an inherited one, so the tool's faces won on every heading. The `font-mono` utility had the same fault, because it resolves to `--font-mono`, which the tool defines as IBM Plex Mono.
- The shell root now carries a `genie-shell` class, and two rules at the end of `src/index.css` bind the product's faces inside it. The rules sit outside `@layer` on purpose, because unlayered CSS beats layered CSS whatever the specificity, so they also win over the Tailwind `font-mono` utility.
- The fonts were already loaded. `ShellWrapper` and `ShellPreview` request Plus Jakarta Sans and JetBrains Mono from Google Fonts, and JetBrains Mono arrived on every screen without a single rule using it.
- This affects every screen that renders through the shell, not the Account page alone.
- Files: `src/index.css`, `src/shell/components/AppShell.tsx`.
- Measured after the change: headings and body text both report `Plus Jakarta Sans`, and mono text reports `JetBrains Mono`.

### Fixed, a session row announced as a button and hid its own cells

- A session row carried `role="button"`, `tabindex="0"`, an `aria-label`, and a click handler that signed the device out. The role replaced the row role, so a screen reader lost the relationship between each cell and its column. The `aria-label` then became the only text announced, so the IP address, the sign-in time, and the last-active time were never read at all.
- A press anywhere on the row also signed a device out, and the row carried no affordance that said so.
- The row is a row again. The Sign out button in the last cell is the one way to sign a device out, and it carries the name that the row used to hold, "Sign out iPhone, Safari 18".
- The header cells take `scope="col"`, which no table in this repository carried.
- Files: `src/sections/account-and-inbox/components/AccountPage.tsx`.

### Fixed, the confirm dialog promised modal behavior it did not have

- The dialog set `aria-modal="true"` and handled the Escape key. It had no focus trap, no scroll lock behind the panel, and no focus restore on close. The token file states that focus is trapped. Nothing in this repository trapped it.
- The dialog is now built on the Radix dialog primitive, which is already a dependency of this repository and already used by two files under `src/components/ui`. The primitive carries the trap, the scroll lock, the outside press, and the Escape key.
- There is no `Dialog.Trigger`, because the dialog opens from a row button through an `open` prop. Radix returns focus to its trigger, finds none, and drops focus to the document body. So the component records the element that held focus when the dialog opened and returns focus there.
- Cancel is first in the document order, so the primitive focuses it by default. The token file asks for exactly that.
- The confirm dialogs in the other five sections still carry the original fault. They were left alone on purpose: the six copies have diverged, and the Branding copy takes children, a cancel label, and a loading state that the others do not. Merging them into one component is a separate change across five sections that this pass did not audit.
- Files: `src/sections/account-and-inbox/components/ui.tsx`, `scripts/capture/rest-account.json`.
- The capture manifest selected the confirm button through `[role='presentation']`, which the old markup carried and the primitive does not. It now selects through `[role='alertdialog']`.
- Measured after the change: the role is `alertdialog`, Cancel holds focus on open, five Tab presses all stay inside the panel, the page behind does not scroll, Escape closes, and focus returns to the exact Sign out button that opened it.

### Fixed, session timestamps ignored the time zone the same page sets

- Every timestamp on the page was formatted with a fixed `Asia/Singapore`. The Preferences card lower down the same page offers a time zone control. A person who chose `Europe/London` still read every session time in Singapore time, on the screen where they made the change.
- Timestamps now follow `preference.timeZone`, falling back to the tenant default.
- The format locale stays `en-GB`, the convention this product uses in 21 places. A first pass drove it from `preference.locale` and that was wrong: the field holds a user interface language code, and the tenant default is the bare tag `en`, which formats dates in United States conventions. Every date on the page turned into "Sep 16, 04:12 PM" for a tenant whose nine offered time zones are all Asia-Pacific. Mapping a language choice to a format region is a product decision, and there is no language choice to make yet, because the Language field renders only when more than one locale is available.
- Six other files still pin `Asia/Singapore` the same way. They are outside this pass.
- Files: `src/sections/account-and-inbox/components/AccountPage.tsx`.
- Measured after the change: switching the control to `Europe/London` moves the first session from "16 Sept, 16:12" to "16 Sept, 09:12", and the day-first 24-hour format holds.

### Changed, the Roles and access card leads with the scope

- Each row led with the role and the module, which printed "Solutions user in Solutions" four times down the card. The scope is the fact that differs between rows, and it sat in the smallest type on the row.
- The scope now leads, and the role, the module, and the grant path follow it in the secondary line. The card asks "what you can open, and how you got it", and the scope answers the first half.
- The check mark in a gray tile is gone. A listed grant is always granted, so the mark carried no state and repeated identically down the list.
- Files: `src/sections/account-and-inbox/components/AccountPage.tsx`.

### Fixed, the Theme control stretched to 349 px for 200 px of content

- The segmented control is an `inline-flex` track inside a flex column, and a flex column stretches its children. The track ran the full width of its grid cell and left 149 px of empty gray beside "System", which read as a broken control in both themes. It takes `self-start` now and measures 208 px, which is its content and its 4 px of padding.
- Files: `src/sections/account-and-inbox/components/AccountPage.tsx`.

### Fixed, three smaller faults on the Account page

- The password rule list carried `aria-live="polite"` on the list itself, and the whole list re-renders on each keystroke, so a screen reader read all four rules again after every character typed. One counting line carries the live region now, "3 of 3 password rules met". This affects the break-glass variant only.
- The password form filled a grid cell with an empty `div` to push the new password onto its own row. It is two grids now, and the current password owns the first one.
- Every toast showed the green success dot, including the neutral ones, because the tone was declared in the type and never passed. Saving a preference is a success, returning one to the tenant default is neutral, and signing a device out is neutral.
- Signing out raised no toast at all. The row simply disappeared. A destructive action now says what happened, which also makes the `account-page-toast` capture show a toast.
- Files: `src/sections/account-and-inbox/components/AccountPage.tsx`, `src/sections/account-and-inbox/components/helpers.ts`.

### Not changed, the reported palette collision was not real

- An audit of this page reported that the product paints cards from a different color system than the page behind them, and that a dark card sits below its own canvas. That reading compared `document.body`, which belongs to the Design OS tool and carries the warm stone palette, against a product card.
- The product shell sets its own canvas and covers the viewport, so the tool's stone background is never visible on a screen preview. Measured: the dark canvas is gray-950 at lightness 0.13 and the card is gray-900 at lightness 0.21. The card sits above the canvas, which is what the token file asks for. The light theme pairs a white card with a white canvas and a hairline border, which the token file also asks for.
- The palette needs no change. The type system did, and that is the first entry above.

### Verified

- Type check passes. The design detector reports three findings, all of them the same warning that Plus Jakarta Sans is a common font. The token file pins that face as the tenant default, so the brief stands.
- Every Account capture retaken from the repository manifest, in both themes and on the phone, plus the break-glass variant, the local-accounts variant, and the confirm and toast states. No console errors and no sideways scroll.

### Fixed, a category and its entries read as the same level in the sidebar

- An entry under a category was never indented. A category label started 38px from the left edge of the rail: 12px of row padding, a 16px chevron, and a 10px gap. Its entries carried `ml-6` and their own 12px of row padding, which put them at 36px, two pixels to the *left* of the parent they belong to. The two levels also shared one size, one weight, and one color, so "Claims Triage Assistant" read as a peer of "Healthcare" and not as a child of it.
- The open entries now sit in a wrapper with a left guide rail, `ml-5 border-l pl-3`. The rail starts at 20px, under the center of the chevron, and the entry labels start at 45px. The line is the affordance: it runs from the category down past its last entry, so the group is visible without counting pixels.
- The one shared row style splits into three. A category is 13px semibold gray-900, gray-100 in dark. An entry inside a category is 14px medium gray-600, gray-400 in dark. A top-level row, a pinned row, and an entry under Other keep 14px medium gray-700 and did not move.
- A category is deliberately the smaller text. It is a heading you expand, not a destination you open, so the thing you click keeps the readable size. The nesting is carried by the indent, the rail, the weight, and the tone instead, which is the reading the earlier pass intended and the indent alone failed to deliver.
- An entry stays `font-medium` idle and `font-semibold` selected, so selecting one still moves no text.
- The mock rail inside the Branding preview carried the same flattening: a `font-medium` category label at 32px and `pl-8` entries at 32px, both in the text color. It now mirrors the real rail, with the category one step smaller and semibold, the entries in the muted tone on a rail in the line color. Its entries also drop a fixed `text-sm`, which had ignored the tenant font size the preview exists to show.
- Files: `src/shell/components/MainNav.tsx`, `src/sections/branding/components/previews.tsx`. Every sidebar in the product renders through `MainNav`, so the workspace rail, the administration rail, and the mobile drawer are fixed together.
- Checked: the settings navigator and the Categories admin page were read for the same fault and have none. The settings navigator pairs an 11px caption with 14px rows and has no nesting, and the Categories page lists categories flat.
- Type check and the design detector pass. Light, dark, and the mobile drawer confirmed by capture.

### Changed, the chat viewer follows the v1 pattern

- An assistant reply is no longer a bubble. It is plain page text in a 70-character column behind a small square mark in the theme color. The reader's own message stays a bubble on the right in the theme color. Chosen from four treatments built as a throwaway prototype, which is now deleted.
- Reason: a themed bubble around every reply turned a long answer into a wall of tenant color, and the color stopped meaning anything. One accent on the mark and one on your own turn keeps the color readable as identity.
- The viewer header loses its colored top band and the description line. It is one hairline row: back, mark, name, the type as a quiet label, then favorite, Focus, and New chat as unbordered controls. A status that is not Ready takes the slot the type label holds.
- A day label sits above the first message of each day, so a resumed conversation says when it happened.
- `ChatTheme.assistantBubbleColor` and `ChatTheme.assistantBubbleForeground` are gone, from the type, the sample data, and the Chat themes editor. A theme now sets the assistant mark, the reader's own bubble, the corner radius, the font, and the placeholder. An assistant reply takes no theme color, so it has no contrast pair and can never fail the check.
- The Chat themes control formerly labeled Header is now Assistant mark, because `headerColor` paints the mark and no longer paints a band. The live preview renders the same pattern as the viewer.
- Captures: every solution-viewer and chat-theme state retaken.

### Fixed, a vertical scrollbar in four tab strips

- A tab strip carried `overflow-x-auto` alone, so the browser computed `overflow-y` as `auto`. The `-mb-px` on the tab buttons pushed the content one pixel past the strip and a vertical scrollbar appeared beside the tabs. Branding and Solutions now carry `overflow-y-hidden`, which Access and People, groups and roles already had.

### Changed, the Typography tab drops a box

- The card that wrapped the text color, the specimen pair, and the contrast report is gone. The panel now holds two groups separated by space alone: the font with its specimen line, then the text color with its evidence. This is the shape the Colors tab already used.
- The one border that stays is the specimen pair, because those two cells have to read as a white surface and the gray-50 subtle surface. That border carries information.
- The contrast report rendered a two-column grid even when only one theme had rows, which left the right half of the Typography section empty. One group now renders one column.

### Added, the capture manifests

- `scripts/capture/rest-*.json` covers the 206 screenshots that had no recipe on disk. Every one of the 331 captures in `product/` can now be regenerated with `node scripts/shots.mjs <manifest> <baseUrl>`, so a design change no longer leaves stale images behind.

## 2026-09-18

### Changed, the sidebar rail follows the section navigator's type roles

- The rail is a navigator panel and now reads by the same four roles. No size changed and no color role was added.
- The group caption moves from gray-500 to gray-600, gray-400 in dark. gray-500 measured 4.63:1 on the gray-50 panel at 12px semibold; it is now 7.23:1. Dark was already gray-400 and stays at 6.82:1.
- Every row is `font-medium` and the selected one stays `font-semibold`. A nav row was regular, so a category disclosure at medium outread the destinations it sat beside. A category is now a row like any other, and its chevron, its count, and the indent of its children carry the nesting.
- Measured: the two weights render within one pixel of each other, 48px at both on "Groups" and 62 against 63 on "Favorites", and the label sits in a fixed 168px box, so selecting a row moves no text.
- Every truncating label carries its full text in `title`: nav rows, pinned rows, category names, tree entries, the tenant name, the workspace product name, and the person's name and role at the foot. A 240px rail cuts a nav label at 26 characters, and a truncated navigation label was otherwise unrecoverable.
- The tenant name drops `font-bold` and `tracking-tight` for `font-semibold` at the same size. The type scale carries no bold at 14px, and negative tracking at 14px tightens a face that does not need it. It now matches the person's name at the foot of the rail.
- The unread badge and the category count are `tabular-nums`, so a count pill keeps its width as the number changes.
- Recorded in `product/design-system/tokens.md`, Section navigator, and in `product/shell/spec.md`, Design Notes. Type check and lint pass unchanged. Thirteen shell captures refreshed. The captures of the seven sections still carry the earlier rail and are not retaken in this pass.

### Changed, the settings navigator reads in four roles, not two sizes

- The group caption, the state pills and the closing note were all `text-xs`, so one size carried three different jobs. Case, weight and tone now carry the difference, and no size changed.
- The group caption moves from gray-500 to gray-600, gray-400 in dark. gray-500 measured 3.84:1 on the dark panel and failed WCAG 1.4.3 for 12px text; it is now 7.15:1. In light it moves from 4.63:1 to 7.24:1. It also left the caption quieter than the closing note it outranks, which inverted the hierarchy.
- The caption is tracked one step wider (`tracking-wider`, 0.6px at 12px). Capitals lose the word shape lowercase gives, so 0.3px was under-tracked for an all-caps label.
- A section name is `font-medium` and the selected one stays `font-semibold`, so a 12px semibold state pill no longer outreads the 14px name it modifies. Measurement confirmed the face is metric-stable across the weight axis: "Sessions" renders at 59.000px at both 400 and 600, so the label does not move when the selection changes.
- A truncating section name now carries its full text in `title`. A 232px panel cuts a long module name at 19 characters, and a truncated navigation label was otherwise unrecoverable.
- The closing note sits under a hairline rule, the one rule the panel carries, so it reads as an aside and not as a fifth row. Its measure is about 33 characters against a 45-character floor, and 232px cannot reach that floor at `text-xs`; the honest fix is to keep the note short, which is recorded in the contract.
- Recorded in `product/design-system/tokens.md`, Section navigator, and in the section spec. Type check, lint, the type-scoped detector and all 43 settings interaction checks pass unchanged. Twenty-one captures refreshed.

### Changed, the radius ladder is quieter

- The four-step ladder drops one step: menus 6px (`rounded-md`), controls, navigation rows and callouts 8px (`rounded-lg`), cards, dialogs, sheets and the sidebar panel 12px (`rounded-xl`), pills full. It follows the updated `DESIGN.md`, Shapes, of the platform repository.
- The tenant letter tile is 6px small and 8px medium, and the solution letter tile follows the same three steps.
- A badge, a chip, a switch track and an avatar keep their full radius, and a sheet still rounds only the corners it exposes.
- Applied through the shared button, input, select, card, dialog, sheet and menu definitions first, then by purpose at every local override. It is not a blanket replacement: a ghost button already stood at 8px and did not move, and nine menu panels moved from 8px to 6px while every other 8px control stayed.
- 241 lines across 59 files. Spacing, type, colors, control heights, touch targets, focus rings and behavior are untouched: the type check, the lint, and all 122 interaction checks pass unchanged.

### Changed, Tenant settings is a section navigator

- Tenant settings replaces its page of stacked cards with a settings navigator: a Tenant group (Sign-in & accounts, Sessions) and a Modules group (one section per installed module that declares settings), with one section's form beside it. The card list had no upper bound; four modules already filled the page.
- Search all settings sits above both, over the name, the description, and the keywords of every setting, never over a saved value and never over a secret. It tolerates one edit or one swap from four letters, so "timout" finds Idle timeout and "remidners" finds Renewal reminders.
- A result reads as the setting name over its section breadcrumb. Choosing one opens the section, puts the focus in the field, and rings it for two and a half seconds.
- An installed module that is switched off keeps its section, marked Disabled, with its fields editable so a tenant can be prepared before enabling. One amber note says that saving changes settings only and never switches the module on, and links to Modules.
- A refused save keeps the typed values, names the reason in the section, and offers Retry. No toast appears, so a failure can never read as a save.
- Unsaved changes are protected on every path out: another section, a search result, and the phone Back control. The navigator marks an unsaved section with a dot.
- `ConfigField.keywords` and `ModuleConfig.enabled` are new, and `SettingsSectionSummary` and `SettingsSearchHit` describe the navigator and the search.
- Sample data gained Approvals, the installed module that is switched off, and two scale fixtures, Inventory and Service desk, marked `synthetic` and drawn with a Sample pill. Solutions still declares no tenant configuration, so it has no section.
- Recorded in `product/design-system/tokens.md` as the Section navigator pattern, and in `product/amendments-settings-2026-09-18.md` as six amendments and four open questions.
- Captures: twenty-one states, desktop, dark and phone, including search, the typo match, no results, the disabled module, validation, the refused save, and the unsaved-navigation confirm.

### Fixed, one pass over the shared controls

- The search field collapsed to 22px on a phone. It carries `flex-1`, and a toolbar that stacks into a column turns that into a height rule, so `h-10` lost. Every search field now carries `h-10 min-h-10` and measures 40px in both layouts. It affected People, Groups, Roles, the audit log, Categories, Solutions, the solutions hub, the Access overview, and both transfer lists.
- The solution configure sheet drew its field labels in a `span`, so no control in it had an accessible name. Every control now carries an `aria-label`, and the four validated fields tie their error to the control with `aria-describedby`, as the design system already required.
- The amber warning block was hand-written in six places across four sections, with three different text colors. It is now one `WarningNote` per section, amber-800 on amber-50, matching the semantic colors of the design system.
- Two new popovers used a 12px radius where the radius ladder gives menus 8px. The help disclosure and the recipient picker now use `rounded-lg`.
- Recorded in `product/design-system/tokens.md`: the height rule for a control that grows, the accessible-name rule, and the warning note.

### Added, category assignment

- Assign items, a searchable table under the category list on the Categories page, learned from the v1 "Assign solutions" table. One row per module with a workspace entry, one row per record an enabled module contributes, each with a category dropdown that holds No category first. No wizard and no bulk step.
- Filters: a search field, a type select (All types, Modules only, Solutions only), and an Uncategorized only checkbox. None is required.
- The module row says that it moves the module entry alone, so the Solutions hub and the nine solutions are never confused.
- Row states: saving, saved, and refused. A refused write keeps the value the server still holds, names the reason, and offers Retry. No refused write reads as a save.
- A row the viewer may not write is read-only and names the key it needs. `core:settings:manage` files a module, `solutions:admin` files a solution, and holding the first never grants the second.
- A switched-off module keeps its own row and contributes no record rows, with one line that says the stored category is kept.
- One line under the title: a category groups what people already see, and access is set in Access.
- `CompiledModule.staticEntries`: a module with no workspace entry shows no category picker on Modules and no row in Assign items (`R-84`).
- The preview wiring shares one record between the Categories page, the Modules page, and the solution configure sheet, so a change on one shows on the others after a reload.
- `product/amendments-categories-2026-09-18.md`: the module contribution, query, and write interface this screen needs, plus four unresolved questions, including the editing policy for a switched-off module's records.
- Captures: `categories`, `categories-dark`, `categories-mobile`, `categories-assign-saved`, `categories-assign-failed`, `categories-assign-denied`, `categories-assign-module-off`, `categories-assign-filtered`, `categories-assign-mobile`, and the Modules captures retaken.

### Fixed, category assignment

- The Category select in the solution configure sheet and the search field of the audit section had no accessible name. Both now carry one. The other fields of that sheet still take their name from a `span`, which is recorded in the handover as a separate accessibility pass.
- The Modules page is fully controlled. It kept its own copy of the module list, so a change made there was invisible to every other screen.

### Added

- Access, a new core admin section with two screens behind `core:roles:manage`. Grants is the one place that writes a role assignment. Overview is the read-only reader of who reaches what. Files: `product/sections/access/` and `src/sections/access/`.
- The Grants path is recipient, then module, then access level, then the records. The level picks the module's own predefined role, so an administrator never has to find the role first. A custom role stays available as a secondary dialog.
- "All solutions, including later ones" is a separate control from the record list, so no bulk action on records can widen a grant to the whole tenant by accident.
- A level whose role the module does not declare is disabled with the gap named. The screen never invents a role. Contracts shows this state in the sample data.
- Pending changes, Save, and Cancel. Nothing is written before Save, and leaving the path with unsaved changes asks first.
- The two-pane transfer list from the v1 admin portal, with search, counts, select-all, add or remove the ticked rows, and add or remove everything shown.
- Eighteen captures of the new screens, desktop, phone, light, and dark, in `product/sections/access/`.

### Changed

- Access moved from the Solutions admin group to the Core group of the admin portal, so it stays reachable when the solutions module is switched off.
- Roles is definitions only. Role detail, the person inspector, and the group inspector list assignments read-only and link to Access with the subject preselected.
- The solutions Access overview screen is gone. Its questions are answered by the core Overview tab for every module. The solution configure slide-over keeps a read-only Access tab that links to Access.
- The Modules page Access column links to `/admin/access?module=<id>&level=use` instead of the Roles screen.
- The design system entry for the transfer list now describes two forms, the two-pane form for a wide container and the roster form for a narrow one.
- The group inspector is restructured. The header carries identity only. One access card under it names the grant count and opens Access, on both tabs. Every group action moved into one bar at the foot of the sheet: Edit name and description and Delete group for a local group, Archive group for a directory group, with one line that says why a directory group is read-only. Reason: the single Archive button floated between the title and the tabs, the edit control was hard to find, and nothing on the Members tab said where access is decided.

### Added, fourth pass

- One contextual-help pattern, `HelpNote`, recorded in `product/design-system/tokens.md` under "Help disclosure". A labelled button opens one small callout, collapsed by default, on click, on tap, and on Enter or Space, never on hover alone. Escape, a click outside, and a Close link close it.
- The help disclosure appears once per screen: How access works on Grants and on Overview, How group access works in the group inspector, How this adds up on the person inspector Roles tab, and How roles work on the Roles directory.
- Grants names the access a recipient already holds another way. A catalogue row that a person reaches through a group reads "Also through <group>", so a row on the Catalog side never means that the person has no access.
- Removal consequences are stated where the press happens. The pending bar names the first path that stays, and Save opens a confirmation that lists every path that stays. No message says that access was revoked.
- Removing members from a local group confirms first, and the confirmation says that direct roles and other group memberships still give access.
- The Overview names the scope of every row, "One record" or "Whole tenant", and the phone card list now carries the "also through" line that the desktop table already carried.
- Sample data gained one direct-only person, Marcus Lee, who holds one solution grant and belongs to no group. The tenant now covers group-only, direct-only, and overlapping access.
- Broader access is collapsed by default, because it is rarely the everyday grant. The header carries the count of what is on and a What is this? disclosure that explains a grant with no scope. The card opens itself when the recipient already holds one of these grants.
- Captures: `grants-broader-help`, `grants-help`, `grants-help-dark`, `grants-help-mobile`, `grants-remove-consequence`, `grants-remove-confirm`, `overview-help`, `groups-inspector-help`, `groups-inspector-remove-member`, and `roles-directory-help`.

### Changed, third pass

- The Grants toolbar reads as one labelled control row: Grant to, a Groups and People segmented control, then the recipient dropdown, all at 40 px. The dropdown holds one line, for example "Claims Review · 17 members". The floating sentence "Grant to a person instead" is gone, because the segment is the offer.

- The catalogue grants modules beside solutions. A module row assigns that module's own user role with no scope, which is use and never administration. A solution row assigns the solutions user role scoped to that solution. Neither needs a role to be picked first.
- The missing module rows were sample data, not design: only one module qualified and it was both switched off and already granted. The sample tenant gained Service requests, an enabled module with no records, ungranted for most groups.
- A switched-off module now blocks every add: the row checkbox, select all, Add all shown, the broader-access row, and the same three steps inside Advanced access. Its kept grants stay, read "Inactive, the <module> module is off", and stay removable.
- The Overview counts what is not in effect, as in "4 assignments for Clinical Operations, 4 not in effect", and marks each row.
- The catalogue heading is "Access assignments", because Granted means an assignment exists, not that the resource works today.

### Changed, second pass

- The Grants tab follows the v1 flow: pick a group, move rows between Catalog and Granted, save. The module step, the access level step, and the prominent role dialog are gone from the everyday path.
- Every catalogue row means "can use": one row per solution, one row per other enabled module whose use grant needs no record, each with a Solution or Module pill. A Show filter narrows the list and is never required.
- Broader access is a separate card, one checkbox per module that owns records, so a bulk action on rows can never grant future records by accident.
- Advanced access holds the administration levels, core administration, the audit role, one record at a time, and custom roles, with the same guards and the same writer.
- A line under the catalogue names every grant the catalogue cannot show and links into Advanced access, so nothing is hidden.

### Fixed

- The Categories page counted solutions, which core cannot count. It counts modules only, as `DEC-51` states.
- Three screens read a `isDefault` flag that the chat theme type no longer carries. They read the seed id instead (M7).

- Transfer list: a shared two-pane picker for bulk membership editing, in `src/sections/people-groups-and-roles/components/TransferList.tsx`. Each side has a count, a select-all box, a search field, and one footer button that moves every ticked row at once. The pattern comes from the v1 admin portal, file `src/components/ui/transfer-list.tsx` in `genie-ops-center`.
- The group inspector Members tab uses the transfer list for local groups. Reason: the old picker listed every person with no search and added one person per press. That does not hold at a few hundred people. A directory group keeps its read-only member list, because the identity provider owns that membership.
- The design system gained a Transfer list section with the rule for when to use it. Use it when both sides can pass about twenty rows and both directions are editable in bulk. A short list keeps the plain picker. A list of permission keys grouped by module keeps the checkbox tree.
- Click-through prototype. `src/shell/components/routes.ts` maps an application path to the screen design that draws it, so navigation, buttons, and links in a preview now open the matching screen.

### Fixed

- Role detail opened the default role whatever row you clicked. Design OS builds its preview iframe without the query string, so `?role=<id>` was dropped. `goTo` now sends the top window to the `/fullscreen` route, which keeps the query.
- The Modules page Category picker overlapped the Access column. The picker carried a fixed width of 208 px inside a 200 px column. The picker now fills its cell and the column is 220 px.
- The Modules table forced the page wider than the content area. The table now scrolls inside its card, and `html` clips sideways overflow as a guard.
- Five pages centred a capped column under a left-aligned page title: Modules, Categories, Tenant settings, Account, and Inbox. The `mx-auto` class is removed from each container.
- Accessibility and token pass, nine fixes. Among them: the shared focus ring, brand text at blue-400 in dark, the four button states, input borders at gray-500, and keyboard support on clickable rows. Report: `product/a11y-token-pass-2026-09-18.md`.

## 2026-09-17

### Added

- Modules page and Categories page in the admin portal (`DEC-50`, `DEC-51`). One navigation tree now mixes solution entries and module entries under core categories. Report: `product/update-dec-49-50-51-2026-09-17.md`.
- Type-specific registration fields for solutions. A chat solution and an embedded solution carry different settings.
- Typography in Branding: an approved font list, three font size presets, and a text color for light surfaces. Each choice carries a contrast check, and Publish is blocked while a check fails.

### Changed

- The landing route is the solutions hub. There is no core Dashboard page and no landing slot (`DEC-49`).
- "Admin portal" replaces the older term everywhere in the design and the specs.
- Branding keeps one tenant color. A tinted surface that stands for identity stays neutral gray, so no tint ramp is derived (`DEC-47`). Research: `product/research/theming-2026-09-17.md`.
- SVG sanitizing left the design. Core already sanitizes an uploaded SVG (`DEC-20`).

### Fixed

- Every item in the findings list that needed no decision from the owner. Report: `product/fix-report-2026-09-17.md`.

### Open

- N6: what lands in the platform `docs/design/` folder, and who checks the design files when a `DEC-` entry changes.
- Two platform-side follow-ups, recorded in `product/update-dec-49-50-51-2026-09-17.md`: the navigation-tree slot text and the record-type resolver path.
- The screen captures of about fifteen desktop screens are older than the layout fixes above. Retake them after the review round ends.
