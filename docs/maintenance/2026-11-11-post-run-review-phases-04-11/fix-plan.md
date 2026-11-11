# Post-run review 04-11 fixes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to carry out this plan one task at a time. Steps use checkbox (`- [ ]`) syntax for tracking. The owner chose subagent-driven execution. The workspace already exists: do not create a worktree, do not merge, do not push.

**Goal:** Fix the 9 in-scope Important findings of `review-phases-04-11.md`, and give each fix a test that fails on the defect.

**Architecture:** Each task is one small, self-contained fix in the package that owns the code, with its test in that package's existing test layer: a core or module integration test, a Storybook play test, or a Playwright spec. Tasks 3 and 4 edit the same file and run in that order. The authorization fix runs first.

**Tech Stack:** TypeScript strict, React 19, Base UI (`@genie/ui`), TanStack Query, drizzle-orm 0.45 on Postgres and oRPC. Tests use Vitest 4 with Testcontainers, the Storybook Vitest addon in browser mode, and Playwright.

**Spec:** `review-phases-04-11.md` (worktree root, read the Validation section) and each bead: `bd show genie-ops-center-v2-<id>`.

**Workspace:** `the task worktree`, branch `chore/review-phases-04-11`, based on develop `ec933ead`.

## Global Constraints

- Read `CLAUDE.md` and `AGENTS.md` before your first edit.
- DEC-39: authorization goes only through `can(user, permission, resource?)` and `scopesFor(user, permission)`. Do not add a permission check or a scope filter anywhere else.
- DEC-34: no code reads the database except through the `TenantContext`. Outside core, do not import `pg` or `drizzle-orm/node-postgres`.
- DEC-20: files go through `FileStorage`. Nothing outside the adapters touches `file_blob`. `store`/`remove` work in the caller's transaction, so a rollback keeps or removes both the row and the bytes.
- DEC-25: an e2e test that renders a screen runs in the phone project and the desktop project. A test that renders no screen carries `@no-screen`.
- Import direction: `ui` imports nothing internal, `core` imports `ui`, a module imports `core` and `ui`, and no module imports another module.
- Toolchain: format with oxfmt (`pnpm exec oxfmt --disable-nested-config <files>`), lint with oxlint, typecheck with `tsc`. Run all three through Nx: `pnpm nx run-many -t lint typecheck -p <project>`.
- Do not hand-roll a helper that the standard library, es-toolkit or an installed dependency already provides. Add no new dependency.
- Storybook MCP: the `genie-storybook` MCP server is **not running** in this session. Read the component source and its existing stories instead. In your report, say that you did this in place of the MCP lookup.
- Tests follow the `meaningful-tests` skill: few tests, and each one must fail on the defect. Every new test must be seen failing (red) before the fix and passing (green) after it.
- Commits: one per task, `type(scope): subject` under 72 characters, lowercase imperative. The body says why. Stage only that task's files, by path. Never stage `Working/` or `review-phases-04-11.md`.
- Writing rules for docs: never name a customer, and never refer to the previous codebase.

### How the test layers run (read once)

- **Core or module integration (Testcontainers, Docker is available).** Inner loop (exit 0 on a pass): `pnpm --filter <package> exec vitest run --config vitest.integration.config.ts <file>`. Through Nx: `pnpm nx run <project>:test:integration -- <file>`. The vitest cases of that file pass, but the runner then **exits 1** and prints `The mandatory integration manifest is violated:` with one `<other file>: was never collected.` line for each other manifest file. That exit is expected for a filtered run. Any other violation line is a real failure. The full unfiltered target runs in `gate:merge`.
- **Storybook play tests for one story file:** `pnpm nx run @genie/storybook:test-storybook -- <story-file-name>`. The wrapper `apps/storybook/testing/test-storybook.ts` runs `vitest run --project=storybook --passWithNoTests=false` and passes the extra arguments on, so the file name works as a path filter. Expected output: every story in that file passes, including its axe check (`a11y: { test: "error" }`).
- **Main e2e** (built image plus Keycloak, run by global setup): `pnpm nx run @genie/app:test:e2e -- people.spec.ts`. Nx builds `build-image` and `build-fixture-image` first, so the first run is slow.
- **Dev e2e:** `pnpm nx run @genie/app:test:e2e:dev -- agent-surfaces.spec.ts`. `e2e/dev/global-setup.ts` starts `deploy/stack/compose.dev-e2e.yaml` (Docker), seeds the database, starts its own `next dev` with the model stand-in (`GENIE_E2E_MODEL_RECORDINGS`) and a worker. No running dev stack is needed. Dev specs **do** run in CI: `@genie/app:test:integration` depends on `test:e2e:dev`, and `develop.yml` runs `nx run $PROJECT:test:integration`.

## Decisions for the owner

- **d8l5.51:** `roles.assign` calls the real `assertAddable` through `assertAssignable`. It now also refuses `Ask user` and whole-tenant module system roles (Grants rows), and it answers `not-found` for a role of an uncompiled module. The required test name and the Spec 2 R-37a amendment change with it. No screen, seed, generator or test relies on the old behavior, except that one required case.
- **2.1 (roles detail holder reads) stays as it is.** The fix needs a viewer flag from the page through `RolesScreen`, which changes the screen's props and stories. After Task 1, no path can create a scoped `core:roles:manage`, because module roles carry only module keys. A scoped row written before Task 1 still gets the error.
- **czjw.146:** the lock is on the `agent_session` row (`for key share`), not on `agent_file`. The reason is in Task 2.
- **czjw.147:** Next becomes the form's default button. No new prop or ref is added.
- **Dev e2e runs in CI:** `@genie/app:test:integration` depends on `test:e2e:dev`, so `dev/add-person-access.spec.ts` already runs in `gate:merge`. Controller ruling (2026-11-11): Task 9 (d8l5.52) is dropped and the bead is closed as invalid.
- **czjw.148:** focus moves to the step counter ("Step N of M", `tabIndex={-1}`), not to a heading. The pager has no step heading.
- **czjw.153:** two new strings a person reads: "The work could not be stopped. Try again." and "The work could not start again. Try again.".
- **Test commands:** the integration inner loop is `pnpm --filter <package> exec vitest`, not Nx. A filtered Nx `test:integration` run always exits 1 on the manifest guard. The Nx commands are still given, with their expected output.
- **Found and not acted on:** `roles.update`, `create`, `copy`, `remove` and `unassign` sit behind the same any-scope gate and do not call `assertManagesAllRoles`. After Task 1, only scoped rows written before it can reach them. `roles.assign` also does not refuse an erased or break-glass recipient, as `saveAdvanced` does.
- **Models:** every task is Opus. Each task needs focus management, form semantics, authorization, transactions or e2e fixtures.

## Review Focus

1. Enter inside a combobox on a pager step (the step 1 customer picker) must pick the option. It must not move the step and must not save. Task 3 adds this check to its story.
2. Previous pressed on step 1 (`aria-disabled`) must do nothing: the step stays the same and focus stays on Previous. Task 4 adds this check to its story.
3. Try again pressed twice quickly must send one retry, not two. Task 6's story asserts one call while the retry is pending.
4. Clear filters reached by keyboard (Tab to it, then Enter) is the WCAG 2.4.3 case. Task 7's story uses the keyboard, not a mouse click.
5. A person who goes back to the Ask chat after the handoff must see the card with the run's end state, not "Handing over..." forever. Task 8's new test opens `/ask/<id>` again and asserts `Done`.

---

### Task 1: `roles.assign` takes the Advanced access rule (d8l5.51)

**Implementer model:** opus (an authorization change, an error-code change in a required test, and a spec amendment).

**Files:**
- Modify: `packages/core/src/services/roles/advanced.ts` (export a new `assertAssignable`. Pull the role-name `select` of `saveAdvanced` into a shared `readNamedRoles` so the SQL lives in one place.)
- Modify: `packages/core/src/services/roles/router.ts` (`assign` handler)
- Modify: `packages/core/testing/role-writers.integration.test.ts`
- Modify: `packages/core/testing/required-tests-guard.ts` (the `role-writers` entry)
- Modify: `docs/specs/02-identity-and-access.md:173` (the d8l5.39 amendment line)

**Interfaces:**
- Produces: `export async function assertAssignable(input: { readonly tenant: TenantContext; readonly caller: RequestPrincipal; readonly modules: readonly RolesModule[]; readonly roleId: string; readonly scope: Scope | null }): Promise<void>`. In order, it does the following:
  1. `assertManagesAllRoles(caller)` (`forbidden`).
  2. Reads the role. A missing role answers `not-found`.
  3. Builds an `AddCheck` from `entitlementByModule`.
  4. Calls the existing private `assertAddable`.

**Callers checked (none needs the looser rule):**
- Screens: none call `roles.assign`. Seeds and generators: none.
- `groups-roles.integration.test.ts` (4 calls) and `apps/genie/testing/groups-roles-transport.integration.test.ts` assign a whole-tenant custom core role made by `insertRole`. Both still pass.
- `role-writers.integration.test.ts`: the `roles.assign` / `Off user` case still answers `module-disabled`, because `assertModuleScope` checks the entitlement before it checks for a scope. The `roles.assign` / `Gone user` case now answers **`not-found`**, because the module is not compiled. This step changes that case.
- After the change, `roles.assign` also refuses `Ask user` and a whole-tenant module system role with `invalid-input`. Those are Grants rows, and no caller sends them.

- [ ] **Step 1: Write the failing tests** in `role-writers.integration.test.ts`. Add a helper `rolesAs(userId)` that is `caller()` with another user id. Then add:

```ts
describe("roles.assign takes the Advanced access rule (d8l5.51)", () => {
  it("refuses a caller who holds core:roles:manage at one scope only, and writes nothing", async () => {
    const { userId } = await insertPersonWith(deployment.context, ["core:roles:manage"],
      { type: "on-record", id: randomUUID() });
    await expect(rolesAs(userId).assign({ roleId: roleId(TENANT_ADMINISTRATOR_ROLE),
      principalType: "user", principalId: userId })).rejects.toMatchObject({ code: "forbidden" });
    expect(await roleNamesOf(userId)).not.toContain(TENANT_ADMINISTRATOR_ROLE);
  });

  it("refuses a core role with a scope, and writes nothing", async () => {
    const custom = await insertRole(deployment.context, { permissions: ["core:roles:manage"] });
    const person = await insertUser(deployment.context);
    await expect(roles().assign({ roleId: custom, principalType: "user", principalId: person,
      scope: { scopeType: "on-record", scopeId: randomUUID() } })).rejects.toMatchObject({ code: "invalid-input" });
    expect(await assignmentCount(custom)).toBe(0);
  });
});
```

  Split the `it.each` table. Keep three rows under `module-disabled`. Add one test: `roles.assign refuses Gone user with not-found and writes no assignment`.

  An existing test already proves that a normal assign works. It is `groups-roles.integration.test.ts` › "grants to a person, emits core:role:granted and writes an in-app notification", and it calls `rolesCaller(...).assign`. Do not add a duplicate.

- [ ] **Step 2: Run the file and see it fail.** Run `pnpm --filter @genie/core exec vitest run --config vitest.integration.config.ts testing/role-writers.integration.test.ts`. Expected: the two new tests FAIL (the call resolves), and the Gone `not-found` test FAILS (it gets `module-disabled`).
- [ ] **Step 3: Implement.** Add `assertAssignable` to `advanced.ts`. In `router.ts`, make the `assign` handler call `await assertAssignable({ tenant, caller, modules, roleId: input.roleId, scope })` before `assignRole`. Compute `scope` once and pass the same value to both calls.
- [ ] **Step 4: Update the manifest and the spec.**
  - In `required-tests-guard.ts`, replace the Gone `roles.assign` case string with the new test name. Add the two new names under a `roles.assign takes the Advanced access rule (d8l5.51)` prefix. Extend the entry's `reason` with "roles.assign refuses a caller who does not manage all roles and a scope Advanced access does not take (d8l5.51)".
  - In `docs/specs/02-identity-and-access.md:173`, append: `Amended 2026-11-11 (d8l5.51): roles.assign first applies the Advanced access rule, so a scoped core:roles:manage holder is refused with forbidden, a core role with a scope with invalid-input, and a role of a module the image does not compile with not-found.`
- [ ] **Step 5: Verify.**
  - Run the Step 2 command, then the same command for `testing/groups-roles.integration.test.ts`. Expected: both exit 0.
  - Run `pnpm nx run @genie/core:test:integration -- testing/role-writers.integration.test.ts`. Expected: every case of the file passes, and the only violations are `was never collected` lines.
  - Run `pnpm nx run-many -t lint typecheck -p @genie/core`. Expected: pass.
- [ ] **Step 6: Commit** with `fix(core): apply the advanced access rule to roles.assign`. Body: the raw endpoint let a scoped Roles manager make itself Tenant administrator (d8l5.51).

---

### Task 2: the file job leaves no orphan file when the chat is deleted (czjw.146)

**Implementer model:** opus (transactions, row locks, and a concurrency test).

**Files:**
- Modify: `packages/core/src/services/agent/file-job.ts:181-206` (the job's `withTransaction`)
- Test: `packages/modules/placeholder/testing/agent-files.integration.test.ts`
- Modify: `packages/modules/placeholder/testing/required-tests-guard.ts` (add the new case to the `agent-files` entry)

**Why a lock on the session row and not on `agent_file`:** `deleteOwnSession` (`store.ts:270-291`) locks the session with `for update`. It then reads the file ids of the chat and removes those files, and only after that deletes the session, which cascades to `agent_file`. With a lock on the `agent_file` row only, the delete still reads `file_id = null` before its cascade blocks. The job then commits, and the cascade removes the `agent_file` row and leaves the `file` row behind. Locking the session row closes this:
- If the job holds the lock first, the delete waits. After the job commits, the delete sees the new `file_id` and removes the file.
- If the delete holds the lock first, the job's lock returns no row after the delete commits, and the job stores nothing.

Use `for("key share")`. It conflicts with the delete's `for update`, but not with a rename (`for no key update`) or with the run's message writes.

- [ ] **Step 1: Write the failing test** `"stores no file when the chat is deleted while the file is made"`. Run the real delete through `callProcedure(createAgentRouter(), contextFor(person)).remove({ id: sessionId })`. Both names are exported from `@genie/core`.
  1. `person = await fullReader()`, `csv = await queuedFile(...)`. Read `sessionId` from `select session_id from agent_file where id = $1`.
  2. Park the job inside its transaction. Take a second pool client: `begin; lock table audit_event in share mode`. The job's first `audit_event` insert is the audit row inside its transaction. `queryDataset` and `FileStorage.store` write no audit row. Check that while you write the test.
  3. `const job = runJob(person, csv)`. Wait until `select count(distinct pid) from pg_locks where not granted` is 1.
  4. `const removed = callProcedure(...).remove({ id: sessionId })`. Wait until the count is 2.
  5. `commit` and release the blocker. `await Promise.all([job, removed])`.
  6. Assert `select count(*)::int from file where uploaded_by_user_id = $1` (the person) is `0`.

  Without the fix, the delete reads `file_id = null`, waits only at its cascade, and the `file` row stays, so the count is 1.

- [ ] **Step 2: Run the test and see it fail.** Run `pnpm --filter @genie/module-placeholder exec vitest run --config vitest.integration.config.ts testing/agent-files.integration.test.ts`. Expected: the new test FAILS with `expected 1 to be 0`.
- [ ] **Step 3: Implement.** Make the first statement inside the job's `withTransaction` this:

  `const [live] = await tx.select({ id: agentSession.id }).from(agentSession).where(eq(agentSession.id, found.sessionId)).for("key share");`

  Then add `if (live === undefined) return;`. Return, do not throw. A throw reaches the catch block and write a "failed" audit row for a chat that is gone. Add a one-line comment that names the race.
- [ ] **Step 4: Verify.**
  - Run the Step 2 command. Expected: exit 0, all cases of the file pass.
  - Run `pnpm nx run @genie/module-placeholder:test:integration -- testing/agent-files.integration.test.ts`. Expected: only `was never collected` violations.
  - Run `pnpm nx run-many -t lint typecheck -p @genie/core @genie/module-placeholder`. Expected: pass.
- [ ] **Step 5: Commit** with `fix(core): lock the chat while its file is stored`. Body: a chat deleted while its export was made left an orphan file (czjw.146). Explain why the lock is on the session row.

---

### Task 3: Enter on a pager step goes to the next step (czjw.147)

**Implementer model:** opus (form semantics: implicit submission and the default button).

**Files:**
- Modify: `packages/modules/invoices/src/presentation/review-pager.tsx:590-600` (the Next `Button`)
- Test: `packages/modules/invoices/src/presentation/review-desk.stories.tsx` (pager stories, `phone390`)

**Approach:** make Next the form's default button. Give it `type="submit"` and `onClick={(event) => { event.preventDefault(); pressNext(); }}`.
- HTML implicit submission fires a click at the first submit button of the form. A click whose default is prevented does not submit. So Enter (the Go key on a phone) in a step's field presses Next and never calls `model.submit()`.
- `@genie/ui` `Button` (Base UI) defaults to `type="button"`, and the step content has no raw `<button>`. Next is therefore the first submit button.
- On the summary step `ReviewSaveBar` renders instead, so Enter still saves there.
- `review-workspace.tsx` does not change. Add a one-line comment on the button.

- [ ] **Step 1: Write the failing story** `EnterOnAStepOnPhone` (`globals: phone390`, `beforeEach: () => serve(invoiceReview)`). Clear the due-date blocker the way `SavedOnPhone` does, so that a submit really saves:

```ts
await onStep(canvas, 1, 9);
await pickField(canvas, "Due date");
await onStep(canvas, 7, 9);
await userEvent.click(canvas.getByRole("radio", { name: "Mark as unspecified" }));
await pickField(canvas, "Invoice number");
await onStep(canvas, 2, 9);
await userEvent.type(canvas.getByLabelText("Invoice number"), "{Enter}");
await onStep(canvas, 3, 9);
await expect(saveInvoice).not.toHaveBeenCalled();
```

  Before the Enter, assert that Next is the form's default button: `canvasElement.querySelector("form")!.querySelector('button[type="submit"], button:not([type]), input[type="submit"]')` is the `Looks right` button. A browser and user-event both click that first submit button on Enter. The step card labels its control through `FieldLabel htmlFor={item.controlId}` (`review-card.tsx:26`), so `getByLabelText("Invoice number")` finds the input.

  Review Focus 1: step 1 holds the customer `ComboboxInput` (`aria-label="Customer"`, `customer-field.tsx:118`). In the same story, go back with `pickField(canvas, "Customer")`. Type a few letters, choose with `{ArrowDown}{Enter}`, and assert `Step 1 of 9` is still shown and `saveInvoice` was not called. If Base UI does not stop that Enter, report it. Do not widen this task to fix it.

- [ ] **Step 2: Run the story and see it fail.** Run `pnpm nx run @genie/storybook:test-storybook -- review-desk.stories.tsx`. Expected: `EnterOnAStepOnPhone` FAILS with `saveInvoice` called. user-event submits a form that has no submit button and exactly one text input, so the step-2 card triggers the save. Accept only that failure. `Step 3 of 9` never shown alone can also mean that user-event did nothing.
- [ ] **Step 3: Implement** the Next button change.
- [ ] **Step 4: Verify.**
  - Run the Step 2 command. Expected: every story in the file passes. `InvoiceOnPhone`, `PaymentSplitOnPhone` and the held-split path still pass.
  - Run `pnpm nx run-many -t lint typecheck -p @genie/module-invoices`. Expected: pass.
- [ ] **Step 5: Commit** with `fix(invoices): make enter on a pager step go to the next step`.

---

### Task 4: the pager keeps focus on a step change and keeps Previous (czjw.148)

**Implementer model:** opus (focus management).

**Files:**
- Modify: `packages/modules/invoices/src/presentation/review-pager.tsx` (the step counter `<p>` near `:563`, `go`, and the Previous button near `:585`)
- Test: `packages/modules/invoices/src/presentation/review-desk.stories.tsx`

**Interfaces:**
- Consumes: Task 3's Next button. `pressNext` calls `go`.

**Approach:** use the pager's existing `focusId` mechanism (`useEffect` on `[focusId, at]`).
- The step counter `<p>` gets `id={counterId}` (from `useId()`) and `tabIndex={-1}`.
- `go(to)` also calls `setFocusId(counterId)`. Focus then lands on "Step N of M", and a screen reader reads it.
- `pick` (All fields) does not change: the sheet gives focus back to its trigger.
- The `revealRef` path keeps its own control focus.
- Previous is always rendered. It gets `aria-disabled={index === 0 ? true : undefined}` and `onClick={() => { if (index > 0) go(index - 1); }}`. This follows the precedent of `present-mode.stories.tsx`.

- [ ] **Step 1: Write the failing story** `StepFocusOnPhone` (`phone390`, `serve(invoiceReview)`):
  1. Run `onStep(1, 9)`. Assert Previous has `aria-disabled="true"`.
  2. Review Focus 2: click Previous, then assert `Step 1 of 9` is shown and Previous has focus.
  3. Run `next(canvas, "Looks right")`. Inside `waitFor`, assert `canvas.getByText("Step 2 of 9")` has focus.
  4. Click Previous. Inside `waitFor`, assert `Step 1 of 9` has focus, and assert Previous is still in the document.
- [ ] **Step 2: Run the story and see it fail.** Run `pnpm nx run @genie/storybook:test-storybook -- review-desk.stories.tsx`. Expected: `StepFocusOnPhone` FAILS, because there is no Previous on step 1.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.** Run the same command. Expected: the whole file passes, including axe on the focusable counter. Then run `pnpm nx run-many -t lint typecheck -p @genie/module-invoices`. Expected: pass.
- [ ] **Step 5: Commit** with `fix(invoices): move focus to the step on a pager step change`.

---

### Task 5: the phone bottom agent panel closes on Escape and gives focus back (czjw.151)

**Implementer model:** opus (focus management, and a story whose Escape ordering was fragile in three recent commits).

**Files:**
- Modify: `packages/core/src/features/agent/agent-panel-host.tsx:249-252` (`close`) and `:497-506` (the bottom `aside`)
- Test: `packages/core/src/features/agent/agent-panel-host.stories.tsx` (`PhoneSheet`)

- [ ] **Step 1: Extend `PhoneSheet`.** Mirror the sequence of `app-shell.stories.tsx` › `OpensAndClosesTheAgentPanel` (commits `450a685f`, `b4234adf`, `983184a8`). At the end of the current play:
  1. `const agent = canvas.getByRole("button", { name: "Agent" })`.
  2. Click `Close the agent panel`. Assert `waitFor(() => expect(screen.queryByRole("region", { name: "Placeholder agent" }), "after Close").toBeNull())`, then that `agent` has focus.
  3. Click `agent`. Find `New chat` inside the region and click it. Assert `New chat` has focus.
  4. Press `{Escape}`. Assert the region is null (`"after Escape"`) and `agent` has focus.
- [ ] **Step 2: Run the story and see it fail.** Run `pnpm nx run @genie/storybook:test-storybook -- agent-panel-host.stories.tsx`. Expected: `PhoneSheet` FAILS at the focus check after Close.
- [ ] **Step 3: Implement.** In `close`, set `returnFocus.current = docked || bottom;`. On the bottom `aside`, add the same `onKeyDown` as the docked one: `if (event.key === "Escape") close();`.
- [ ] **Step 4: Verify.** Run the same command. Expected: the whole file passes. Then run `pnpm nx run-many -t lint typecheck -p @genie/core`. Expected: pass.
- [ ] **Step 5: Commit** with `fix(core): close the phone agent panel on escape and refocus agent`.

---

### Task 6: stop and retry failures are shown, and Try again waits (czjw.153)

**Implementer model:** opus (mutation state, and the copy a person reads).

**Files:**
- Modify: `packages/core/src/features/agent/conversation.tsx` (`ConversationRun`, the dock near `:451-468`)
- Modify: `packages/core/src/features/agent/agent-chat.tsx:91-98, 178-185`
- Test: `packages/core/src/features/agent/conversation-run.stories.tsx`

**Interfaces:**
- Produces: two new fields on `ConversationRun`: `readonly failure: string | undefined` and `readonly retrying: boolean`.

**Approach:**
- `AgentChat` computes `building` from `read.session.run` (`building` or `stopping`).
- It sets `failure` as follows:
  - While the run is building: `"The work could not be stopped. Try again."` if `stop.isError`.
  - After the run ended: `"The work could not start again. Try again."` if `retry.isError`.
  - Otherwise `undefined`.
- It sets `retrying: retry.isPending`.
- `Conversation` renders `failure` as `<p role="alert" className="text-sm text-destructive">` directly above the `Composer`. Try again gets `disabled={run.retrying}`.
- In the story file, `RunChat` passes `failure: undefined, retrying: false`.

- [ ] **Step 1: Write the failing stories.** Both render `AgentChat` inside `AgentClientStub`, as `PolledChat` does.
  - `StopFails`: `session` always answers `handoffDetail("building", [BRIEF_MESSAGE, PARTIAL_ANSWER])`, and `stop` rejects. Click `Stop building`. Assert `findByRole("alert")` has the text `"The work could not be stopped. Try again."`.
  - `TryAgainFails`: `session` answers `handoffDetail("failed", [BRIEF_MESSAGE, PARTIAL_ANSWER])`, and `retry` returns a deferred promise.
    1. Click `Try again`. Assert the button is disabled.
    2. Review Focus 3: click it again. Assert `retry` was called once. `buttonVariants` has no `disabled:pointer-events-none`, so `userEvent.click` on the disabled button does not throw.
    3. Reject the deferred promise. Assert the alert shows `"The work could not start again. Try again."` and the button is enabled.
- [ ] **Step 2: Run the stories and see them fail.** Run `pnpm nx run @genie/storybook:test-storybook -- conversation-run.stories.tsx`. Expected: both FAIL. No alert appears, and Try again stays enabled.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.**
  - Run the same command. Expected: the file passes.
  - Run `pnpm nx run @genie/storybook:test-storybook -- agent-panel-host.stories.tsx`. Expected: pass. This proves no other `ConversationRun` caller broke.
  - Run `pnpm nx run-many -t lint typecheck -p @genie/core`. Expected: pass. `tsc` finds every `run={...}` caller.
- [ ] **Step 5: Commit** with `fix(core): show stop and retry failures in the agent chat`.

---

### Task 7: Clear filters moves focus to the first bar control (6wz1.98)

**Implementer model:** opus (focus management, WCAG 2.4.3).

**Files:**
- Modify: `packages/ui/src/list-header/filter-bar.tsx:166-170`
- Test: `packages/ui/src/list-header/filter-bar.stories.tsx` (`ClearFilters`)

**Approach:** `onClick={() => { state.clear(); bar.current?.querySelector<HTMLElement>("input, button")?.focus(); }}`. The bar's controls come before Clear filters, so the first match is the search input when the definition has a search. A bar with no search is not proven by this task. Before you keep the plain selector, read how the `Combobox` of `filter-controls.tsx` renders. If it puts a hidden `<input>` before its trigger, exclude hidden inputs in the selector (`input:not([type="hidden"])`).

- [ ] **Step 1: Change the story.** In `ClearFilters`, replace `userEvent.click(clear)` with Review Focus 4: `clear.focus(); await userEvent.keyboard("{Enter}");`. After the existing `clearButton()` null check, add `await expect(canvas.getByLabelText("Search invoices")).toHaveFocus();`.
- [ ] **Step 2: Run the story and see it fail.** Run `pnpm nx run @genie/storybook:test-storybook -- filter-bar.stories.tsx`. Expected: `ClearFilters` FAILS. Focus is on `body`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.**
  - Run the same command, then `pnpm nx run @genie/storybook:test-storybook -- list-header.stories.tsx`. Expected: both pass.
  - Run `pnpm nx run-many -t lint typecheck -p @genie/ui`. Expected: pass.
- [ ] **Step 5: Commit** with `fix(ui): keep focus in the filter bar after clear filters`.

---

### Task 8: handoff e2e checks "From Ask" and starts once from the Ask screen (czjw.152)

**Implementer model:** opus (an e2e test and model recording fixtures).

**Files:**
- Modify: `apps/genie/e2e/dev/agent-surfaces.spec.ts`
- Create: `apps/genie/testing/model-recordings/synthetic-slides-handoff-ask-1.json` and `synthetic-slides-handoff-ask-2.json`

**How the fixtures are keyed:**
- `replayModelTransport` (`packages/core/testing/model-transports.ts:241-315`) answers the recording whose method, URL and whole parsed body match. UUIDs and 64-character hashes may be renamed one-to-one.
- `synthetic-slides-handoff-1.json` (the first turn) and `-2.json` (the turn after the `hand-over` tool result) were captured beside the Slides list. Their system prompt holds the line `The person is on the Slides page.`, which `pageContextLine` adds from the panel's page context. The Ask screen sends no page context, so that line is missing and nothing matches.
- The responses are synthetic (hand-written), so no live model is needed.
- The build fixtures (`synthetic-slides-build-*`) belong to the Slides surface session and are expected to stay the same. The test run proves it.

- [ ] **Step 1: Add "From Ask" to both handoff tests.** In "Ask hands a deck over…" and "Ask hands a dashboard over…", add `await expect(surface.getByText("From Ask", { exact: true })).toBeVisible(FIRST_PAINT);` **after** `countsUntil(...)`. An await placed before `countsUntil` can use up the time in which the test must see a partial count.
- [ ] **Step 2: Write the new test** `"the Ask screen hands a deck over: the deck opens with its panel, and Ask shows the card"`. It uses the same `withDeploymentLock(LEDGER_LOCK, …)`, `removeOwnDecks(SLIDES_PEOPLE.chat)` in try/finally, and `test.setTimeout`.
  1. Run `signInAs(page, SLIDES_PEOPLE.chat)`, `resetChangeDeck(SLIDES_PEOPLE.chat)` and `warm(page, /m/slides/decks/${SLIDES_CHANGE_DECK_ID}, …)`.
  2. Send `SLIDES_CHAT_MESSAGE` from `/ask`. Use the Ask-screen helper `askQuestion(page, text)` from `ask-support.ts`. Read it first, because it answers the session id. Otherwise use `send(page, page.getByRole("main"), …)`.
  3. Assert the h1 is `MONTHLY_DECK.title`. Assert `page.getByRole("region", { name: "Slides agent" })` is visible, which proves `AskRoute.onHandoff` opened the panel on arrival. Assert `From Ask`.
  4. Wait for the `Saved` chip, so the next test finds no live run.
  5. `page.goto(/ask/${askId})`. Find the card as the element that holds the link `Open ${MONTHLY_DECK.title}`. Inside that card, assert the status `Done` (Review Focus 5) and the summary `What Ask passed to the Slides agent`.
- [ ] **Step 3: Run the test and see it fail.** Run `pnpm nx run @genie/app:test:e2e:dev -- agent-surfaces.spec.ts -g "Ask screen"`. Expected: FAIL. The server log of the run's `next dev` (see `global-setup.ts` for where it writes) shows `No recording answers … The sent body was {…}`.
- [ ] **Step 4: Create the two fixtures.**
  1. Copy `synthetic-slides-handoff-1.json` and `-2.json` to `-ask-1.json` and `-ask-2.json`. Set `name` to match the file name.
  2. In `request.body`, replace each body with the body the no-match error printed for that turn. That is expected to equal the original without the `The person is on the Slides page.` line. Keep `response` unchanged.
  3. Repeat Steps 3 and 4 until the handoff turns match.
  4. If a `synthetic-slides-build-*` request also fails to match, add a matching `-ask` copy the same way.
  5. If a mismatch needs a new model answer, not just a request copy, stop. Commit only Step 1, and report the follow-up line `czjw.152: the /ask handoff e2e needs an owner model recording for <request>`.
- [ ] **Step 5: Verify.** Run `pnpm nx run @genie/app:test:e2e:dev -- agent-surfaces.spec.ts`. Expected: every test passes in both the phone and desktop projects. Then run `pnpm nx run @genie/app:lint`. Expected: pass.
- [ ] **Step 6: Commit** with `test(app): drive the ask handoff from the ask screen in e2e`. Stage the spec and the new recordings only.

---

## Integration

Do not run this during the plan. The coordinator runs it after Task 8.

- `mkdir -p Working/logs && nohup pnpm gate:merge > Working/logs/gate-merge-post-run-04-11.log 2>&1 &`, then read the log when it ends.
- Beads to close after a green gate:
  - `genie-ops-center-v2-d8l5.51`
  - `genie-ops-center-v2-czjw.146`
  - `genie-ops-center-v2-czjw.147`
  - `genie-ops-center-v2-czjw.148`
  - `genie-ops-center-v2-czjw.151`
  - `genie-ops-center-v2-czjw.152`
  - `genie-ops-center-v2-czjw.153`
  - `genie-ops-center-v2-6wz1.98`
