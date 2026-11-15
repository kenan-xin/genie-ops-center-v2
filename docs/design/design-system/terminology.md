---
type: reference
title: Terminology, the words on screen
created: 2026-11-15
tags:
  - design-system
  - terminology
  - glossary
  - copy
---

# Terminology

This file gives one word to each meaning on screen. A label, a message, an empty state and a confirm dialog use the word of its entry and never a banned word. A scan in `tools/workspace-validation` reads the two tables at the end of this file. In a path where an entry applies, a banned word fails the scan. The scan runs under `pnpm nx run @genie/workspace-validation:validate`.

How to read an entry:

- Concept: the meaning.
- Say: the words to use.
- Never: the banned phrases. "none" means the entry names words to use and bans nothing.
- Applies in: `all`, or the path prefixes where the ban holds. "UI" means `packages/core/src/features/`, `packages/ui/src/`, `packages/modules/` and `apps/genie/src/`.
- Source: the decision behind the entry. ADM-, MOD-, SHELL-, W- and P16f- ids are rows of `../audits/2026-11-15-design-fidelity.md`. Q<n> ids are owner questions of follow-up 13, and A-<n> ids are owner answers. Both are recorded on bead `genie-ops-center-v2-6wz1.110`. P05-<n> ids and Phase 00 "Lines that govern" are run decisions of follow-up 13, also noted on that bead. "owner 2026-11-14 15:19" is the owner's comment on that bead.

A banned phrase matches without regard to case, on whole words. A phrase between slashes is a JavaScript regular expression with its flags.

## Entries

### G1. The assistant

- Concept: the assistant.
- Say: "Ask" on every screen and message: navigation, page title, header button, panel title (also on a surface page, where the page line names the page), summary line, empty states, run-stop lines.
- Never: `agent`, `agents`, `the assistant`.
- Applies in: all.
- Source: Q2.
- Example: the panel title is "Ask", not "Agent".

### G2. One conversation

- Concept: one conversation with Ask.
- Say: "chat", "this chat", "New chat", "Chats", "Delete this chat?".
- Never: `the chat`.
- Applies in: all.
- Source: Q2.
- Example: the confirm dialog asks "Delete this chat?".

### G3. Ask cannot run

- Concept: Ask is not available in this deployment.
- Say: "AI is off."
- Never: `chat is off`.
- Applies in: all.
- Source: Q2, settings words.
- Example: with the setting off, the Ask page shows "AI is off."

### G4. The product

- Concept: the product name.
- Say: "Genie Ops Center".
- Never: `/\bGenie\b(?! Ops Center)/`, that is "Genie" on its own.
- Applies in: all.
- Source: `docs/design/README.md`, ADM-2.
- Example: "Welcome to Genie Ops Center", not "Welcome to Genie".

### G5. A user row

- Concept: one row of the `user` table.
- Say: "person", "people". Role names keep "user".
- Never: none.
- Applies in: none.
- Source: `docs/design/README.md`.
- Example: the People page lists 12 people.

### G6. A module's state

- Concept: whether a module is on in this deployment.
- Say: the state is "Module on" or "Module off", with one grey pill "Module off". The action is "Turn on" or "Turn off" ("Turn off <module>?"). The Modules column is "Status".
- Never: `entitled`, `not entitled`, `/\bswitch(?:es|ed|ing)?\b(?:\s+\S+){0,3}?\s+(?:on|off)\b/i` (a form of "switch" followed by "on" or "off").
- Applies in: all.
- Source: owner 2026-11-14 15:19, ADM-1.
- Example: the dialog title is "Turn off Invoices?", not "Switch Invoices off?".

### G7. On, off and suspended

- Concept: the on and off words for a module and for a person.
- Say: for a module, "Turn on" and "Module on". For a person, "Unsuspend" and "Suspended".
- Never: `enable`, `enabled`, `disable`, `disabled`, `re-enable`, `re-enabled`.
- Applies in: all.
- Source: ADM-1, Q3.
- Example: the person menu says "Unsuspend", not "Re-enable".

### G8. A person's lifecycle

- Concept: the states a person moves through.
- Say: "Suspend", "Suspended", "Unsuspend". "Deactivate", "Deactivated". "Pending" only for a person who has not signed in yet.
- Never: `remove person`.
- Applies in: all.
- Source: Q3, ADM-6, ADM-7.
- Example: the person menu says "Deactivate", not "Remove person".

### G9. An assignment that does not apply now

- Concept: a role or module assignment that exists but has no effect now.
- Say: "Paused: <reason>", for example "Paused: Module off" or "Paused: Account suspended".
- Never: `not in effect`, `inactive`.
- Applies in: all.
- Source: owner 2026-11-14 15:19.
- Example: a role row shows "Paused: Module off", not "Inactive".

### G10. Who has a role or module

- Concept: the people and groups a role or module is assigned to.
- Say: "Assigned roles (n)" as the heading of a person's Roles tab and of a group's roles. "Assigned to" as a column, count or section, and "Not assigned to anyone". "Assigned via" with "Direct" or the group name. "Assigned <date> by <name>". "Manage in Access".
- Never: `holder`, `holders`, `who holds`, `nobody holds`, `no one holds`, `holds no role`, `holds no other role`, `holds no advanced role`, `hold no roles`, `you hold`, `what you hold`, `who can open it`, `given directly`, `direct assignment`, `change who has it`.
- Applies in: all.
- Source: owner 2026-11-14 15:19, ADM-3, A-7.
- Example: an empty role shows "Not assigned to anyone", not "Nobody holds this role".

### G11. The access route of a role

- Concept: how a person got a role.
- Say: the words of G10.
- Never: `path`, `paths`.
- Applies in: UI.
- Source: ADM-3.
- Example: the column is "Assigned via", not "Path".

### G12. Scope

- Concept: which records an assignment covers.
- Say: "All records", or the record id.
- Never: `whole tenant`, `everywhere`.
- Applies in: all.
- Source: owner 2026-11-14 15:19. It governs over Q1 (Phase 00 "Lines that govern").
- Example: the scope cell shows "All records", not "Whole tenant".

### G13. Role kinds

- Concept: a role that ships with the product, and a role made here.
- Say: "Built-in role" and "Custom role". The pill says "Built-in" or "Custom". "Copy as new role". The module of a core role is "Core".
- Never: `system role`, `system roles`, `copy role`, `role from copy`, `core administration`.
- Applies in: all.
- Source: owner 2026-11-14 15:19, ADM-4, A-6.
- Example: the action is "Copy as new role", not "Copy role".

### G14. Groups

- Concept: a group made in the app, and a group that comes from the identity provider.
- Say: "Group" for one made here, and "Directory group". "Name", "Rename". "Last synced <time>", "Not synced yet", "Missing from directory". A row action names its object: "Remove <name> from group".
- Never: `local group`, `local groups`, `group made here`, `group from your directory`, `display label`, `edit label`, `stale`, `never synced`, `not seen yet`.
- Applies in: all.
- Source: owner 2026-11-14 15:19, ADM-8, ADM-22.
- Example: a new directory group shows "Not synced yet", not "Never synced".

### G15. An unsaved change

- Concept: a change on the page that is not saved yet.
- Say: the blue unsaved dot of `DESIGN.md` with the hidden text "(unsaved)", or "(unsaved removal)" on a removed row. The bar says "Unsaved changes", "Discard", "Save".
- Never: none. "Pending" stays for people (G8).
- Applies in: none.
- Source: ADM-6, Shopify save bar.
- Example: a screen reader hears "Name (unsaved)" on a changed field.

### G16. Save

- Concept: the button that stores a change.
- Say: every save button says "Save".
- Never: `save changes`, `save as paid`, `save as unpaid`, `save as unallocated`, `looks right`, `save role`, `create role`, `/^Save the payment$/`.
- Applies in: all.
- Source: Q12, W-3, MOD-4. Bead `czjw.193` (Phase 16) builds these labels.
- Example: the role editor button says "Save", not "Save role".

### G17. Saved views

- Concept: a saved set of filters, columns and layout on a list or dashboard.
- Say: "Original", "Unsaved changes", "Save view", "Reset", "Make default", and "Save as original" in edit mode only.
- Never: `save as default`, `default view`, `save as view`, `save as new view`, `dashboard filters`.
- Applies in: all.
- Source: Q8. Bead `czjw.192` (Phase 19) builds these words.
- Example: the view menu says "Make default", not "Save as default".

### G18. Clearing filters

- Concept: removing every active filter.
- Say: "Clear filters".
- Never: `clear all`.
- Applies in: all.
- Source: P16f-8, W-2.
- Example: a filtered empty list offers "Clear filters", not "Clear all".

### G19. A payment against an invoice

- Concept: a payment counted toward an invoice, inside the invoices module.
- Say: "Allocate", "Allocated", "Part allocated", "Unallocated", "allocation" ("1 allocation"). Tabs "All", "Allocated", "Unallocated". "Allocate to an invoice", "Remove allocation", "Allocated automatically".
- Never: `link`, `links`, `linked`, `linking`, `unlink`, `unlinked`.
- Applies in: `packages/modules/invoices/`.
- Source: Q4, MOD-1.
- Example: the payment action is "Allocate to an invoice", not "Link to invoice".

### G20. The same, outside the module

- Concept: a payment counted toward an invoice, named anywhere outside the invoices module.
- Say: the words of G19.
- Never: `not linked`, `linked payment`, `linked payments`, `payment links`.
- Applies in: all.
- Source: Q4.
- Example: a summary says "Unallocated", not "Not linked".

### G21. Done by a person

- Concept: an action a person did, not the app.
- Say: "by hand": "Allocated by hand", "Entered by hand", and the column value "By hand". "by <name>" comes once the app can name the person.
- Never: `by a person`.
- Applies in: all.
- Source: MOD-9, P05-7 (a deviation, bead `czjw.208`).
- Example: the allocation row says "Allocated by hand", not "Allocated by a person".

### G22. The Documents inbox

- Concept: the list of uploaded documents and their reading state.
- Say: tabs "All", "To review", "Processing", "Processed", with All first. Statuses "Processing", "To review", "Processed", "Failed", with the reason as secondary text. The column "Extracted details". The empty state "No documents to review." The document type "Payment".
- Never: `needs you`, `what we found`, `payment evidence`.
- Applies in: all.
- Source: Q5, MOD-2, MOD-5.
- Example: the column is "Extracted details", not "What we found".

### G23. Review words

- Concept: the words for a value that the app read from a document, or did not find on it.
- Say: "Not on the document", "No due date", "Read as <type>".
- Never: `not on the page` and `classified as` everywhere. `unspecified` in `packages/modules/invoices/src/presentation/` only.
- Applies in: all for the first two phrases, `packages/modules/invoices/src/presentation/` for `unspecified`.
- Source: MOD-5, MOD-9, Q7.
- Example: a missing field shows "Not on the document", not "Not on the page".

### G24. Delete, Remove, Discard

- Concept: three ways a thing goes away.
- Say: "Delete" when a stored thing stops existing (slide, view, panel, deck, dashboard, document, key, chat). "Remove" when a membership, assignment or allocation ends and both things stay. "Discard" for unsaved changes or an unsaved upload.
- Never: `remove slide`, `remove view`, `remove a panel`, `remove key`.
- Applies in: all.
- Source: MOD-5.
- Example: the slide menu says "Delete slide", not "Remove slide".

### G25. The data date

- Concept: the date the figures on a screen are true for.
- Say: "Figures as of <date>". On a source line, "as of <time>", never "Read <time>".
- Never: `balances as of`, `amounts as of`, `data as of`.
- Applies in: all.
- Source: MOD-9.
- Example: the dashboard line says "Figures as of 14 Nov 2026", not "Data as of 14 Nov 2026".

### G26. How Ask worked

- Concept: the lines that show what Ask did to answer.
- Say: "Worked for <duration>" ("Worked for 1 second", "Worked for 4 seconds"). "chart" or "table". No version tag while one version exists. "Read <dataset>" with no number. Plain method lines ("Overdue", not "Overdue yes"). "What Ask passed on".
- Never: `artifact`, `artifacts`, `rows read from`, `new read`, `passed to the`, `ask about your`.
- Applies in: all.
- Source: SHELL-2, SHELL-11, Q2.
- Example: the run line says "Read Invoices", not "120 rows read from Invoices".

### G27. The composer

- Concept: the text box where a person types a question for Ask.
- Say: "Ask a question" at every width.
- Never: covered by G26 (`ask about your`).
- Applies in: all.
- Source: SHELL-11.
- Example: the placeholder is "Ask a question" on a phone and on a desktop.

### G28. The presenter

- Concept: the view a person uses to present a deck.
- Say: "Current slide", "Next slide", "Slide <n> of <m>".
- Never: `now showing`.
- Applies in: all.
- Source: MOD-14.
- Example: the presenter shows "Slide 3 of 8", not "Now showing 3".

### G29. Dates

- Concept: how a date is written on screen.
- Say: en-GB, through core's helper in `packages/core/src/features/audit/helpers.ts`.
- Never: none.
- Applies in: none.
- Source: SHELL-14.
- Example: "14 Nov 2026", formatted by the helper.

### G30. The account menu

- Concept: the menu behind the signed-in person's avatar.
- Say: the person's name, with the email under it.
- Never: none.
- Applies in: none.
- Source: SHELL-12.
- Example: the menu shows "Sam Lee" with "sam@example.com" on the line under it.

### G31. Kept for now

- Concept: platform words that stay on screen until the owner decides.
- Say: "tenant", "realm", "brokered", "deployment", "claim", "token", "Tenant administrator", "Tenant settings".
- Never: none. Owner question 1 (bead `buv3.34`) is open.
- Applies in: none.
- Source: Q1.
- Example: the settings page keeps the title "Tenant settings".

## Banned words

| Banned | Say instead | Applies in | Entry |
| --- | --- | --- | --- |
| `agent`, `agents`, `the assistant` | "Ask" | all | G1 |
| `the chat` | "chat", "this chat", "New chat", "Chats", "Delete this chat?" | all | G2 |
| `chat is off` | "AI is off." | all | G3 |
| `/\bGenie\b(?! Ops Center)/` | "Genie Ops Center" | all | G4 |
| `entitled`, `not entitled`, `/\bswitch(?:es\|ed\|ing)?\b(?:\s+\S+){0,3}?\s+(?:on\|off)\b/i` | "Module on", "Module off", "Turn on", "Turn off", "Status" | all | G6 |
| `enable`, `enabled`, `disable`, `disabled`, `re-enable`, `re-enabled` | a module: "Turn on", "Module on"; a person: "Unsuspend", "Suspended" | all | G7 |
| `remove person` | "Suspend", "Unsuspend", "Deactivate" | all | G8 |
| `not in effect`, `inactive` | "Paused: <reason>" | all | G9 |
| `holder`, `holders`, `who holds`, `nobody holds`, `no one holds`, `holds no role`, `holds no other role`, `holds no advanced role`, `hold no roles`, `you hold`, `what you hold`, `who can open it`, `given directly`, `direct assignment`, `change who has it` | "Assigned roles (n)", "Assigned to", "Not assigned to anyone", "Assigned via", "Direct", "Manage in Access" | all | G10 |
| `path`, `paths` | the words of G10 | `packages/core/src/features/`, `packages/ui/src/`, `packages/modules/`, `apps/genie/src/` | G11 |
| `whole tenant`, `everywhere` | "All records" or the record id | all | G12 |
| `system role`, `system roles`, `copy role`, `role from copy`, `core administration` | "Built-in role", "Custom role", "Copy as new role", "Core" | all | G13 |
| `local group`, `local groups`, `group made here`, `group from your directory`, `display label`, `edit label`, `stale`, `never synced`, `not seen yet` | "Group", "Directory group", "Name", "Rename", "Last synced <time>", "Not synced yet", "Missing from directory" | all | G14 |
| `save changes`, `save as paid`, `save as unpaid`, `save as unallocated`, `looks right`, `save role`, `create role`, `/^Save the payment$/` | "Save" | all | G16 |
| `save as default`, `default view`, `save as view`, `save as new view`, `dashboard filters` | "Original", "Save view", "Reset", "Make default", "Save as original" | all | G17 |
| `clear all` | "Clear filters" | all | G18 |
| `link`, `links`, `linked`, `linking`, `unlink`, `unlinked` | "Allocate", "Allocated", "Part allocated", "Unallocated", "allocation", "Remove allocation" | `packages/modules/invoices/` | G19 |
| `not linked`, `linked payment`, `linked payments`, `payment links` | the words of G19 | all | G20 |
| `by a person` | "by hand" | all | G21 |
| `needs you`, `what we found`, `payment evidence` | "To review", "Extracted details", "Payment" | all | G22 |
| `not on the page`, `classified as` | "Not on the document", "Read as <type>" | all | G23 |
| `unspecified` | "No due date", "Not on the document" | `packages/modules/invoices/src/presentation/` | G23 |
| `remove slide`, `remove view`, `remove a panel`, `remove key` | "Delete" | all | G24 |
| `balances as of`, `amounts as of`, `data as of` | "Figures as of <date>" | all | G25 |
| `artifact`, `artifacts`, `rows read from`, `new read`, `passed to the`, `ask about your` | "chart", "table", "Read <dataset>", "What Ask passed on", "Ask a question" | all | G26 |
| `now showing` | "Current slide", "Next slide", "Slide <n> of <m>" | all | G28 |

## Allowed exceptions

| Path | Banned | Reason |
| --- | --- | --- |
| `packages/core/src/services/agent/prompt.ts` | `*` | model-facing system prompt, 195 recordings |
| `packages/core/src/services/agent/compaction.ts` | `*` | model-facing summary prompt, 4 recordings |
| `packages/core/src/services/agent/tools.ts` | `*` | model-facing tool text |
| `packages/core/src/services/agent/artifact-tool.ts` | `*` | model-facing tool text |
| `packages/core/src/services/agent/file-tool.ts` | `*` | model-facing tool text |
| `packages/core/src/services/agent/hand-over.ts` | `*` | model-facing tool text |
| `packages/core/src/services/agent/catalog-prompt.generated.ts` | `*` | model-facing tool text |
| `packages/core/src/features/agent/catalog.ts` | `*` | model-facing chart catalog prompt |
| `packages/modules/invoices/src/services/reading/model-reading.ts` | `*` | model-facing reading prompt, 6 recordings |
| `packages/core/src/lib/module-contract/validate.ts` | `agent` | developer-facing errors that name contract fields (agent surface, agent tool) |
| `packages/core/src/services/authorization/roles.ts` | `/\bGenie\b(?! Ops Center)/` | the seeded group "Genie Administrators" is stored data and an identity provider group name |
| `packages/modules/invoices/src/agent-instructions.ts` | `link`, `artifact` | model-facing module instructions, 65 recordings |
| `packages/modules/invoices/src/agent-tools.ts` | `link` | model-facing tool text, 65 recordings |
| `packages/modules/analytics/src/agent-tools.ts` | `default view` | model-facing tool text, 29 recordings |
| `packages/modules/analytics/src/agent-surface.ts` | `artifact`, `dashboard filters`, `default view` | model-facing surface instructions, 25 recordings; the surface name is not excepted |
| `packages/modules/slides/src/agent-surface.ts` | `artifact` | model-facing surface instructions, 46 recordings; the surface name is not excepted |
| `packages/modules/invoices/src/datasets.ts` | `linked payment` | model-facing dataset descriptions, 91 recordings; titles and labels are not excepted |
| `packages/core/src/features/roles/roles-screen.tsx` | `save role`, `create role` | a save label that bead `czjw.193` (Phase 16) rebuilds |
| `packages/modules/invoices/src/presentation/invoice-review-form.tsx` | `save as paid`, `save as unpaid` | a save label that bead `czjw.193` (Phase 16) rebuilds |
| `packages/modules/invoices/src/presentation/payment-review-form.tsx` | `save as unallocated`, `/^Save the payment$/` | a save label that bead `czjw.193` (Phase 16) rebuilds |
| `packages/modules/invoices/src/presentation/review-pager.tsx` | `looks right` | a save label that bead `czjw.193` (Phase 16) rebuilds |
| `packages/modules/analytics/src/presentation/filters-bar.tsx` | `save as view`, `save as new view`, `save as default`, `dashboard filters` | saved-view words that bead `czjw.192` (Phase 19) rebuilds |
| `packages/modules/analytics/src/presentation/view-menu.tsx` | `save as view`, `save as default`, `default view`, `dashboard filters` | saved-view words that bead `czjw.192` (Phase 19) rebuilds |
| `apps/genie/src/app/api/session/expired-answer.ts` | `path` | CLI or protocol syntax |
| `packages/core/src/services/keycloak/local-accounts.ts` | `enable` | CLI or protocol syntax |
| `packages/core/src/services/ops/index.ts` | `enable`, `disable` | CLI or protocol syntax |

## What the scan reads

The scan reads only strings that a person reads: JSX text, user-facing string literals and templates, and the values of `apps/genie/src/messages/*.json`. It reads them in `packages/ui`, `packages/core`, `packages/modules`, `apps/genie` and `customers/*/app`. "all" in Applies in means all of these paths.

The scan skips imports, types, object keys, class lists, console calls, SQL, and code tokens that have no space and no capital letter. It skips tests, stories, fixtures, end-to-end specs and all Markdown, this file too.

The scan tests each string on its own. So a regular expression with `^` and `$` matches the whole string.

## Adding a word

To ban a new word, add one row to the banned words table and add or update its entry above. The scan reads the table, so it picks up the new row with no code change.

- A plain phrase matches without regard to case, on whole words. Write it in lowercase, in backticks.
- A phrase that contains another phrase counts under both rows. For example, "Re-enable" is a hit for `re-enable` and for `enable`.
- A cell of the form `/regex/flags` is a JavaScript regular expression. In a table cell, write each `|` of the regular expression as `\|`.
- Applies in is `all`, or path prefixes in backticks, separated by commas. Each prefix ends in `/`, and a prefix under which no scanned file sits fails the scan.
- An exception Path that ends in `/` is a folder, and the row covers every file under it.

The scan parses a row by these rules:

- It splits a Banned cell by its code spans in backticks, never by commas, because a regular expression can hold a comma.
- It changes `\|` in a cell to `|` before it compiles a regular expression.
- The same Entry id can be on more than one row, as G23 is.

An exception row is allowed only for these kinds of text, and it always carries a reason:

- Model-facing text: a prompt, a tool description or a dataset description that the model reads and the person does not.
- A developer-facing error that names a contract field.
- Stored data, or a group name from the identity provider.
- A label that a later phase rebuilds, named with the bead of that phase.
- CLI or protocol syntax that cannot change, for example the command `genie-ops module enable` or the cookie attribute `Path=/`, with the reason "CLI or protocol syntax".

A row is added only after the scan proves a hit in that file. Banned is `*` or the phrases that hit. A developer-facing message that names a glossary concept, such as an operator CLI line or an internal error, is reworded, not excepted. An exception row that hides nothing is stale, and a stale row fails the scan.
