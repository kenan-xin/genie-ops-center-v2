---
type: report
title: Design fidelity audit by class, 2026-11-15
created: 2026-11-15
tags:
  - design-fidelity
  - audit
  - follow-up-13
related:
  - '[[help-disclosure-audit-2026-09-19]]'
  - '[[tokens]]'
---

# Design fidelity audit by class, 2026-11-15

This record lists every class of design drift that the audit of follow-up 13 found in the built screens, and the place where each class gets fixed or decided. A class is one cause with all of its places: a shared component, a token, a variant, copied markup, or one screen. Bead `6wz1.109` owns the audit.

## Method

1. On 2026-11-14 three audit agents compared every built screen with the established industry pattern for its kind: the admin portal, the workspace modules, and the shell and chat. They found 40 classes, which the audit split into 50 by cause.
2. On 2026-11-15 the audit captured every built screen at 390 x 844 and 1440 x 900 from a disposable stack: 137 masked captures.
3. Three critique agents compared the captures with the design captures under `docs/design/sections/` and the prototypes under `docs/design/prototypes/`. They found 20 more classes.
4. The bead comments and the owner's dry run added 8 classes, and the critique notes added 2.
5. The audit checked each proposed fix against the approved designs, the specifications and the owner's answers, then routed each class.

The audit changed no code. Line numbers in the beads are at `develop` `36cf5048`.

## Result

The audit holds 80 classes: 22 word classes and 58 layout classes.

- Each word class is one note on `6wz1.110`, the glossary bead, for Phase 05.
- The 58 layout classes give 67 lines, because 7 classes split into parts with different outcomes.
- 35 lines are new class beads, 12 lines are already covered by a bead, and 6 lines are notes on an existing bead.
- 12 lines are owner rows: the audit's fix contradicts an approved design, a specification line or an owner answer, so the owner decides.
- 1 line joins a word class, and 1 line was not reproduced.

The routing rule comes from the bead map of the follow-up 13 playbook:

1. A word class goes to Phase 05, the glossary.
2. A class whose cause is one shared part goes to Phase 08. A control height goes to Phase 06, and icon alignment goes to Phase 07.
3. A layout class that crosses areas goes to Phase 09.
4. A class in one area goes to the phase of that area: Access 11 or 12, slides 13 to 15, review desk 16, invoices and lists 17, chat 18, dashboards 19.
5. A class whose phase has finished goes to the next phase that changes the same files.

## Layout classes

| Id | Cause | Where | What it breaks | Outcome |
| --- | --- | --- | --- | --- |
| ADM-4L | copied markup | Roles Kind column reads "System · Core" | role-detail prototype `b2da8f0`: "Built-in role" | joins word class ADM-4, Phase 05 |
| ADM-5a | copied markup | account page (2 help disclosures), Branding tabs (2 beside the header help) | `tokens.md`: at most one help per screen, and the account spec draws notes | `6wz1.130`, Phase 09, rule 3 |
| ADM-5b | copied markup | help placement on the admin screens | audit pattern: a Learn more in the page header | owner row O-1 |
| ADM-9a | screen | module id on Modules rows, group value in the group inspector | audit pattern: ids in a details area | owner row O-2 |
| ADM-9b | screen | `issue.path` codes in the Modules review | readable issue text | note on `6wz1.47` (backlog) |
| ADM-9c | screen | audit Summary as a code | a summary is a sentence | not reproduced |
| ADM-10 | screen | Access Overview and Grants open empty | owner question 9: start filled | `d8l5.62`, Phase 12 |
| ADM-12 | screen | Add person assigns roles | owner question 10 | `d8l5.63`, Phase 12 |
| ADM-13 | screen | People has its own sort select | audit pattern: sortable headers | owner row O-3 |
| ADM-14a | screen | role detail title | role-detail prototype | `d8l5.61`, Phase 11 |
| ADM-14b | screen | Overview phone cards repeat the filtered column | a card drops the filtered column | note on `d8l5.62`, Phase 12 |
| ADM-14c-a | screen | a Category picker on every Modules row | audit pattern: edit in a detail view | owner row O-4 |
| ADM-14c-b | screen | Modules Access cell wraps, with "+n" on its own line | `modules.png`: one line, "+n" inline, an arrow link | `6wz1.134`, Phase 12, rule 4 |
| ADM-15 | shared parts and module markup | counts, money and axis ticks | owner A-7: tabular figures | `6wz1.125`, Phase 09, rule 3 |
| ADM-16 | `ui/components/avatar.tsx` | person and group avatars | DESIGN.md Tile | `6wz1.116`, Phase 08, rule 2 |
| ADM-17 | `ui/components/tabs.tsx` | sheet, Branding, panel and chart tabs | a full-width hairline | `6wz1.117`, Phase 08, rule 2 |
| ADM-18 | copied markup | group and person sheets, account chip | the hairline, not the input border | `6wz1.131`, Phase 09, rule 3 |
| ADM-19 | copied markup | Branding color rows | one control height | `6wz1.115`, Phase 06, rule 2 |
| ADM-20 | copied markup | Branding theme and preview choices | branding spec: a segmented toggle | `6wz1.118`, Phase 08, rule 2 |
| ADM-21 | copied markup | Roles and Categories phone cards | the phone designs draw no tile | `6wz1.132`, Phase 09, rule 3 |
| MOD-3 | screen | review desk | owner question 6: one form | `czjw.187`, `czjw.186`, Phase 16 |
| MOD-3b | screen | record desk beside the history drawer | the content stays visible | `czjw.196`, Phase 16, rule 4 (the file of the review desk) |
| MOD-6 | screen | "No due date" as a status | owner question 7 | `czjw.191`, Phase 17 |
| MOD-7 | screen | dashboard saved views | owner question 8 | `czjw.192`, Phase 19 |
| MOD-8a | screen | Overdue as a toggle | audit pattern: a Status dropdown | owner row O-5 |
| MOD-8b | screen | panel notes and the edit menu above the title | dashboard filters variant A | `czjw.206`, Phase 19, rule 4 |
| MOD-8c | `ui/list-header` | Clear filters with no filter set | owner C8 | note on `czjw.179`, Phase 17 |
| MOD-9b | screen | the slide refusal under the editor bar | audit pattern: at the control | owner row O-6 |
| MOD-9c | screen | lists sort by Updated | audit pattern: invoice date | owner row O-7 |
| MOD-10a | screen | slide editor controls | audit pattern: Google Slides | owner row O-8 |
| MOD-10b | screen | the style toolbar in the page flow | variant A: a floating toolbar | owner row O-9 |
| MOD-12 | screen | invoice figures, dashboard panels on a phone | audit pattern: figures follow the tab | owner row O-10 |
| MOD-13a | screen | Type at page level | owner question 6 | `czjw.187`, Phase 16 |
| MOD-13b | screen | phone deck header | deck-phone prototype | `czjw.176`, Phase 13 |
| MOD-13c | screen | invoice record header action | audit pattern: Record payment first | owner row O-11 |
| MOD-14L | screen | presenter notes and key hints | audit pattern: PowerPoint | owner row O-12 |
| MOD-15 | `ui/parts/data-table.tsx` | sort headers | list-filters prototype | `6wz1.119`, Phase 08, rule 2 |
| MOD-16 | `ui/components/chart.tsx` | legend order | the series order | `6wz1.120`, Phase 08, rule 2 |
| MOD-17 | `ui/parts/data-table.tsx` | phone card detail slot | list-filters prototype | `6wz1.121`, Phase 08, rule 2 |
| MOD-18 | copied markup | module empty states | tokens.md: an icon tile | `czjw.195`, Phase 09, rule 3 |
| MOD-19 | `ui/list-header/filter-sheet.tsx` | filter sheet labels | the shared field label | `6wz1.122`, Phase 08, rule 2 |
| MOD-20a | screen | Add filter offers id fields | coordinator, A0-3 | `czjw.178`, Phase 19 |
| MOD-20b | screen | filter triggers have no icon | dashboard filters prototype | `czjw.207`, Phase 19, rule 4 |
| SHELL-1 | core part | Try again only after a refusal | owner question 11 | `czjw.188`, Phase 18 |
| SHELL-3 | core parts | table answers as one string per row | owner D7: a small table | `czjw.197`, Phase 18, rule 4 |
| SHELL-4a | core part | panel expand icon | `agent.md`: an Ask chat keeps its link to Ask | `czjw.198`, Phase 18, rule 4 |
| SHELL-4b | core part | version pager for one version | Spec 7 R-45a | `czjw.199`, Phase 18, rule 4 |
| SHELL-5 | core parts | progress and Stop | agent-progress prototype | note on `czjw.181`, Phase 15 |
| SHELL-6a | screens | phone chat chrome | one top bar | `czjw.200`, Phase 18, rule 4 |
| SHELL-6b | screen | Present on the phone deck page | deck-phone prototype | `czjw.176`, Phase 13 |
| SHELL-7 | core part | artifact back arrow at the right | back leads | `czjw.201`, Phase 18, rule 4 |
| SHELL-8 | copied markup | New chat, sidebar toggles, Open | one icon per action | `czjw.202`, Phase 18, rule 4 |
| SHELL-9 | screens | chat history rows | a row menu | `czjw.203`, Phase 18, rule 4 |
| SHELL-10 | core part | answer actions far right | a left icon row | note on `czjw.188`, Phase 18 |
| SHELL-12L | core part | Agent button in the bell slot | shell spec | note on `buv3.32` (backlog) |
| SHELL-13 | core part | desktop content starts 12 px high | shell design | `6wz1.123`, Phase 08, rule 2 |
| SHELL-15 | screen | Ask history group header | agent-runs prototype | `czjw.204`, Phase 18, rule 4 |
| SHELL-16 | shared parts | lists beside the docked agent panel | no horizontal scrolling | `6wz1.133`, Phase 09, rule 3 |
| SHELL-17 | screen | history sheet close button | the sheet title row | `czjw.205`, Phase 18, rule 4 |
| SHELL-18 | screen | account session rows | account page design | `d8l5.64`, Phase 08 (no account phase) |
| X-1 | copied markup | monospace labels and numbers | owner A-7 | `6wz1.124`, Phase 09, rule 3 |
| X-2 | core part | Access picker icons | owner A-6 | `d8l5.65`, Phase 12, rule 4 |
| X-3 | copied markup | disabled controls with no reason | owner E5 | `6wz1.126`, Phase 09, rule 3 |
| X-4 | copied markup | upload fields with two names | owner E5 | `6wz1.127`, Phase 09, rule 3 |
| X-5 | copied markup | filling grids | owner E5 | `6wz1.128`, Phase 09, rule 3 |
| X-6 | copied markup | horizontal scrollers | owner E5 | `czjw.176`, shared fix in Phase 09 |
| X-7 | missing app part | the bare framework 404 page | no design | `6wz1.129`, Phase 09, rule 3 |

ADM-11 and MOD-11 of the reports are places of X-3. Three routes leave the plain rule order, and the run records each as a deviation. The chat beads go to Phase 18 by rule 4, and not to Phase 08 by rule 2, because each part renders only in the agent chat (P04-16). X-2 goes to Phase 12, which rebuilds the Access lookups (P04-19). MOD-3b goes to Phase 16, which rebuilds its file (P04-21). Tenant settings shows two help buttons, but its current spec draws both, so it is not a place of ADM-5a.

## Word classes

Each row is one note on `6wz1.110`. Phase 05 writes the glossary and sweeps every string.

| Id | Where | Standard word | Owner answer |
| --- | --- | --- | --- |
| ADM-1 | a module's on and off state | one on and off pair | glossary words of 2026-11-14 |
| ADM-2 | the bare product name | "Genie Ops Center" | question 1 keeps the other words |
| ADM-3 | who has a role | "Assigned to", "Assigned via" | A-2, A-7 |
| ADM-4 | role kinds | "Built-in role", "Custom role" | glossary words of 2026-11-14 |
| ADM-6 | "Pending" for two things | "Pending" only for people | none |
| ADM-7 | person lifecycle | "Suspend", "Deactivate" | question 3 |
| ADM-8 | group words | "Name", "Rename", "Last synced" | glossary words of 2026-11-14 |
| ADM-14d | the assistant's name | "Ask" | question 2 |
| ADM-22 | one name on every Remove button | the action names its object | none |
| MOD-1 | matching payments to invoices | "Allocate" | question 4 |
| MOD-2 | Documents tabs and statuses | "To review", "Processing", "Processed" | question 5 |
| MOD-4 | Save labels that change | "Save" | question 12 (`czjw.193`, Phase 16) |
| MOD-5 | two names for one idea | one name, "Delete" for stored things | question 7 for the due date |
| MOD-9 | developer wording | plain sentences | none |
| MOD-14 | presenter labels | "Current slide", "Next slide" | none |
| SHELL-2 | method words | "Worked for n seconds" | question 2 for the names |
| SHELL-11 | composer placeholder | one short placeholder | none |
| SHELL-12 | the user menu shows the role | name and email | question 1 |
| SHELL-14 | date format | `en-GB` | none |
| W-1 | "Core administration" | "Core" | A-6 |
| W-2 | "Clear all" | "Clear filters" | P16f-8 |
| W-3 | "Save changes" beside "Save" | the glossary decides | none |

## Owner rows

The audit's fix for these places contradicts an approved design, a specification line or an owner answer. Today's screen stays until the owner answers. An answer at gate G2 lets the phases of the run build a change.

| Row | Class | Today, as designed | The audit's pattern | Source that keeps it |
| --- | --- | --- | --- | --- |
| O-1 | ADM-5b | one help disclosure per screen, beside the control it explains | one description line and a Learn more in the page header | `design-system/tokens.md` Help disclosure, `help-disclosure-audit-2026-09-19.md` |
| O-2 | ADM-9a | the module id in mono on each Modules row, and the group value in the group inspector | ids in a details area | Modules spec line 25, people spec line 10 (Spec 2 R-24c) |
| O-3 | ADM-13 | People has its own sort select | sortable headers on desktop | people spec line 30 |
| O-4 | ADM-14c-a | a Category picker on every Modules row | plain text, edit in a detail view | Modules spec lines 25 and 42, `modules.png` |
| O-5 | MOD-8a | Overdue is a toggle in the dashboard filters | a labelled Status dropdown | `dashboard-filters.prototype.html` variant A |
| O-6 | MOD-9b | variant A draws a refused slide change under the editor bar (the build's place was read in code only) | the message at the control | `slide-editor-controls.prototype.html` variant A |
| O-7 | MOD-9c | lists sort by Updated, newest first | invoice date or due date | Spec 7 R-37a |
| O-8 | MOD-10a | a weight control, borders 0 1 2 4, Edit text opens the sheet, a muted Undo label | bold and italic buttons, click to edit | `slide-editor-controls.prototype.html` variant A |
| O-9 | MOD-10b | the style toolbar is a row in the page flow (62 px) and wraps at 1280, and Add slide sits only under More (no desktop design draws it) | a floating toolbar, as variant A draws it, and Add slide in view | variant A disagrees, but owner row A0-1 keeps the desktop as built |
| O-10 | MOD-12 | invoice figures read the whole ledger, and dashboard panels stack on a phone | figures follow the tab, 2 by 2 on a phone | Spec 7 R-37a, `phone-adapt.prototype.html` A |
| O-11 | MOD-13c | Correct the total is the invoice record's header action | Record payment first, the rest in More | `invoice-record.prototype.html` variants A to C |
| O-12 | MOD-14L | presenter notes carry "Slide n", and key hints sit in the top bar | notes with no number | `presenter-window.prototype.html` variant A |

## New places of filed beads

The audit appended these places to beads that already owned the class: `czjw.177` (the agent button dot on desktop and in every panel header), `6wz1.106` (the account page help triggers), `6wz1.107` (Sign out all other sessions, Present, Export to PowerPoint), `6wz1.113` (the fold tile of the answer), `6wz1.114` (the phone Filters button and search), `czjw.179` (the cause in `list-state.ts`), `czjw.181` (the fold line and the rest of SHELL-5), `czjw.188` (the actions row of SHELL-10), `d8l5.62` (ADM-14b), `czjw.176` (the scroller places of X-6), `6wz1.47` (ADM-9b) and `buv3.32` (SHELL-12L). The class beads `czjw.197` and `czjw.200` take the places of the deferred `czjw.94` and `czjw.164`.

## Captures and working files

The captures are not in the repository. They and the working notes are in the run folder of follow-up 13, which git does not track: `.maestro/playbooks/2026-10-25-Spec-3-Pending-Fixes-3/2026-10-26-Spec-3-Pending-Fixes-4/2026-10-28-Batch-5-And-Spec-7-Wave-1/2026-10-29-Follow-Up-6-And-Spec-7-Wave-2/2026-10-30-Follow-Up-7-And-Spec-7-Wave-3/2026-11-01-Follow-Up-8-And-Spec-7-Wave-4/2026-11-08-Follow-Up-11-Spec-7-Wave-5/2026-11-15-Follow-Up-13-Design-Fidelity/Working/`.

| File | Content |
| --- | --- |
| `screenshots/phase-04/6wz1.109-<screen>-<width>-light.png` | the 137 captures, for example `6wz1.109-admin-modules-1440-light.png` |
| `phase-04-capture-manifest.md` | each screen, state, person and design file |
| `phase-04-critique-admin.md`, `-modules.md`, `-shell.md` | the three critiques |
| `phase-04-class-table.md`, `phase-04-classes-admin.md`, `-modules.md`, `-shell.md` | every class with all of its places |
| `phase-04-disposition.md` | the outcome of each class and the owner rows |
| `logs/phase04-capture.log`, `logs/phase04-capture.jsonl` | the capture run and its probes |

## Limits

- The critiques judged still captures from headless Chromium. They did not judge the horizontal scrollers (X-6).
- The audit did not capture a table answer, the agent building state, the idle countdown, the empty inbox, or a member with a placeholder role.
- Some designed screens have no capture: the not-set-up page, the break-glass account variant, the break-glass steps after the first form, the second tab of the group sheet, and the Settings sections other than Reporting.
- The searches for X-1, X-5 and X-6 used text patterns. Each class bead asks its phase to search again.
