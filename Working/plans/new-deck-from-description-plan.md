# New deck from a description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Execution method: subagent-driven. Bead: `genie-ops-center-v2-czjw.174`. Ticket: `docs/tickets/spec-7/48-new-deck-from-description/index.md` (draft for owner approval). The workspace exists already: use no new worktree, no `superpowers:using-git-worktrees`, no push and no merge, and skip the branch-finishing step.

**Goal:** New deck on the Slides list takes a description, creates the deck at once, and the Slides agent names the deck and drafts its slides on the deck page while the person watches.

**Architecture:** The flow is the S7-41 handoff transaction without Ask. One new core procedure, `agent.start`, makes the record through the surface's existing `createRecord`, a surface session whose first message holds the description, and a durable run through `startRun`, in one transaction. The deck page follows the run with its own read of the record's sessions, and the existing agent panel shows the chat, the steps and Stop. No module contract point is added, no stored data changes, and no surface instruction or tool schema changes, so no model recording is re-keyed.

**Tech Stack:** Next.js, oRPC, Drizzle, pg-boss (durable run of S7-40), TanStack Query and Form, zustand panel store, Storybook with Vitest browser tests, Playwright.

**Spec:** the design is `/home/kenan/work/genie-ops-center-v2/Working/prototypes/new-deck-flow.prototype.html`, imported as `docs/design/prototypes/new-deck-flow.prototype.html`. Requirements: Spec 7 R-42, R-42b, R-46, R-52, R-53 (`docs/specs/07-invoice-and-payments.md`), `DEC-29` with its amendments of 2026-11-01 and 2026-11-07, `docs/architecture/agent.md` "Surfaces and the handoff", `docs/modules/slides/README.md`. Gate: do not start Task 1 before the owner rules on OQ-1 (R-46), because Tasks 1 and 2 build option (a). Read the other open questions before Task 4.

## Global Constraints

- Read `CLAUDE.md`, `AGENTS.md` and `docs/architecture/ui-development.md` first. For UI: documented stories first, then failing behavior tests, then code.
- Storybook MCP (`genie-storybook` in `.mcp.json`): query `docs-list` and `docs-show` before you use a component, call `get-storybook-story-instructions` before you write a story, and run `test-run` on every story you touched. If the server does not answer, start Storybook with `nx run @genie/storybook:storybook`.
- Core imports no module and names no module. Core text says "record", never "deck" (Spec 7 R-41, owner 2026-11-03).
- Authorization goes through `can()` only. The `agent` area is behind `core:ask:use` and refuses the break-glass account (`packages/core/src/services/agent/router.ts`).
- The deck title is 1 to 80 characters after trim (`deckTitle` in `packages/modules/slides/src/contract.ts`). The description is 1 to 4,000 characters after trim (`AGENT_LIMITS.messageCharacters`).
- Exact copy from the design: label `What is the deck about?`; placeholder `For example: a five-slide update on this month's collections for the finance team`; help `The agent names the deck and drafts the slides from your records. You can rename it and change any slide after.`; hint `Enter creates. Shift and Enter start a new line.`; buttons `Cancel` and `Create deck`; chips are `CHAT_SUGGESTIONS` of `deck-list.tsx`.
- Do not change `SLIDES_SURFACE_INSTRUCTIONS`, any tool description or any tool input schema. Each change re-keys the Slides recordings, which only the owner refreshes (`packages/core/testing/README.md`).
- No gate test calls a live model. New model fixtures are synthetic, named `synthetic-new-deck-<n>.json`, and say so in the test file that uses them.
- Every end-to-end test that renders a screen runs at the phone and the desktop project (`DEC-25`).
- `DESIGN.md`: a status pill is a tinted background with semibold small text, gray for a draft state; a skeleton block matches the shape it replaces and animates only when motion is allowed; a spinner has `role="status"` and a hidden label; a loading button keeps its label and width, sets `aria-busy="true"`, and ignores a second press.
- Tech plan wave 5, "How pages follow a run": TanStack Query reads the run every second while it is set, and the deck query refetches on the same tick.
- Each implementer and reviewer prompt forbids pushes, merges, new worktrees and subagent dispatch. Implementers and reviewers do not commit. The orchestrator commits once per task after its reviews pass, with a `feat(...)`, `test(...)` or `docs(...)` subject.
- A failed check uses `superpowers:systematic-debugging`. Tests follow the `meaningful-tests` skill: each test names the bug it catches.
- Advisor: when an implementer reports BLOCKED, or a second fix round fails, consult once with `Working/ask-advisor.sh "<question>"` (absolute path in every implementer prompt), follow the advice for one more attempt, then report BLOCKED. The playbook that runs this plan ships that script; it does not exist in this worktree yet.

## Review Focus

1. A start that is refused (a run already builds for this person, AI turned off after the page loaded, a surface the person may not write) must save no deck and no session. Task 1 pins each refusal with a row count.
2. Two quick Enter presses or a double click must create one deck. Task 3 pins it in a play function.
3. A reload or a return to the deck page during the build must still show the drafting state and Stop, also when the panel never opened. Task 2 reads the run without the panel, and Task 6 walks away and back.
4. A hand edit during the build moves the content hash, and the agent's next change is then refused. Task 4 disables hand edits while the run builds and pins it in a story.
5. The page must not show the loading title for ever when the run ends without a rename (Stop, failure, interruption). Task 4 pins `isUnnamed` on every end state.

---

## File map

| File | Change | Task |
| --- | --- | --- |
| `packages/core/src/services/agent/start-record.ts` | Create: `startRecordRun`, `startText`, `START_PART` | 1 |
| `packages/core/src/services/agent/contract.ts`, `router.ts` | Modify: the `start` procedure | 1 |
| `packages/core/src/services/agent/store.ts` | Modify: `insertHandedSession` takes `handedFromSessionId: string \| null`; `AgentSessionSummary` gains `run: AgentRunStatus \| null` | 1 |
| `packages/core/src/services/agent/chat.ts` | Modify: use the shared `chatTitleFrom` | 1 |
| `packages/core/testing/agent-start.integration.test.ts` | Create | 1 |
| `packages/core/src/features/agent/record-run.ts` | Create: `recordRunOf`, `useRecordRun`, `useStartRecordRun` | 2 |
| `packages/core/src/features/agent/agent-panel-store.ts`, `agent-panel-host.tsx`, `panel.ts` | Modify: `navigate` in the store, exports | 2 |
| `packages/core/src/features/agent/conversation.tsx` | Modify: draw a `data-start` message as the person's bubble | 2 |
| `packages/modules/slides/src/presentation/new-deck-composer.tsx` (+ stories) | Create | 3 |
| `packages/modules/slides/src/presentation/deck-list.tsx` (+ stories) | Modify | 3 |
| `packages/modules/slides/src/presentation/draft-status.ts` (+ test) | Create | 4 |
| `packages/modules/slides/src/presentation/deck-view.tsx`, `use-deck.ts` (+ stories) | Modify | 4, 5 |
| `packages/modules/slides/src/presentation/deck-title.tsx` (+ stories) | Create | 5 |
| `apps/genie/testing/slides-describe.ts`, `apps/genie/testing/model-recordings/synthetic-new-deck-*.json`, `apps/genie/e2e/dev/new-deck.spec.ts` | Create | 6 |
| `docs/architecture/agent.md`, `docs/architecture/module-contract.md`, `docs/modules/slides/README.md` | Modify | 1, 2, 3 |

---

### Task 1: Core start of a surface run from a page

Implementer model: Opus, because the task is one transaction across a module callback, the run index and authorization.

**Files:**
- Create: `packages/core/src/services/agent/start-record.ts`, `packages/core/src/services/agent/start-record.test.ts`, `packages/core/testing/agent-start.integration.test.ts`
- Modify: `packages/core/src/services/agent/contract.ts`, `router.ts`, `store.ts` (`insertHandedSession`), `chat.ts` (title helper), `index.ts` (export), `docs/architecture/agent.md` ("Surfaces and the handoff": one paragraph "Start from a page")

**Interfaces:**
- Produces:
  - `export const START_PART = "data-start"`; part data `{ description: string }`.
  - `export function chatTitleFrom(text: string): string`: whitespace collapsed to one space, trimmed, cut to `CHAT_TITLE_LIMIT` (80). `chat.ts` uses it for a new session's title.
  - `export function startText(description: string): string`: the model's text of the first message, in core words: `The person started this record on its page and described it below. Name the record from the description, then build it.` then an empty line, then `Description: <description>`.
  - `export async function startRecordRun(ctx: ModuleRequestContext, input: { surface: string; description: string }): Promise<{ sessionId: string; recordId: string; address: string }>`.
  - Contract `agent.start`: `POST /agent/start`, input `{ surface: z.string().max(64), description: z.string().trim().min(1).max(AGENT_LIMITS.messageCharacters) }`, output `{ sessionId, recordId, address }`.
  - `AgentSessionSummary.run: AgentRunStatus | null`, computed by the existing `runStatus` from `run_state`, `run_error` and `run_job_id`, so a list read tells saved, stopped, failed and interrupted apart.

- [ ] **Step 1: Write the failing unit tests** in `start-record.test.ts`:
  - `chatTitleFrom` keeps 80 characters and cuts the 81st: `chatTitleFrom("a".repeat(81))` equals `"a".repeat(80)`, and `chatTitleFrom("  Q4\n\n review ")` equals `"Q4 review"`.
  - `startText("October collections")` ends with `"Description: October collections"` and contains no word `deck`.
- [ ] **Step 2: Write the failing integration tests** in `agent-start.integration.test.ts`, with the placeholder test surface (`packages/modules/placeholder/testing/test-surface.ts`) and the helpers of `agent-runs.integration.test.ts`. Never use Slides here.
  - A start saves one record, one session with `surface`, `record_id`, `handed_from_session_id` null, the title `chatTitleFrom(description)` and the deployment's chat model, one user message whose parts are `[{ type: "data-start", data: { description } }, { type: "text", text: startText(description) }]`, `run_state = "queued"`, and answers the address from `recordAddress`. Bug caught: a missing piece of the transaction.
  - A second start by the same person while the first run is queued refuses `agent-run-active`, and the record and session counts do not change. Bug caught: a record that leaks when the run index refuses.
  - With AI off, the start refuses `ai-off` and saves nothing. Bug caught: a start that skips the model check.
  - A surface that is not listed, or that does not accept a handoff, refuses `not-found`, and a person without the surface's instruction key refuses `forbidden`. Both save nothing. Bug caught: a start that reaches a surface the person may not write.
  - A `createRecord` that throws saves no session and no run. Bug caught: a session written outside the transaction.
  - `agent.sessions({ surface, recordId })` answers `run: "building"` for the queued run, and `run: "failed"` after the test ends the run with `endRun(..., "failed")`. Bug caught: a page that reads a failed run as finished.
- [ ] **Step 3: Run them and see each fail on its assertion.** Run: `pnpm nx run @genie/core:test -- start-record` and `pnpm nx run @genie/core:test:integration -- agent-start`. Expected: FAIL, `startRecordRun` is not defined.
- [ ] **Step 4: Implement.** Order inside `startRecordRun`: `agentAccess` (`permitted`, `ai === "on"`, `chatModel` not null, else `forbidden` or `ai-off`); find the surface in `ctx.tenant.capabilities.list("agent-surface")` (missing or `acceptsHandoff === false` is `not-found`); `can(ctx.caller, surface.instructions.permission)` else `forbidden`; then one `withTransaction` that runs `createRecord(ctx, tx, { title })`, `insertHandedSession` with `handedFromSessionId: null`, and `startRun`. Reuse `hand-over.ts` as the pattern; write no extra audit row (the module's create audit row and each tool call's audit row stay). `AppError` carries only `issues` to the client, so `agent-run-active` carries no address; the composer shows its catalogue message.
- [ ] **Step 5: Run the tests again.** Expected: PASS. Then `pnpm gate:fast`.
- [ ] **Step 6: Update `docs/architecture/agent.md`** with one paragraph: a module page can start its surface's run on a new record from the person's description; core makes the record, the session and the run in one transaction, and the rest works as a handoff with no Ask session.
- [ ] **Step 7: Commit** `feat(core): start a surface run on a new record from a page`.

### Task 2: Core page hooks and the start message in the chat

Implementer model: Opus, because the hooks share state with the panel and drive polling.

**Files:**
- Create: `packages/core/src/features/agent/record-run.ts`, `record-run.test.ts`
- Modify: `agent-panel-store.ts` (state `navigate: ((href: string) => void) \| null`, setter), `agent-panel-host.tsx` (registers `props.navigate` on mount, clears on unmount), `panel.ts` (exports), `conversation.tsx` and `conversation.stories.tsx`, `docs/architecture/module-contract.md` (bullet "Agent panel and record context")

**Interfaces:**
- Consumes: `agent.start`, `agent.sessions`, `agent.stop` (Task 1 and S7-40).
- Produces, from `@genie/core/features/agent/panel`:
  - `export function recordRunOf(sessions: readonly AgentSessionSummary[], recordId: string): { sessionId: string; title: string; run: AgentRunStatus | null } | null`: the record's session whose `run` is `building` or `stopping`, else the record's newest session, else null.
  - `export function useRecordRun(input: { surface: string; recordId: string; enabled: boolean }): { sessionId: string | null; sessionTitle: string | null; run: AgentRunStatus | null; endedHere: boolean; stop: () => void; refresh: () => void }`. It reads `agent.sessions({ surface, recordId })` with its own query: every `RUN_POLL_MS` while `run` is `building` or `stopping`, else every 10,000 ms like the deck, so a Try again from the panel shows. `endedHere` turns true when this mount saw the run go from building or stopping to an ended state. With `enabled: false` it reads nothing and answers nulls.
  - `export function useStartRecordRun(surface: string): UseMutationResult<{ sessionId: string; recordId: string; address: string }, Error, string>`. On success it opens the panel (`setPanelOpen(true)`) and calls the store's `navigate(address)`, or `window.location.assign(address)` when no host registered one.

- [ ] **Step 1: Write the failing unit tests** in `record-run.test.ts` as one table over `recordRunOf`: a building session of this record wins over a newer ended one; a session of another record is never picked; with no run, the newest session of the record and its ended `run` are answered; no session answers null.
- [ ] **Step 2: Write the story first** in `conversation.stories.tsx`: `StartedFromPage`, a session whose first message has the `data-start` part and the `startText` text part. Play: the person's bubble shows the description, and `queryByText(/Name the record/)` is null. Bug caught: core instructions shown to the person as their own words.
- [ ] **Step 3: Run** `pnpm nx run @genie/core:test -- record-run` and the story through Storybook MCP `test-run`. Expected: FAIL.
- [ ] **Step 4: Implement** `record-run.ts`, the store field, the host registration, and the `conversation.tsx` branch beside `briefPartOf`: a user message with a `data-start` part draws the same bubble with the description only.
- [ ] **Step 5: Run the tests and the story again.** Expected: PASS. Then `pnpm gate:fast`.
- [ ] **Step 6: Document** both hooks in `module-contract.md` under "Agent panel and record context", as core provisions (no declared point changes).
- [ ] **Step 7: Commit** `feat(core): let a page start and follow its record's run`.

### Task 3: Slides list, the inline composer

Implementer model: Opus, because the task is judgment-heavy UI with keyboard behavior and refusals.

**Files:**
- Create: `packages/modules/slides/src/presentation/new-deck-composer.tsx`, `new-deck-composer.stories.tsx`
- Modify: `deck-list.tsx`, `deck-list.stories.tsx`, `docs/modules/slides/README.md` ("What it does" and "Chat")

**Interfaces:**
- Consumes: `useStartRecordRun("slides")` (Task 2).
- Produces: `export function NewDeckComposer(props: { saving: boolean; failure: string | null; onCancel: () => void; onSubmit: (description: string) => void }): ReactNode`.

The composer sits under `PageHeader`, not in a dialog. `New deck` toggles it and carries `aria-expanded`. It shows only when `view.canWrite` and `view.chat.kind === "on"`. With `off` or `none`, New deck keeps today's title dialog and `createDeck`, and the existing "Chat is off. You can still make a deck with New deck." note stays. The textarea is a TanStack Form field with `z.string().trim().min(1).max(4000)`. Use `InputGroupTextarea` or `Textarea` from `@genie/ui` after a `docs-show` check. Below 768 px the two buttons take the full width.

- [ ] **Step 1: Write the stories with play functions** in `new-deck-composer.stories.tsx`, each named after the bug it catches:
  - `EnterCreates`: typing `  October collections \n` text and Enter calls `onSubmit` once with `"October collections"`. A second Enter while `saving` is true calls nothing more.
  - `ShiftEnterIsANewLine`: Shift+Enter adds a line and calls nothing.
  - `BlankDoesNothing`: Enter and Create deck on spaces call nothing, and Create deck is disabled.
  - `ChipFills`: a chip click puts its text in the textarea and focuses it, and calls nothing.
  - `RunActive`: a `failure` shows its message in `role="alert"`, and the typed text stays.
  - `Phone`: the phone viewport shows full-width buttons.
- [ ] **Step 2: Update `deck-list.stories.tsx`:** `NewDeck` and `NewDeckOnPhone` open the composer when chat is on; `NewDeckChatOff` still opens the title dialog and calls `createDeck({ title })`. Bug caught: a person without chat who loses New deck.
- [ ] **Step 3: Run** Storybook MCP `test-run` on both files. Expected: FAIL.
- [ ] **Step 4: Implement** `NewDeckComposer` and wire it in `deck-list.tsx`: `onSubmit` calls `start.mutate(description)`; a refusal maps to `failure` with the error's message (`appCodeOf` from `use-deck.ts` tells the codes apart if a message needs it); Cancel closes the composer and resets the mutation.
- [ ] **Step 5: Run the stories again.** Expected: PASS. Run `npx impeccable detect` on the touched stories and fix each finding. Then `pnpm gate:fast`.
- [ ] **Step 6: Update `docs/modules/slides/README.md`:** New deck takes a description when chat is on, else a title.
- [ ] **Step 7: Commit** `feat(slides): start a new deck from a description`.

### Task 4: Deck page, the drafting state

Implementer model: Opus, because the task couples polling, disabled editing and layout at two viewports.

**Files:**
- Create: `packages/modules/slides/src/presentation/draft-status.ts`, `draft-status.test.ts`
- Modify: `deck-view.tsx`, `deck-view.stories.tsx`, `use-deck.ts`, `views.ts` (`DeckPageView` gains `chat: ChatAvailability`), the deck page loader (fills it with `chatAvailability(ctx)` as the list loader does), `__fixtures__/decks.ts`

**Interfaces:**
- Consumes: `useRecordRun({ surface: "slides", recordId: deck.id, enabled: view.chat.kind !== "none" })` (Task 2). A person without `core:ask:use` is refused by the `agent` area, so the page never reads the run for that person, and the page looks as it does today.
- Produces:
  - `export function draftStatus(input: { run: AgentRunStatus | null; endedHere: boolean; drafted: number; planned: number | null }): string | null`.
  - `export function isUnnamed(input: { run: AgentRunStatus | null; title: string; sessionTitle: string | null }): boolean`: true only while `run` is `building` or `stopping` and `title === sessionTitle`.
  - `useDeck(initial, options?: { fast: boolean })`: `refetchInterval` is `RUN_POLL_MS` when `fast`, else 10,000.

- [ ] **Step 1: Write the failing unit tests** in `draft-status.test.ts`, one table each:
  - `draftStatus`: building, 0 drafted, no plan: `"Drafting slide 1"`; building, 2 drafted, no plan: `"Drafting slide 3"`; building, 2 drafted, planned 5: `"Drafting 3 of 5"`; building, 5 drafted, planned 5: `"Drafting 5 of 5"` (never 6 of 5); `stopping`: `"Stopping"`; ended here as `saved` or `stopped` with 1: `"1 slide drafted"`, with 4: `"4 slides drafted"`; ended here as `failed` or `interrupted` with 2: `"Drafting did not finish. 2 slides drafted"`; an ended run that this visit did not see end: null.
  - `isUnnamed`: true while building with the session's title; false once the title differs; false after the run ended with the provisional title (Review Focus 5).
- [ ] **Step 2: Write the stories** in `deck-view.stories.tsx`, with the run read mocked at the `agent` client as the existing deck stories mock `slides`:
  - `DraftingUnnamed`: zero slides; the title is a skeleton with the hidden text `Naming the deck`; the canvas shows `Reading your records` with `role="status"`; the pill reads `Drafting slide 1`; Stop shows and Export and Present do not.
  - `DraftingNamed`: two slides; the rail shows two thumbnails and one placeholder; the canvas shows slide 2; Add slide, Edit, Undo, Refresh data and the title button are disabled (Review Focus 4).
  - `StopEndsTheRun`: Stop calls `agent.stop` with the session id once.
  - `Ready`: after the run ended here as `saved`, the pill reads `2 slides drafted`, Export and Present return, and editing is enabled.
  - `FailedHalfWay`: the run ended here as `failed` with two slides; the pill reads `Drafting did not finish. 2 slides drafted`, the title shows the provisional name, and editing is enabled. The panel's notice offers Try again (S7-41).
  - `NoAgent`: `chat.kind` is `none`; no run is read, and the page shows as today. Bug caught: a deck page that breaks for a person without Ask.
  - `Drafting` and `Ready` again at the phone viewport, with the panel as a bottom panel.
  - Existing deck stories get `chat` in their fixture and an `agent` client mock that answers no sessions.
- [ ] **Step 3: Run** `pnpm nx run @genie/module-slides:test -- draft-status` and Storybook MCP `test-run` on `deck-view.stories.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement** in `deck-view.tsx`. While `run` is set: pass `fast` to `useDeck`; show the last slide; disable hand edits; show `draftStatus` in a `role="status"` pill and Stop in the header actions. Pass `planned: null` until the owner answers OQ-2. The page's `onFinished` (from `useAgentPage`) also calls `refresh()` of the run. A deck with no run looks as before.
- [ ] **Step 5: Run the tests and stories again.** Expected: PASS. Run `npx impeccable detect` on the touched stories. Then `pnpm gate:fast`.
- [ ] **Step 6: Commit** `feat(slides): show the deck page while the agent drafts it`.

### Task 5: Deck page, rename in place

Implementer model: Opus, because focus, the hash guard and the form need judgment.

**Files:**
- Create: `packages/modules/slides/src/presentation/deck-title.tsx`, `deck-title.stories.tsx`
- Modify: `deck-view.tsx` (replace the Rename dialog and `RenameForm`), `deck-view.stories.tsx` (remove or move the rename dialog stories)

**Interfaces:**
- Produces: `export function DeckTitle(props: { title: string; disabled: boolean; saving: boolean; failure: string | null; onSave: (title: string) => void }): ReactNode`. `deck-view.tsx` passes `onSave` as one `{ op: "rename", title }` change at the hash the person saw.

- [ ] **Step 1: Write the stories with play functions:**
  - `EnterSaves`: the button `Rename deck, <title>` turns into an input with the title; Enter calls `onSave` with the trimmed text once.
  - `EscapeCancels`: Escape restores the button with the old title, gives it focus, and calls nothing.
  - `TooLong`: 81 characters show the schema's error and do not save; 80 save.
  - `Unchanged`: Enter on the same title calls nothing and closes the input.
  - `Disabled`: while drafting, the button is disabled.
- [ ] **Step 2: Run** Storybook MCP `test-run`. Expected: FAIL.
- [ ] **Step 3: Implement** with TanStack Form and `renameFormSchema`. A refused save (stale hash) keeps the input open with the existing stale message and its Reload.
- [ ] **Step 4: Run the stories again.** Expected: PASS. Run `npx impeccable detect`. Then `pnpm gate:fast`.
- [ ] **Step 5: Commit** `feat(slides): rename a deck in place`.

### Task 6: End-to-end proof with synthetic fixtures

Implementer model: Opus, because the fixtures must match whole model requests and the test needs judgment on timing.

**Files:**
- Create: `apps/genie/testing/slides-describe.ts`, `apps/genie/testing/model-recordings/synthetic-new-deck-1.json` and its next steps, `apps/genie/e2e/dev/new-deck.spec.ts`

Write the fixtures by hand from `slides-build-*.json`, as the wave 5 synthetic fixtures are. The description is `DESCRIBED_DECK.description`; the run reads the deck, then sends one change with a `rename` step to `DESCRIBED_DECK.title` and the first `add-slide`, then one `add-slide` per slide, three slides in all, each answer about 1.5 s apart like the build fixtures. The header comment of `slides-describe.ts` says that the fixtures are synthetic and that R1 records them live.

- [ ] **Step 1: Write `new-deck.spec.ts`** with `surface-support.ts` and `ask-support.ts` helpers, at both projects:
  - Main path: Slides list, New deck, type the description, Enter. The deck page opens, the panel is open (bottom panel on phone) with the description as the first message, the title shows the skeleton and then `DESCRIBED_DECK.title`, the slide count rises step by step (`countsUntil`), the pill reads `Drafting ...` and then `3 slides drafted`, and Export and Present return. Rename in place to `Collections review` with Enter; the list shows the new name. `expectNoAxeViolations` on the list and the deck page.
  - Stop: Stop after the first slide shows; the run ends, the deck keeps its slides so far, and the pill reads `<n> slides drafted`.
  - Leave and return: go to the Slides list while it drafts, open the deck again, then `page.reload()` while it still drafts; the page shows the drafting status and Stop with no panel opened after the reload, and the deck ends with three slides. Bug caught: a run tied to the page, and a page that follows the run only through the panel.
- [ ] **Step 2: Run** `pnpm nx run @genie/app:test:e2e:dev -- new-deck.spec.ts` in the background (its `global-setup.ts` starts the stack, `next dev` with `GENIE_E2E_MODEL_RECORDINGS`, and a worker) with a log in `Working/logs/new-deck-e2e.log`, and poll the log. Expected: PASS at both projects. A fixture miss names the request that found no recording; fix the fixture, never the code under test.
- [ ] **Step 3: Commit** `test(slides): prove a deck drafted from a description`.

### After the tasks

The orchestrator runs one whole-branch review on Opus, then `pnpm gate:merge` in the background with a log in `Working/logs/`. A test-only fix after a failed gate follows the `CLAUDE.md` rule. No merge into `develop` without the owner.

---

## Decisions made while planning (for owner review)

1. The start lives in core as `agent.start` (Task 1), because the tech plan says to stop before any new module contract point. It reuses `createRecord` and gates on `acceptsHandoff`, so Slides needs no contract change. Rejected: a Slides procedure that inserts the session (module code writing core tables), and a new `AgentSurface` field for a draft title (a new contract point).
2. The provisional title is the description, cut to 80 characters, also used as the session's title. The page shows the loading title while the run builds and the deck title still equals the session's title. Rejected: a fixed `New deck` title (a person's own deck can carry it, and a failed run leaves no meaning in the name).
3. The first message holds a `data-start` part that the chat draws as the person's words and a core text part that asks the model to name and build the record, as the brief does. No surface instruction changes, so no recording is re-keyed. This touches R-46: see OQ-1.
4. With chat `off` or `none`, New deck keeps the title dialog.
5. While a run builds on a deck, the page disables hand edits. This also applies to a deck that Ask handed over (S7-42), which today allows hand edits that make the agent's next change fail.
6. The page reads the run with its own query (`useRecordRun`), not the panel, so a reload or a return keeps the drafting state. This follows the tech plan's "How pages follow a run". Session summaries gain the run status, so the page can tell a failed run from a finished one.
7. The ready pill shows only after the page saw the run end during this visit. A later visit shows the deck as any deck. A failed or interrupted run reads "Drafting did not finish. n slides drafted", and the panel offers Try again.
8. The deck page reads the run only for a person who may ask (`chat.kind` is not `none`).
9. Rename in place replaces the Rename dialog on the deck page, at both viewports.
10. The start writes no extra audit row. The deck's own create row and each tool call's row stay.
11. The session takes the deployment's chat model, because no Ask session exists to take one from. The tech plan's "Handed-over run defaults" names the Ask session's model for a handoff only. The composer has no model picker.
12. A start refused with `agent-run-active` saves nothing, and the composer shows the catalogue message with no link, because `AppError` carries no data but `issues`.
13. The end-to-end test uses synthetic fixtures. The owner records them live later.

## Open questions for the owner

- OQ-1 (R-46). The agent names the deck and drafts the slides from the core start text, not from words the person typed. R-46 allows a change only when the person's own message asks for it. The brief got such an amendment on 2026-11-08. Options: (a) amend R-46: Create deck with a description is the person's request to name the new record and build it (proposed text in the ticket); (b) show the core sentence in the person's first message so that the person sends it visibly. The plan builds (a) and waits for the ruling before Task 1.
- OQ-2 ("Drafting n of m"). Nothing tells the page how many slides the agent plans. Options: (a) an optional `plannedSlides` input on `slides-change-deck` and one instruction line, read by the page from the session's tool call; this re-keys every Slides recording, and those go on your refresh list; (b) the plan default: "Drafting slide n" and one placeholder for the slide in progress, a deviation from the prototype; its cost is that, after the last slide, the page shows "Drafting slide n+1" and one more placeholder while the agent writes its answer; (c) a planned count stored on the deck, which is a migration. `draftStatus` already accepts a plan, so (a) or (c) adds one task.
- OQ-3 (Undo copy). The prototype's answer says "Undo on the deck reverts my changes". Undo keeps 10 saves, a deck holds up to 20 slides, and `DEC-29` (2026-11-01) makes Delete the inverse of a chat create. A deck of 9 or more slides cannot go back to empty with Undo. Options: keep the agent's answer as the existing rules write it (plan default), or add a Slides rule line that names Delete for the whole deck (re-keys the recordings).
- OQ-4 (step limit). `AGENT_LIMITS.steps` is 10. A description has no datasets, so the run lists datasets, reads one or two, reads the deck, then makes one change per slide. That is about five or six slides per run; Try again adds the rest. The tech plan says to stop and ask if a run cannot finish a five-slide deck inside `AGENT_LIMITS`, and a description sits at that edge. Options: keep, or raise the step limit for surface runs (a core change that affects cost).
- OQ-5 (ticket). Approve S7-48 and its row in `docs/tickets/spec-7/README.md`, both drafts.
