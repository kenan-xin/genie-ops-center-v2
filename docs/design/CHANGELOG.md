# Genie Ops Center design change log

One entry per design change in this repository, newest first. Each entry names what changed and why. A platform decision is cited by its `DEC-` number. The root `CHANGELOG.md` belongs to Design OS, the tool that runs this repository, and is a different file.

## 2026-09-19

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
