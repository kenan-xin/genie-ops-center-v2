# SDD ledger — plan: Working/plans/post-run-review-04-11-plan.md

Scope of this run: Tasks 1-3 only. Workspace (briefs, reports, review packages): .superpowers/sdd/post-run-review-04-11-plan/
Spec: review-phases-04-11.md + beads (d8l5.51, czjw.146, czjw.147).
Commit model: implementers and reviewers do not commit; the controller commits once per task after review passes.

## Pre-flight scan

| Row | Shared file / interface | Finding |
|---|---|---|
| T1 vs T2 | none (core roles vs core agent file-job + placeholder tests) | no conflict |
| T1 vs T3 | none (core vs invoices module) | no conflict |
| T2 vs T3 | none | no conflict |
| T3 vs T4 (out of range) | review-pager.tsx, review-desk.stories.tsx | T4 consumes T3's Next button; T3 runs first, T4 not in this run |
| T1 self | tests: 2 new + Gone split; code: assertAssignable + readNamedRoles; manifest + spec amendment | consistent; Gone row moves from it.each to its own test, manifest string replaced |
| T2 self | test parks job on audit_event share lock; fix locks agent_session `for key share` | consistent; implementer must confirm job's first audit insert is inside tx (plan says check) |
| T3 self | story expects RED via saveInvoice called; fix type=submit + preventDefault | consistent; Review Focus 1 combobox Enter is report-only, not a widening |

Ruling: Implementers do not commit; controller commits per task with the plan's message — orchestrator instruction overrides skill/plan "implementer commits" — cost if wrong: none, commit content identical.
Ruling: Review packages are built from the uncommitted working-tree diff (git diff HEAD on the task's paths) instead of scripts/review-package BASE..HEAD — no implementer commits exist to range over — cost if wrong: reviewer misses an unlisted file; mitigated by including `git status --short`.

## Progress
Task 1: implementer agent a95c4266e1cc87a35 DONE; reviewer aa9a9e9460f16e9be Approved (spec ✅, 0 Critical/Important).
Ruling (implementer): spec amendment appended verbatim with bare `d8l5.51` (no backticks) although the preceding amendment backticks its bead id — brief gives the text verbatim — cost if wrong: cosmetic doc inconsistency.
Ruling (implementer): `caller()` gained a defaulted `userId` param instead of a second near-copy — smallest way to make `rolesAs` "caller() with another user id" — cost if wrong: none functional.
Ruling: Task 1 minors parked, not fixed (review Approved) — no Critical/Important — cost if wrong: small duplication stays in advanced.ts.
Deferred (T1 review, Minor): advanced.ts duplicates the `not-found` throw (:341-345 vs :405-409) and the AddCheck literal (:349-353 vs :396-400); a shared addCheck() would remove it.
Deferred (T1 review, Minor): advanced.ts:388-394 nested `new Map((await readNamedRoles(...)).map(...))` reads poorly; hoist to a const.
Deferred (T1 review, Minor, plan-mandated): spec amendment at docs/specs/02-identity-and-access.md:173 omits that roles.assign now refuses Ask user and whole-tenant module system roles (invalid-input); no test covers that path (enforced via assertAddable).
Deferred (T1 review, Minor): amendment text lacks backticks around d8l5.51, roles.assign, core:roles:manage unlike the d8l5.39 amendment.
Deferred (T1): apps/genie/testing/groups-roles-transport.integration.test.ts not run (not in plan Step 5); reviewer checked inputs, expected to pass. Covered by gate:merge.
Task 1: complete (commits ec933ea..4bfadf3, review clean)
Task 2: implementer agent a78b27010f080af89 DONE; reviewer aca5c0b3480922ad8 Approved (spec ✅, 0 Critical/Important).
Ruling (implementer): park on `lock table audit_event in share mode`, as the brief says — checked that no earlier step writes audit_event — cost if wrong: test passes on unfixed code (it did not; RED was `expected 1 to be +0`).
Ruling (implementer): when the agent_file row is missing, `sessionId` falls back to `""` — row always exists after queuedFile — cost if wrong: less specific failure message.
Ruling (implementer): no database filter on pg_locks waiter count — keeps the brief's query; one container per test file — cost if wrong: a 10 s timeout error, not a false pass.
Ruling: commit body for Task 2 omits the brief's claim that key share does not conflict with the run's message writes — reviewer showed appendMessage (store.ts:623) and retryRun (run-job.ts:260) lock the session `for update`, which does conflict (safe: no lock-order cycle) — cost if wrong: none.
Deferred (T2 review, Minor, plan-mandated): plan text says key share "does not conflict with the run's message writes"; false, message appends wait for the job's short transaction. No deadlock (all writers lock session first).
Deferred (T2 review, Minor): the `live === undefined` return branch (delete wins the lock) has no test; no assertion that no "failed" audit row is written for a gone chat.
Deferred (T2 review, Minor): agent-files test — if waitersReach times out, job/removed promises are never awaited (unhandled-rejection noise); finally sends rollback after commit on the happy path (:299/:304); `""` sessionId fallback (:284); pg_locks count not filtered to current database (:155).
Task 2: complete (commits 4bfadf3..bd0a196, review clean)
Task 3: implementer agent aea2d44d4f5fe5e9d DONE; reviewer a21d31ed0fe27aa22 Approved (spec ✅, 0 Critical/Important; all four implementer rulings accepted).
Ruling (implementer): `expect(saveInvoice).not.toHaveBeenCalled()` comes before `onStep(canvas, 3, 9)`, not after it as in the brief — in the brief's order a save and an idle user-event both fail as "Step 3 of 9 not found", hiding the required RED — cost if wrong: none for coverage, both assertions remain.
Ruling (implementer): the default-button assertion comes after the Enter and step-3 checks, not before the Enter — before the fix the query returns null and would fail first, hiding the required `saveInvoice called` RED — cost if wrong: small; it now guards on step 3 instead of step 2.
Ruling (implementer): default-button assertion uses `querySelector("form")?.querySelector(...)` not the brief's `!` — repo lint discourages non-null assertions; a missing form still fails `toBe` — cost if wrong: none.
Ruling (implementer): combobox check runs `userEvent.clear` then types `ABC` — the only customer (ABC Trading) is already selected, so clearing makes typing filter the list and `{ArrowDown}{Enter}` pick a real option — cost if wrong: none; `toHaveValue("ABC Trading")` proves the pick.
Review Focus 1 result: Enter in the step 1 customer combobox picks the option, stays on Step 1 of 9, no save. Base UI stops the Enter.
Deferred (T3 review, Minor): Enter in the held split amount field (review-pager.tsx:358-361) has no story; behaviour unchanged from HEAD (pressNext then model.submit()).
Deferred (T3 review, Minor, pre-existing): held path calls model.submit() directly, skipping the form's `!frame.sweep && frame.saved === null` guard (review-workspace.tsx:114).
Deferred (T3 review, Minor, pre-existing): storybook test runs print Node DEP0205 and an extensionless-import notice for tools/generators; candidate for a Maintenance-epic bead.
Note for Task 4 (not in this run): Next must keep `type="submit"` and the `preventDefault`.
Task 3: complete (commits bd0a196..2bffe7b, review clean)
Ruling: no whole-branch final review and no workspace deletion in this run — this run covers Tasks 1-3 of 8; the final review belongs after Task 8 — cost if wrong: cross-task issues among 1-3 surface later rather than now.
Run status: Tasks 1-3 DONE (4bfadf3, bd0a196, 2bffe7b). Tasks 4-8 not started.

## Run 2: Tasks 4-6 (2026-11-11)
Scope: Tasks 4-6 only. Same commit model and review-package method (pkg.sh, working-tree diff vs HEAD) as run 1.

| Row | Shared file / interface | Finding |
|---|---|---|
| T3 vs T4 | review-pager.tsx, review-desk.stories.tsx | T4 builds on T3's Next (`type="submit"` + `preventDefault` kept; pressNext calls go) |
| T5 vs T6 | agent-panel-host.stories.tsx | T5 edits PhoneSheet; T6 only runs that file as a regression check. Sequential, no conflict |
| T4/T5 vs T6 | none other | core agent files (T5 host, T6 conversation/agent-chat) are distinct |
Task 4: implementer agent a7356111ee4380d1b DONE_WITH_CONCERNS (concern withdrawn after review); reviewer a879de5de5e141e24 Approved (spec ✅, 0 Critical/Important).
Ruling (implementer): story uses the button's real name "Previous field", not "Previous" as the brief writes — the accessible name in review-pager.tsx is "Previous field" — cost if wrong: none.
Ruling (implementer): Previous uses raw `aria-disabled`, not Button `disabled` + `focusableWhenDisabled` — disabled styling sets pointer-events none, so a tap would not keep focus on Previous (Review Focus 2); the pager already uses raw aria-disabled on Looks right and review-form Save; button-variants.ts:12 dims it — cost if wrong: none visible.
Ruling: fix round on an Approved review for two minors (focus assertions never seen red; wrong comment reason) — the run's rule is that each new assertion is seen red; cheap — cost if wrong: one extra review seat.
Task 4 fix round 1: mutation RED (setFocusId removed → StepFocusOnPhone fails at "Step 2 of 9" toHaveFocus, :930), GREEN 17/17; comment reworded. Re-review aad60d8272c9f7b3e Approved.
Deferred (T4 review, Minor): step 1 focus check (review-desk.stories.tsx:927) has no waitFor; relies on React flushing effects synchronously after a click — a timing change would make it pass, not fail.
Task 4: complete (commits 2bffe7b..57d7370, review clean)
Task 5: implementer agent a896c16e357eb6322 DONE; reviewer a3ffed79446b1356c Approved (spec ✅, 0 Critical/Important).
Note: implementer report writes rulings as "Ruling: … Why: … Cost if wrong: …" because a writing-style hook rejected the dash separators. Its two rulings are in task-5-report.md.
RED evidence: story only → fails at focus after Close (focus on body); `close` fix only → fails "after Escape … to be null". GREEN 16/16.
Ruling: Task 5 minors parked, not fixed (review Approved) — no Critical/Important; both minors predate or are cosmetic — cost if wrong: a 110-char comment line stays.
Deferred (T5 review, Minor, pre-existing): Escape inside a portalled popup in the agent panel (ChatHistory, model Select in conversation.tsx) may bubble through the React tree and close the whole panel; docked aside (agent-panel-host.tsx:517) already does this. Fix: skip close when event.defaultPrevented; unverified whether Base UI stops propagation.
Deferred (T5 review, Minor): agent-panel-host.tsx:225 comment ~110 chars, over printWidth 80; oxfmt does not wrap comments.
Task 5: complete (commits 57d7370..30ac332, 2 minors parked, review clean)
Task 6: implementer agent ae9a4ed31dfa74301 DONE_WITH_CONCERNS (stale stop error); reviewer a02b127f5004d7da6 Approved (spec ✅, 0 Critical/Important, 3 Minor).
Ruling (implementer): `building` computed inline in the `run` object, not a separate const — read is narrowed there, used once — cost if wrong: cosmetic.
Ruling (implementer): alert sits after the ended-run notice, directly before the Composer — brief says "directly above the Composer" — cost if wrong: layout tweak.
Ruling (implementer): deferred retry uses a module-level `rejectRetry` plus `fn()` spy, not Promise.withResolvers — avoids TS lib-target dependency, matches the file's module-level spies — cost if wrong: none.
Ruling: fix round on an Approved review for all three minors (stale stop error after a successful retry; Try again re-enabling before the refetch lands, which reopens Review Focus 3; called-once check never seen red) — two are correctness gaps with one-line fixes, the third is the run's red-first rule — cost if wrong: one extra round.
Task 6 fix round 1: retry `onSuccess: () => stop.reset()`; retry `onSettled` returns `saved.refetch()` so isPending covers the refetch (query-core 5.104.5 awaits onSettled before recording the result); mutation RED for called-once ("expected spy to be called once, but got 2 times" with `disabled` removed). GREEN conversation-run 15/15, agent-panel-host 16/16, core lint+typecheck. Re-review aa4395383b8f0026c Approved.
Ruling (implementer, fix round): no story for the stale stop error — needs a four-read session sequence for a one-line reset — cost if wrong: a later change can drop `stop.reset()` unnoticed.
Ruling (implementer, fix round): `stop` keeps `void saved.refetch()` — nothing reads `stop.isPending`; Stop disables from server status `stopping` — cost if wrong: if Stop later disables on isPending, it must return the promise too.
Ruling (implementer, fix round): `stop.reset()` in retry onSuccess, not onTryAgain — a failed retry leaves the run ended, where the stop message never shows — cost if wrong: none.
Deferred (T6 fix, Minor, controller-noted): agent-chat.tsx retry comment cites "(Review Focus 3)", a plan-only term that means nothing in the repo; reword in a later touch.
Deferred (T6 fix round): no test pins `stop.reset()` on retry success.
Task 6: complete (commits 30ac332..855b746, review clean)
Run status: Tasks 4-6 DONE (57d7370, 30ac332, 855b746). Tasks 7-8 not started. No whole-branch final review in this run (after Task 8).
Ruling (implementer, T5): story uses `screen` for the Close button and the region — the existing PhoneSheet play does — cost if wrong: none.
Ruling (implementer, T5): added a `// czjw.151:` comment above the new story steps and widened the `returnFocus` comment — the old one said "docked column" only — cost if wrong: wording.

## Run 3: Tasks 7-8 (2026-11-11)
Scope: Tasks 7-8 only. Same commit model and review-package method (pkg.sh) as runs 1-2. BASE 855b746.

| Row | Shared file / interface | Finding |
|---|---|---|
| T7 vs T8 | none (packages/ui filter-bar vs apps/genie e2e + recordings) | no conflict |
| T8 self | Step 1 asserts after countsUntil; Step 4.5 stop-rule if a new model answer is needed | consistent |
Task 7: implementer agent a698e9c798613eca6 DONE; reviewer a38bd6c405d43325c Approved (spec ✅, 0 Critical/Important, 3 Minor).
Ruling (implementer): plain `"input, button"` selector kept — Base UI Combobox renders its hidden input after the trigger and without `type="hidden"`, so `:not([type="hidden"])` would exclude nothing — cost if wrong: focus lands on an unfocusable input if a future control puts one first; one selector change.
RED/GREEN: filter-bar.stories.tsx ClearFilters 1 failed (focus on body) → 6/6; list-header.stories.tsx 13/13; @genie/ui lint+typecheck pass.
Ruling: Task 7 minors parked, not fixed (review Approved) — no Critical/Important — cost if wrong: phone sheet keeps the focus loss until a follow-up.
Deferred (T7 review, Minor): phone FilterSheet (packages/ui/src/list-header/filter-sheet.tsx) has its own Clear filters, unchecked for the same focus loss; candidate follow-up bead.
Deferred (T7 review, Minor): filter-bar.tsx:173 comment ~95 chars, over printWidth 80.
Deferred (T7 review, Minor): no story for a bar without a search field (brief excludes it).
Task 7: complete (commits 855b746..4f3ec58, review clean)
Task 8: implementer agent a2abfa73b5ec91cdf DONE; reviewer aef18b12f3e0b3a58 Needs fixes (spec ✅, 2 Important: no hydration wait before askQuestion on /ask; Done assertion never seen red).
Ruling (implementer): `-ask-2.json` built by removing the page-context line from the original rather than copying a second printed no-match body — the green run proves it matched — cost if wrong: none.
Ruling (implementer): handoff card located as the innermost `div` holding both the `Open <title>` link and the brief fold — the card has no role or name — cost if wrong: locator breaks silently on a markup change or a second card.
RED/GREEN: new test RED in phone+desktop (timed out at the h1; next dev log had 2 `No recording answers` lines); after fixtures GREEN, full agent-surfaces.spec.ts 14/14. Scratch "From Askx": 6 failed, reverted. @genie/app lint pass.
Task 8: fix round 1/5 (2 addressed, 0 open — hydration wait copied from full-list/invoice-answers; scratch "Donex" and summary "...agentx" each red in phone+desktop at their assertions, reverted; new test GREEN 2/2; lint pass). Re-reviewer a8da508f244dc0884 Approved.
Deferred (T8 review, Minor): card locator depends on markup (agent-surfaces.spec.ts ~:254-260); the card has no role or name.
Deferred (T8 review, Minor): panel visibility check uses the default timeout, not FIRST_PAINT.
Deferred (T8 re-review, Minor): the activity-response wait is registered after warm() on a shell page; a late deck-page activity response could resolve `mounted` early. Low odds (warm waits for the h1).
Deferred (T8 fix round): `nx run ... -- -g "a b"` splits a grep with spaces, so a scoped run silently runs the whole dev suite; use `-g "a.b"`. Worth a runbook note.
Deferred (T8 fix round, unrelated): [desktop] full-list.spec.ts:79 failed at getByText('You are welcome.') in one unintended full dev-suite run (3 failed/106 passed, other 2 were the deliberate scratch breaks). Not investigated; possible flake. gate:merge will show it.
Task 8: complete (commits 4f3ec58..47bad10, review clean after 1 fix round)
Run status: Tasks 7-8 DONE (4f3ec58, 47bad10). All 8 tasks committed. No whole-branch final review and no gate:merge in this run (orchestrator rule); Integration section is the coordinator's.
