# Post-run review: Follow-Up 11, Phases 04 to 11

Record, not current. The fixes in this record are merged into develop. Beads hold the open follow-ups. In this folder, `fix-plan.md` is the plan of the fixes, `fix-ledger.md` is the execution ledger with every ruling, and `d8l5.57-plan.md` is the plan of the last fix. A path under `Working/` names a run file that the worktree held and that was not kept.

Date: 2026-11-11. Develop at `a18a57bc`. Seven Opus reviewers read code and git only. Nobody ran a test, a gate, Storybook or a browser. Every line number is on current develop.

The review found no Critical defect. After validation it holds 10 Important and 37 Minor findings in the ranges, plus 1 Important finding from before the ranges. No finding is fixed on current develop, except one in Phase 08 that is listed in that section.

## Validation (2026-11-11)

A fresh Opus validator checked every finding against develop. Library behavior came from the main checkout `node_modules` (recharts 3.8.0, query-core 5.104.5). The coordinator then checked each disputed point in the code. The results:

- Removed as false: 3.6 (`access-grants.integration.test.ts:547`, `:567` and `access-advanced.integration.test.ts:686` test `module-disabled`) and 4a.3 (61 is below the guard of 66, so the guard catches the reported drop).
- Merged: 1.2 into 1.1, because they have the same line and the same cause. Bead `czjw.145` is closed as a duplicate.
- Downgraded to Minor: 2.1 (a scoped `core:roles:manage` can only come from the raw `roles.assign` call, see N.1), 6.3 (a gap on a secondary band) and 7.1 (only the draft is lost, because runs are server jobs that the remounted chat polls again). Beads `czjw.149` and `czjw.150` are closed. Bead `d8l5.51` now tracks N.1.
- Corrected: wrong lines in 2.1, 3.2 and 4b.1. Wrong scenarios in 1.1 (the proposed fix cannot exist), 2.4 and 7.3.
- Added: N.1, from before the ranges.
- A system-wide fact: `apps/genie/playwright.config.ts:42` ignores `**/e2e/dev/**`, and `ci:develop` runs no dev spec. So no e2e named in 6.x and 7.x runs in `gate:merge`. Only 3.1 depended on that fact before.

| Range | Critical | Important | Minor |
|---|---|---|---|
| 1. Phase 04 F2 shared fields and help | 0 | 1 | 4 |
| 2. Phase 05 F3 access effective grants | 0 | 0 | 5 |
| 3. Phase 06 F4 module roles and people | 0 | 1 | 4 |
| 4a. Phase 07 F5 list header polish | 0 | 1 | 2 |
| 4b. Phase 10 F8 idle timeout | 0 | 1 | 1 |
| 5. Phase 08 F6 Ask polish | 0 | 1 | 8 |
| 6. Phase 09 F7 review desk | 0 | 2 | 5 |
| 7. Phase 11 W1 agent surfaces (UI only) | 0 | 3 | 8 |
| N. Found during validation, before the ranges | 0 | 1 | 0 |

The bead for each Important finding is in brackets after its title.

## 1. Phase 04 F2 shared fields and help (`84ebe4b1..4dcb4761`)

No authorization, `TenantContext` or import code changed.

### Important

1. The 12-month chart axis drops the last month. [genie-ops-center-v2-czjw.144]
   - Where: `packages/ui/src/parts/chart.tsx:336`. The stories `chart.stories.tsx:729` and `:736` assert the wrong behavior.
   - Scenario: 12 monthly rows, Nov 2025 to Oct 2026, in the 447 px Ask panel or at 390 px. `interval="equidistantPreserveStart"` shows Nov, Jan, Mar, May, Jul, Sep. The current month has no label. The acceptance of `czjw.106` asks for an even step that keeps the first and the last label. The same happens with 6 months on a phone dashboard tile (Oct unlabeled, per the phase capture note). The run logged this as deviation P04-6 for the owner and closed the bead.
   - Validation: 12 points have 11 intervals and 6 points have 5. Both numbers are prime, so no even step greater than 1 keeps both ends. The acceptance cannot be met as written (`Working/phase-04.md:134`).
   - Fix: the owner rules on P04-6. The options are every label with rotation, every label in a smaller font, or an amended acceptance. Then change the stories at `chart.stories.tsx:729` and `:736` to assert the chosen rule.
   - 1.2 (six months on a phone tile) is merged into this finding.

### Minor

3. `chart.tsx:340` passes `{ compact: true }` for every x type. A number x of 2024 shows "2.02K". Fix: `compact: x.type === "date"`.
4. `help-disclosure.tsx:70`: the negative start margin makes the trigger overlap the text before it in a row (`branding-screen.tsx:411`), and moves it off center in `sign-in-stack.tsx:43`. Fix: an opt-out for the hang.
5. `input.stories.tsx:103-151`: the one-height table leaves out `ComboboxTrigger` and the `DateRangePicker` trigger.
6. Design documents still describe the Admin portal pill: `docs/design/shell/spec.md:63`, `docs/design/design-system/tokens.md:62` and `:97`, `DESIGN.md:206`.

## 2. Phase 05 F3 access effective grants (`4dcb4761..3825e60b`)

Effective grants are correct, and all checks stay inside `can` and `scopesFor`.

### Minor

1. A Roles manager with a scoped grant gets an error on every role detail. Downgraded from Important in validation.
   - Where: `apps/genie/src/app/admin/roles/roles-route.tsx:52-69`, error at `:158`. The checks are `assertManagesAllRoles` at `packages/core/src/services/roles/effective-access.ts:267` (`accessBySubject`) and `packages/core/src/services/roles/grants.ts:373` (`grantRecipients`).
   - Scenario: the Roles page admits a holder of `core:roles:manage` at any scope. The two holder reads need the key tenant-wide, so the holder sees "The holders could not be read." This is a regression from the old `readRole`.
   - Reach: no screen can create a scoped `core:roles:manage`. Core roles take no scope in Advanced access (`advanced.ts:299-310`). Only the raw `roles.assign` call can create one, see N.1.
   - Fix: fix N.1. Then hide the holder section when the viewer does not manage all roles.

2. `packages/core/src/features/access/grants-view.ts:105-113`, `removalOf` at `:149`: a row shown as read-only ("Included in Invoices viewer") is removed by Remove on the editable row of the same module. Fix: label it differently, or show it only in Advanced access.
3. `apps/genie/src/app/admin/people/people-route.tsx:201` and `roles-route.tsx:147`: links to Groups and People show to a manager who cannot open those screens. Fix: pass `onOpenGroup` and `holderHref` only when the viewer holds the key.
4. `overview-screen.tsx:384` and `roles-screen.tsx:416`: the "holders" count counts paths. One holder with two assignments, for example on two scopes, counts twice.
5. `packages/core/src/services/roles/person-access.ts:26`: a people manager scoped to one person can read the access of every person. This matches `people.list` and `people.get`. Fix: `can` with the person as the resource, if scoped people managers are meant to exist.

## 3. Phase 06 F4 module roles and people (`3825e60b..da3adb1d`)

No data-loss or privilege-escalation path. The switched-off module check sits in the one shared writer.

### Important

1. The Add person journey has no end-to-end test in CI. [genie-ops-center-v2-d8l5.52]
   - Where: `apps/genie/e2e/dev/add-person-access.spec.ts:90` belongs to `test:e2e:dev`. `ci:develop` (root `package.json:19`) runs only `test:e2e` and `test:e2e:generated`. `people.spec.ts` never picks a role.
   - Scenario: a change breaks the role selects, the `roleIds` sent from the picks, or "Open in Access after adding". `gate:merge` still passes. The `d8l5.44` acceptance asks for a phone and desktop end-to-end test of this path. The "granted at first sign-in" item is never checked through a sign-in.
   - Fix: add one test to `people.spec.ts` that picks Placeholder and Ask, adds the person, and lands on Access.

### Minor

2. `people-screen.tsx:1391` and `people-route.tsx:62-66`: if the role catalogue fails or is still loading, the picker disappears with no message and the person is added with no access.
3. `packages/core/testing/demo-seed.ts:145-152`: the re-seed removes every direct module grant that has no creator, not only the grants the seed made. Every app writer sets a creator (`role-assignment.ts:151`), and the missing audit row is intended (`demo-seed.ts:204-207`), so the risk is limited to raw SQL rows on a dev database.
4. `people-screen.tsx:1302`: long role names clip in the desktop select. Already filed as `d8l5.50`.
5. Access stories still use the old role names: `grants-screen.stories.tsx:174, 398, 413, 430`, `remove-access-dialog.stories.tsx:19-21`, `role-choice.stories.tsx:47-67`.

## 4. Phase 07 F5 list header polish (`da3adb1d..c9e72913`) and Phase 10 F8 idle timeout (`326d9de6..655e35a4`)

### Phase 07, Important

1. Clear filters loses keyboard focus. [genie-ops-center-v2-6wz1.98]
   - Where: `packages/ui/src/list-header/filter-bar.tsx:166-170`.
   - Scenario: a keyboard user presses Enter on Clear filters. The filters empty, the button unmounts, and focus falls to `<body>`. This fails WCAG 2.4.3. The `ClearFilters` story does not check focus.
   - Fix: move focus to the search input or the first bar control, and add a focus assertion to the story.

### Phase 07, Minor

2. `docs/specs/07-invoice-and-payments.md:126`: R-37a still describes variant C. Amend it to variant A with the `czjw.102` ruling.
3. `packages/ui/src/parts/data-table.tsx:543`: `card.trailing ?? rowAction` drops the row action on a phone when `trailing` renders content. When `trailing` returns null the action shows. This can be an intended override.

### Phase 10, Important

1. A single open tab still gets no warning after an administrator lowers the idle timeout. [genie-ops-center-v2-d8l5.53]
   - Where: `packages/core/src/features/account/session-activity.tsx:110-119` and the throttle at `:142-147`. Server: `packages/core/src/services/auth/index.ts:1086-1097` applies the current setting to `last_active_at` at once.
   - Scenario A: the window drops from 15 to 5 minutes while the person types in a form. The tab still throttles at 7.5 minutes. The server expires the session at 5 minutes. The next call gets 401 and the page goes to sign-in with no warning. The unsaved form is lost.
   - Scenario B: the person reads without input. The tab never learns the new window. The server ends the session at 5 minutes, and the tab warns at 13 minutes for a dead session.
   - The e2e `session-idle-window.spec.ts` only covers a new tab opened after the change.
   - Fix: store the window on the session row at each activity call, and use the stored value in the idle check. A lowered window then applies from the next activity, which is also when the tab learns it. Add a one-tab e2e test. This fix needs a migration and changes how R-14 reads, so the owner must rule on it first.

### Phase 10, Minor

2. `apps/genie/src/session-activity-mount.tsx:29`: a 200 answer that is not JSON shows "We could not reach the server" after the session did slide.

## 5. Phase 08 F6 Ask polish (`c9e72913..986013a8`)

Rename and delete are owner-scoped and gated by `core:ask:use`.

### Important

1. A chat deleted while its file is being made leaves an orphan file. [genie-ops-center-v2-czjw.146]
   - Where: `packages/core/src/services/agent/file-job.ts:181-206` (update at `:200`), against `packages/core/src/services/agent/store.ts:264-291`.
   - Scenario: the person asks for a CSV export, then deletes the chat while the job pages. `deleteOwnSession` sees no file yet, and the cascade deletes `agent_file`. The job then stores the file, and the update matches 0 rows but commits. A `file` row and its bytes stay with no chat, against the dialog's promise to delete the files the chat made.
   - Fix: lock the `agent_file` row with `for update` in the job transaction, or use `.returning()` and throw when the row is gone. Add an integration test that deletes the session mid-job.

### Minor

2. `ask-screen.tsx:456-475`: the Delete confirm has no pending state, and a double click leaves an old error on the next dialog.
3. `conversation.tsx:402-416`: "Jump to latest" unmounts while it has focus.
4. `answer-sources.ts:174`: "How this was counted" shows instant filters as UTC days, not in the tenant zone.
5. `answer-sources.ts:179`: money filter values assume two decimals (JPY 50,000 shows "500.00").
6. `ask-route.tsx:165`: the phone menu offers a model choice during the first answer, and the choice does nothing.
7. `message-parts.tsx:329`: Copy fails silently, and "Copied" is not announced.
8. `ask-screen.tsx:212`: the New chat pencil has no tooltip (`czjw.120` item 14), recorded as P08-19 but closed as built.
9. `message-parts.tsx:101-114`: no recorded model answer carries `next`, so no e2e shows Ask next. Phase 16 plans the refresh.

### Already fixed on develop

- A delete during a running answer made the final `appendMessage` fail. `run-job.ts:150-153` and `:213-214` now handle it.

## 6. Phase 09 F7 review desk (`986013a8..326d9de6`)

No router or service code changed, so DEC-39 and DEC-34 are not touched.

### Important

1. Enter on a phone field step saves the whole review without the summary. [genie-ops-center-v2-czjw.147]
   - Where: `packages/modules/invoices/src/presentation/review-workspace.tsx:110-114`, with `review-pager.tsx:572` and `:516`.
   - Scenario: the field step shows no submit button but sits inside the form. On a step with one text input, the phone Go key submits the form (HTML implicit submission), and `model.submit()` saves when nothing blocks. On document 06 the record saves from step 1. If the server answers Possible duplicate or fails, the notice renders only on the summary step, so the person sees nothing.
   - Fix: let a submit from a step other than the summary go to the next step. Add a phone story: Enter on step 1 does not save.
2. The pager drops focus and announces nothing when the step changes. [genie-ops-center-v2-czjw.148]
   - Where: `review-pager.tsx:585` (Previous removed at step 1), `:572` (Next bar swapped for the save bar), `:563` (step counter is not a live region).
   - Scenario: a screen-reader user presses Previous on step 2. The button unmounts and focus falls to `<body>`. On "Looks right" focus stays on a button with the same name and nothing new is read.
   - Fix: move focus to the step heading after each step change, or make the counter `role="status"`. Keep Previous rendered with `aria-disabled` on step 1.
### Minor

3. The 1024 to 1279 px desk band has no test. Downgraded from Important in validation.
   - Where: `review-desk.tsx:125` and `:144-155`. Stories run only at 1440 and 390 (`review-desk.stories.tsx:39-41`), and so does `review.spec.ts:247-251`.
   - Fix: add a story at about 1100 px that asserts the "On the page" group holds the cards and no `[data-pin-card]` exists.

4. `invoice-review-form.tsx:398-408`, `payment-review-form.tsx:269-281`, `document-review.tsx:210`: a failed refetch after a good save brings Save back, and a second press shows a duplicate error.
5. The `submit` functions in both form hooks have no `pending` check, so Enter during a save sends a second save. The server refuses it.
6. `review-pager.tsx:416`: "X of N done" counts the summary step, so it never reaches N.
7. `apps/genie/e2e/dev/dev-support.ts`: the phone e2e jumps through All fields and never walks Next to the summary.

## 7. Phase 11 W1 agent surfaces, UI only (`655e35a4..de7c85a3`)

No DEC-39 hole on the screens. Write tools stay gated by `can`.

### Important

2. The phone bottom panel has no Escape and does not give focus back. [genie-ops-center-v2-czjw.151]
   - Where: `agent-panel-host.tsx:250` (`returnFocus.current = docked`), `:497-506` (no `onKeyDown`).
   - Scenario: below 768 px on a surface record page (`bottom` is `target !== undefined && phone`, `:235`), a keyboard user closes the panel. Other phone pages use the Sheet, which works. Focus drops to `<body>`, and Escape does nothing. The `PhoneSheet` story checks neither.
   - Fix: `returnFocus.current = docked || bottom`, the same Escape handler on the bottom aside, and both checks in `PhoneSheet`.
3. No e2e drives the handoff from the Ask screen or checks the card and brief of AC-13. [genie-ops-center-v2-czjw.152]
   - Where: `apps/genie/e2e/dev/surface-support.ts:94-115` and `agent-surfaces.spec.ts:160` start in the side panel. No e2e reaches `ask-route.tsx:199-203`.
   - Scenario: a regression in `AskRoute.onHandoff` stops the panel opening on arrival or sends the person to the wrong page. Every spec passes. No e2e asserts the brief card or "From Ask". The Building chip and the deck page are asserted for the panel path (`agent-surfaces.spec.ts:175`, `surface-support.ts:109-111`). These specs are dev specs and do not run in `gate:merge`.
   - Fix: assert "From Ask" in both handoff tests. Add one handoff test from `/ask` that checks the open panel and the card on return.
4. Stop and retry failures are silent. [genie-ops-center-v2-czjw.153]
   - Where: `packages/core/src/features/agent/agent-chat.tsx:91-98`. The mutations have no `onError`, and `apps/genie/src/query-client.ts:8` has no global handler.
   - Scenario: Stop fails on a network drop. The run keeps building and nothing tells the person. Try again refused with `agent-run-active` shows nothing.
   - Fix: show the mutation error in the refusal line or a `role="alert"`, and disable Try again while it is pending.

### Minor

1. Moving onto or off a record page drops the panel draft. Downgraded from Important in validation.
   - Where: `agent-panel-host.tsx:279` keys the chat by `${shownId}:${loads}`. The draft is `useState` at `conversation.tsx:145`.
   - Scenario: a person types a question in the panel on `/m/slides/decks` and opens a deck. The draft is gone on return. A running answer is not lost: runs are server jobs, and the remounted chat polls them through `useSessionDetail` (`agent-chat.tsx:87-89`).
   - Fix: keep the draft in the panel store by session.
5. `handoff-card.tsx:129-136`: when the read fails, the card shows "Handing over..." forever.
6. `conversation.tsx:280-284` with `dashboard-view.tsx:275`: a starter chip sent while a run builds is refused with 409 and the text is lost.
7. `agent-panel-host.tsx:440-463`: the `tabpanel` divs are not linked to their tabs.
8. `agent-panel-host.tsx:339-343`: the Building to Saved change is not announced.
9. `handoff-card.tsx:153`, `:186`, `brief-card.tsx:59`: plain anchors reload the whole app.
10. `handoff-card.tsx:107`, `brief-card.tsx:54`: brief rows keyed by text give duplicate keys.
11. `agent-panel-host.tsx:446`: the tab says "Chats" with "On this page" and "Other chats". AC-13 says "under the Slides chats". The owner must confirm the wording.

## N. Found during validation, before the ranges

### Important

1. `roles.assign` skips the scope rules, and a scoped Roles manager can make itself Tenant administrator. [genie-ops-center-v2-d8l5.51]
   - Where: `packages/core/src/services/roles/router.ts:103-119`, gated only by `gatedArea(rolesContract, "core:roles:manage")` (`router.ts:39`). That gate uses `can(caller, permission)` with no resource (`packages/core/src/lib/rpc/implement-core-area.ts:46`), so it passes for the key at any scope. `assignRole` (`packages/core/src/services/authorization/role-assignment.ts:190-200`) checks no scope. The Grants and Advanced writers call `assertManagesAllRoles` and `assertAddable` (`advanced.ts:299-312`), but this call does neither. No screen calls `roles.assign`, but the oRPC endpoint is open to any signed-in caller.
   - Scenario: an administrator calls `roles.assign` and gives Bob a core role that holds `core:roles:manage`, scoped to one invoice. That scope is meaningless, but the call accepts it. Bob now passes the `core:roles:manage` gate. He calls `roles.assign` with Tenant administrator, himself and no scope, and gets the full tenant. The same call also writes core roles at any scope and record types that do not exist.
   - The code dates from `49a61194` (2026-10-09), before the reviewed ranges. It is the only way to create the precondition of 2.1 and 2.5.
   - Fix: in the `assign` handler, call `assertManagesAllRoles` and the same `assertAddable` check the Advanced editor uses. Add an integration test: a caller with a scoped `core:roles:manage` is refused, and a core role with a scope is refused.

## Result (2026-11-11)

The fixes were merged into develop at `5f481c50`, with all 10 commits kept, after the gate passed. These beads are closed: `d8l5.51`, `czjw.146`, `czjw.147`, `czjw.148`, `czjw.151`, `czjw.152`, `czjw.153` and `6wz1.98`. `d8l5.52` is closed as invalid, because `@genie/app:test:integration` runs `test:e2e:dev` in CI. The owner chose to leave `czjw.144` and `d8l5.53` open.

The work found these follow-ups and filed them as beads:

- `d8l5.57`: `roles.assign` skipped the R-39 recipient check (P2). It is fixed on develop at `8f7990dc` and pushed, and the full `gate:merge` passed. The fix was first written on `assertAssignable`. Another session then removed that helper (`8ca380be..e9178df3`), so the check was applied again to the new `assign` handler during the rebase. An Opus review approved the resolution.
- `d8l5.58`: the role and group writers gated on `core:roles:manage` at any scope (P3). It is closed. The other session fixed it in `7ffe813e` and `3f157663`. Scoped rows written before `d8l5.51` are tracked in the deferred bead `d8l5.55`.
- `6wz1.100`: the phone filter sheet Clear all may drop keyboard focus (P3, not confirmed).
- `xok3.69`: a flaky test on `/ask` logs "Maximum update depth exceeded". The same failure occurs with develop source.

## Set aside by the reviewers

- Visual match with prototypes and captures. This needs a running app.
- TanStack Form internals. The validator read recharts and query-core in the main checkout.
- Real contrast, axe and phone rendering. No browser or Storybook ran.
- Server agent code of Phase 11. Earlier reviews covered it.
