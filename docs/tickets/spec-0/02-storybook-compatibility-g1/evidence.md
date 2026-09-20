# S0-02 evidence record

This record states what was run, what it printed, and what it did not prove. Every result below comes from a command executed in this worktree during this ticket. A check that was not run is named in "Not proved by this ticket".

G1 is the first gate of Spec 0. It asks one question: does the Storybook toolchain work on this dependency set, well enough for S0-04 to build on. The answer is in the disposition section at the end.

## 1. Revisions

| Item | Value |
| --- | --- |
| Branch | `feature/s0-02-storybook-g1` |
| Integrated base revision | `7fe04be` (`7fe04be688b5d51a13d563908cd43fad3e97f422`), `Merge pull request #1 from kenan-xin/feature/s0-01-workspace-and-build-inputs` |
| Head described by this record | `3985e5b` (`3985e5b45846f6255802f56efc58ed8e4c2cfd35`), `docs(core): reference the unused-nx-storybook bead` |
| Commits on the branch over base | 14, measured as `git rev-list --count 7fe04be..3985e5b` |
| Diff size | 46 files changed, 8457 insertions, 1167 deletions |

This record was written one commit after the head it names. Every gate result below was measured at `3985e5b` before the evidence commit existed. The evidence commit adds only this file, so the numbers stay checkable against the tree they describe.

A correction pass followed the first review, with the working tree at the evidence commit `c1829bc`. It added the state-reset observation of section 9, corrected the component listing of section 8 and the keyboard table row of section 9, re-ran the MCP request of section 10, and labeled the excerpts that come from an earlier task session. Section 9 names which observations are live and section 10 names which line is carried.

The 14 commits, oldest first:

| Commit | Subject |
| --- | --- |
| `1990e2b` | `docs(tickets): add the s0-02 implementation plan` |
| `52a6c72` | `build(deps): pin vitest to 4.1.11 for storybook 10` |
| `094d063` | `build(storybook): install the toolchain and stand up the host` |
| `5c246ae` | `fix(storybook): address task-2 review notes` |
| `4d60d07` | `build(storybook): wire the nx storybook targets` |
| `3ce7e0f` | `test(storybook): give test-storybook to the vitest addon` |
| `6321f79` | `feat(ui): add the Disclosure component, story first` |
| `be9e251` | `fix(ui): keep the disclosure content mounted, localize the dark story` |
| `0f62fd1` | `feat(modules): add the placeholder presentation module, story first` |
| `fc85982` | `fix(modules): declare the storybook dev dependencies` |
| `88db9db` | `docs(modules): complete the placeholder README import lists` |
| `d3cfa2a` | `build(storybook): serve the mcp addon on a loopback endpoint` |
| `b042ed3` | `docs(core): correct the nx storybook rows` |
| `3985e5b` | `docs(core): reference the unused-nx-storybook bead` |

## 2. Installed tool versions

Read from the installed tree, by opening each package's own `package.json` under `node_modules`, not from the manifest ranges. Every root shown carries the same version, so no second copy of any package exists in the tree.

| Package | Installed version | Where it is installed |
| --- | --- | --- |
| node | 26.9.0 | `process.version` |
| pnpm | 12.4.2 | `pnpm --version` |
| `storybook` | 10.6.0 | root, `apps/storybook`, `packages/ui`, `packages/core`, `packages/modules/placeholder` |
| `@storybook/nextjs-vite` | 10.6.0 | root, `apps/storybook`, `packages/ui`, `packages/core`, `packages/modules/placeholder` |
| `@storybook/addon-docs` | 10.6.0 | root, `apps/storybook` |
| `@storybook/addon-a11y` | 10.6.0 | root, `apps/storybook` |
| `@storybook/addon-vitest` | 10.6.0 | `apps/storybook` |
| `@storybook/addon-mcp` | 10.6.0 | `apps/storybook` |
| `@nx/storybook` | 23.2.1 | root |
| `nx` | 23.2.1 | root |
| `vitest` | 4.1.11 | root, `apps/storybook`, `packages/ui`, `packages/core`, `packages/modules/placeholder`, `packages/config` |
| `@vitest/browser` | 4.1.11 | root |
| `@vitest/browser-playwright` | 4.1.11 | root, `packages/config` |
| `playwright` | 1.63.0 | root |
| `next` | 16.3.5 | root, `apps/storybook` |
| `react` | 19.3.0 | root, `apps/storybook`, `packages/ui`, `packages/core`, `packages/modules/placeholder` |
| `react-dom` | 19.3.0 | root, `apps/storybook`, `packages/ui` |
| `vite` | 8.3.0 | root, `apps/storybook` |
| `typescript` | 7.0.2 | root |
| `oxlint` | 1.83.0 | root and every package |
| `oxfmt` | 0.68.0 | root |
| `tailwindcss` | 4.3.3 | root, `packages/ui`, `packages/config` |

Exactly four Storybook addons are registered, and the list is owned by `packages/config/src/storybook/index.ts`: `@storybook/addon-docs`, `@storybook/addon-a11y`, `@storybook/addon-vitest`, `@storybook/addon-mcp`. A test in `packages/config/src/storybook/index.test.ts` asserts the exact array, so a fifth addon or a dropped addon fails the unit gate.

Vitest is 4.1.11, one major below the line in `docs/core/tech-stack.md`. Storybook 10.6.0 accepts Vitest 3 or 4 and rejects 5. ADR 0009 records the pin, the reason, and the conditions that reopen it.

## 3. The project graph

`nx show projects --json` enumerates exactly seven projects.

| Project | Root | Tags | Targets |
| --- | --- | --- | --- |
| `@genie/app` | `apps/genie` | `app` | `lint`, `test`, `typecheck` |
| `@genie/storybook` | `apps/storybook` | `app` | `lint`, `typecheck`, `storybook`, `build-storybook`, `test-storybook` |
| `@genie/core` | `packages/core` | `core` | `lint`, `test`, `typecheck` |
| `@genie/ui` | `packages/ui` | `ui` | `lint`, `test`, `typecheck` |
| `@genie/modules-placeholder` | `packages/modules/placeholder` | `module` | `lint`, `test`, `typecheck` |
| `@genie/config` | `packages/config` | `config` | `lint`, `test`, `typecheck` |
| `@genie/generators` | `tools/generators` | `tooling` | `lint`, `test`, `typecheck` |

`nx show project` prints the tag list with the pnpm-supplied `npm:private` entry beside the repository tag: `@genie/storybook` reads `["npm:private", "app"]` and `@genie/modules-placeholder` reads `["npm:private", "module"]`. The two required tags are present.

`@genie/modules-placeholder` is the first project in the repository tagged `module`. The S0-01 hygiene test checks every enumerated project against `classifyProject`, so the new project passes through that check rather than around it.

## 4. Gate commands and outcomes

All runs below were made in this worktree at head `3985e5b`, with `--skip-nx-cache` where Nx runs the task, so no result is replayed from cache.

| Command | Exit | Real task count | Test count |
| --- | --- | --- | --- |
| `nx run-many -t lint typecheck test --skip-nx-cache` | 0 | 20 tasks ran, 5.4 s | see the breakdown below |
| `nx run-many -t test --skip-nx-cache` | 0 | 6 tasks | 19 test files, 103 tests, all passing |
| `nx run @genie/storybook:test-storybook --skip-nx-cache` | 0 | 1 task | 3 test files, 11 tests, all passing |
| `nx run @genie/storybook:build-storybook --skip-nx-cache` | 0 | 1 task, 1.6 s | not a test target |
| `pnpm run format:check` | 1 | one root command over 80 files | not a test target |
| `git status --short` after the run | clean | no task | no task |

The 20 tasks of the combined run are: `lint` and `typecheck` for all seven projects, which is 14, plus `test` for the six projects that declare it. `@genie/storybook` declares no `test` target, because its component tests run under `test-storybook`.

Unit test counts by project, from the same run:

| Project | Test files | Tests |
| --- | --- | --- |
| `@genie/ui` | 1 | 1 |
| `@genie/core` | 1 | 1 |
| `@genie/app` | 1 | 1 |
| `@genie/modules-placeholder` | 1 | 3 |
| `@genie/config` | 8 | 47 |
| `@genie/generators` | 7 | 50 |
| Total | 19 | 103 |

The `build-storybook` run wrote `apps/storybook/storybook-static`. Its `index.json` holds 13 entries in three top-level groups: `UI`, `Core`, `Modules`.

### The format gate fails on one pre-existing file

`pnpm run format:check` runs `oxfmt --check --disable-nested-config`. It exits 1 and names exactly one file:

```
Checking formatting...

.mcp.json (0ms)

Format issues found in above 1 files. Run without `--check` to fix.
Finished in 18ms on 80 files using 32 threads.
```

`.mcp.json` is tracked, is untouched by this branch, and is outside every path this ticket writes. The drift is pre-existing. This ticket does not fix it, because the file belongs to another owner. Every source file this branch wrote passes the same checker. This record is markdown, which oxfmt does not format: it is not in the 80 files the checker reads, and a direct `oxfmt --check` on its path answers `Expected at least one target file. All matched files may have been excluded by ignore rules.`

### The install command exits non-zero for a known reason

`pnpm install` exits 1 on two pre-existing unmet peers: `tsconfck@3.1.6` wants `typescript@^5` and the repository carries 7.0.2, and `@nx/eslint@23.2.1` wants `eslint`, which this repository does not use because it lints with oxlint. The install itself completes its work and then fails on the report step. Bead `genie-ops-center-v2-8nb` holds this. Nothing on this branch relaxes `strictPeerDependencies`, and no dependency major was changed to make an install pass.

## 5. Target ownership

Read from `nx show project @genie/storybook --json` at head `3985e5b`.

| Target | Executor | Script | Cache | Inputs | Outputs | dependsOn |
| --- | --- | --- | --- | --- | --- | --- |
| `storybook` | `nx:run-script` | `storybook dev -p 6006 --host 127.0.0.1 --no-open` | false | target default | none | none |
| `build-storybook` | `nx:run-script` | `storybook build` | true | `["default", "^production", { "env": "MODULE_INCLUDE" }]` | `["{projectRoot}/storybook-static"]` | `["^build"]` |
| `test-storybook` | `nx:run-script` | `vitest --project storybook run` | true | `["default", "^production", { "env": "MODULE_INCLUDE" }]` | none | none |

All three targets resolve to `nx:run-script`, which means the command text lives in the `scripts` block of `apps/storybook/package.json` and the cache policy lives in `targetDefaults` in `nx.json`. One owner per target. No target is claimed twice.

### Why `@nx/storybook/plugin` is not registered

The plugin cannot load under TypeScript 7.0.2. It reads the TypeScript compiler API through `@phenomnomnominal/tsquery`, which reads `ts.SyntaxKind`. TypeScript 7.0.2 exports only `version` and `versionMajorMinor`, so the plugin throws `Cannot convert undefined or null to object` at `@phenomnomnominal/tsquery/dist/src/syntax-kind.js:8` and the failure takes down the whole Nx project graph, not only the Storybook project. The same root cause breaks `@nx/web`, which calls `ts.readConfigFile`.

The repository therefore wires the three targets from `package.json` scripts, which is the documented alternative and needs no hand-written executor. `docs/core/tech-stack.md` was corrected to say this, in commits `b042ed3` and `3985e5b`.

`@nx/storybook` 23.2.1 stays installed at the root but is not used by any registered plugin or executor. Bead `genie-ops-center-v2-y4f` holds the question of whether to drop it. Bead `genie-ops-center-v2-c1u` holds the `@nx/web` breakage.

This does not trip the stop condition "`@nx/storybook` cannot own the serve or build target, so the repository would need hand-written executors." No executor was hand-written. The targets are plain scripts, which Nx runs natively.

## 6. The interaction red and green

The component under test is `Disclosure`, in `packages/ui/src/disclosure/disclosure.tsx`, written story first. Task 6 folded into Task 5, so both red and green pairs are recorded in `.superpowers/sdd/plan/task-5-report.md`.

**Red 1a, the weak red.** `disclosure.stories.tsx` on disk, `disclosure.tsx` absent. `nx run @genie/storybook:test-storybook --skip-nx-cache`, exit 1:

```
 FAIL  |storybook (chromium)| ../../packages/ui/src/disclosure/disclosure.stories.tsx
Error: Failed to import test file .../packages/ui/src/disclosure/disclosure.stories.tsx
Caused by: TypeError: Failed to fetch dynamically imported module:
  http://localhost:63315/.../packages/ui/src/disclosure/disclosure.stories.tsx
 Test Files  1 failed | 1 passed (2)
      Tests  1 passed (1)
```

A missing import is weak evidence, so a scaffold was added to produce a real assertion failure.

**Red 1b, the real red.** The scaffold renders a `button` with `aria-expanded` hard-coded to `"false"`, no state and no content. Exit 1:

```
 ❯ |storybook (chromium)| ../../packages/ui/src/disclosure/disclosure.stories.tsx (2 tests | 1 failed)
   × Opens On Click 23ms
 FAIL  ... > Opens On Click
expect(element).toHaveAttribute("aria-expanded", "true")
Expected the element to have attribute:
  aria-expanded="true"
Received:
  aria-expanded="false"
 ❯ ../../packages/ui/src/disclosure/disclosure.stories.tsx:49:0
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 2 passed (3)
```

`Closed` passed and `OpensOnClick` failed. The story that describes the behavior failed, and the story that describes the initial state passed.

**Green 1.** The toggle implemented with `useState`, `useId`, `aria-expanded`, `aria-controls`, and a labelled `region`. Exit 0:

```
 Test Files  2 passed (2)
      Tests  3 passed (3)
 NX   Successfully ran target test-storybook for project @genie/storybook
```

## 7. The accessibility red and green

The axe check runs through `@storybook/addon-a11y` with `parameters.a11y.test = "error"` in `apps/storybook/.storybook/preview.tsx`.

Provenance: every transcript in this section is carried from the Task 5 session and recorded in `.superpowers/sdd/plan/task-5-report.md`. That session's work landed in `6321f79` and `be9e251`, so the failing runs cannot be reproduced at head `3985e5b` without reintroducing the defect. What was re-run at head is the green, as the `test-storybook` row of section 4.

**Attempt 1 was rejected as evidence.** Replacing the trigger with a `div` carrying `onClick` gave Nx exit 1, but every failure read `TestingLibraryElementError: Unable to find an accessible element with the role "button"`. Five play functions failed before axe ran, and no axe rule was named anywhere in the output. A query failure is not an accessibility failure, so this attempt was discarded rather than reported as a pass of the gate.

**Attempt 2 found a real defect in the harness.** The accessible `button` was restored and `aria-expanded` was added to the wrapper `div`, where axe's `aria-allowed-attr` rule forbids it. Nx exit **0**:

```
 Test Files  2 passed (2)
      Tests  6 passed (6)
```

A genuine, serious-severity ARIA violation passed the gate. The cause was printed on every run:

```
Info: Found a setup file with "setProjectAnnotations".
Skipping automatic provisioning of preview annotations to avoid conflicts.
Since Storybook 10.3, "@storybook/addon-vitest" applies these automatically.
```

`apps/storybook/.storybook/vitest.setup.ts` called `setProjectAnnotations` with only `./preview.tsx`. That opted the run out of automatic provisioning, which is how `@storybook/addon-a11y` installs its axe `afterEach` hook. The `a11y` parameter survived; the code that reads it did not. The fix deletes the setup file and its `setupFiles` entry in `apps/storybook/vitest.config.ts`.

**Red 2, after the fix, with the same violation still in place.** Nx exit **1**:

```
 ❯ |storybook (chromium)| ../../packages/ui/src/disclosure/disclosure.stories.tsx (5 tests | 5 failed)
   × Closed 181ms
   × Opens On Click 20ms
   × Opens From The Keyboard 37ms
   × Open By Default 19ms
   × State Resets 15ms

expect(received).toHaveNoViolations(expected)
Expected the HTML found at $('div[data-theme="light"] > div') to have no violations:
"Elements must only use supported ARIA attributes (aria-allowed-attr)"
https://dequeuniversity.com/rules/axe/4.13/aria-allowed-attr?application=axeAPI

 Test Files  1 failed | 1 passed (2)
      Tests  5 failed | 1 passed (6)
```

Axe rule identifier: **`aria-allowed-attr`**. Every play function passed. The accessibility check alone failed each story.

**Green 2.** `aria-expanded` removed from the wrapper. Nx exit **0**:

```
 Test Files  2 passed (2)
      Tests  6 passed (6)
 NX   Successfully ran target test-storybook for project @genie/storybook
```

The two Nx exit codes that prove the gate are attempt 2's **0** and red 2's **1**, on the same violation. The deletion of the setup file is what moved one to the other. The pair is the evidence, not either run alone.

The stop condition "the accessibility addon reports nothing while a real violation is present" was reached, in attempt 2. It was resolved inside this ticket by removing the setup file that suppressed the addon, so the gate now fails on a real violation. No check was weakened.

## 8. The two collection counts

The unit collection and the component collection are separate Vitest projects. `packages/config/src/vitest/unit.ts` sets `name: "unit"` and `packages/config/src/vitest/component.ts` sets `name: "storybook"`. A test in `packages/config/src/vitest/component.test.ts` asserts the project name, so a merge of the two collections fails the unit gate.

| Collection | Command | Test files | Tests |
| --- | --- | --- | --- |
| Unit | `nx run-many -t test --skip-nx-cache` | 19 | 103 |
| Component | `nx run @genie/storybook:test-storybook --skip-nx-cache` | 3 | 11 |

Both are nonempty. Neither is zero at any point in this record.

The two collections are disjoint. A count of story files inside the unit run is 0. The two listings prove the split directly:

```
$ pnpm --filter @genie/core exec vitest list --filesOnly
[unit] src/index.test.ts

$ pnpm --filter @genie/storybook exec vitest list --project storybook --filesOnly
[storybook (chromium)] ../../packages/ui/src/disclosure/disclosure.stories.tsx
[storybook (chromium)] ../../packages/core/src/lib/story-seam/core-group.stories.tsx
[storybook (chromium)] ../../packages/modules/placeholder/src/presentation/workspace-page.stories.tsx
```

The unit listing names one file because it is scoped to `@genie/core`; the 19 files of the table are the whole `run-many` sweep. The component listing names the same three files the table counts.

The component collection runs in a real browser, not in a simulated DOM. The negative control is a forced browser-path failure:

```
$ PLAYWRIGHT_BROWSERS_PATH=/tmp/no-browsers-here nx run @genie/storybook:test-storybook
Error: browserType.launch: Executable doesn't exist at
  /tmp/no-browsers-here/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
```

The run cannot pass without a real Chromium, so a green component run is browser evidence.

### The module selection input

`MODULE_INCLUDE` is a declared Nx env input on both `build-storybook` and `test-storybook`, as section 5 shows. `.storybook/main.ts` resolves the selection through `@genie/generators` before story collection, so an excluded module is never globbed.

| Selection | Command | Index entries | Placeholder present |
| --- | --- | --- | --- |
| Unset, which the resolver treats as every module | `storybook build` | 13 | yes, four stories plus a Docs page |
| `MODULE_INCLUDE=""`, an explicitly empty selection | `MODULE_INCLUDE="" storybook build --output-dir storybook-static-empty` | 8 | no |

Provenance: the 13-entry row was re-measured at head `3985e5b` for this record. The 8-entry row is carried from the Task 7 session, recorded in `.superpowers/sdd/plan/task-7-report.md`, whose work landed in `0f62fd1`, `fc85982` and `88db9db`. The empty-selection build was not re-run at head.

The fixture string `First record` appears nowhere in the excluded bundle. The exclusion happens before collection, not by hiding a collected story.

## 9. Manual observations in a live browser

These are the checks the automated runs cannot make. They were made during this task, not carried over from an earlier task. The dev server ran as `pnpm --filter @genie/storybook run storybook` in the background with its output in a log file, and a throwaway Playwright script outside the repository drove a real Chromium against `http://127.0.0.1:6006`. The server was killed afterwards, and the port was confirmed free: no matching process, nothing listening on 6006, and `curl http://127.0.0.1:6006/` exits 7, connection refused.

The dev server log reads `On your network: http://127.0.0.1:6006/` and `44 ms for manager and 86 ms for preview`. No page error was raised on any run: the collected `pageerror` list was empty every time.

### The sidebar

The sidebar shows three top-level groups, `UI`, `Core`, and `Modules`, with `Placeholder` under `Modules`. Read from `#storybook-explorer-tree [data-item-id]` after navigating to a placeholder story, which expands its ancestors:

```
root      | ui                                   | UI
component | ui-disclosure                        | Disclosure
story     | ui-disclosure--closed                | Closed
story     | ui-disclosure--opens-on-click        | Opens On Click
story     | ui-disclosure--opens-from-the-keyboard | Opens From The Keyboard
story     | ui-disclosure--open-by-default       | Open By Default
story     | ui-disclosure--state-resets          | State Resets
story     | ui-disclosure--dark                  | Dark
root      | core                                 | Core
component | core-story-seam                      | Story seam
document  | core-story-seam--docs                | Docs
story     | core-story-seam--default             | Default
root      | modules                              | Modules
group     | modules-placeholder                  | Placeholder
component | modules-placeholder-workspace-page   | Workspace page
document  | modules-placeholder-workspace-page--docs | Docs
story     | modules-placeholder-workspace-page--desktop | Desktop
story     | modules-placeholder-workspace-page--phone   | Phone
story     | modules-placeholder-workspace-page--dark    | Dark
story     | modules-placeholder-workspace-page--empty   | Empty
```

The selected node was `modules-placeholder-workspace-page--desktop`. Result: pass.

### The theme toolbar

The toolbar control is a button whose accessible name begins `The colour scheme`. Storybook 10 sets no `title` attribute on toolbar buttons, so the control is found by `aria-label`.

On `ui-disclosure--closed`, before the change the preview decorator rendered:

```
<div data-theme="light"><div><button type="button" aria-expanded="false" aria-controls="_r...
```

After choosing `Dark` from the toolbar menu, the same element read `<div data-theme="dark">...`, the markup string differed from the one before, the toolbar button's accessible name became `The colour scheme the story renders in. Dark`, and the story was still rendered, with its trigger text unchanged. The global was then set back to `Light` and the attribute returned to `light`. Result: pass. The toolbar re-renders the story rather than only changing a label.

### The viewport control

This is the physical resize that the component tests cannot make. Vitest browser mode applies the viewport global as a story parameter without resizing a real frame, so this observation is the only proof that the frame changes size.

On `ui-disclosure--closed`, which pins no viewport global, the control is enabled (`aria-disabled` reads `false`) and its menu lists `Reset viewport`, `Small mobile`, `Large mobile`, `Tablet`, `Desktop`.

| State | Preview frame | `window.innerWidth` inside the frame |
| --- | --- | --- |
| Default | 1300 x 660 | 1300 |
| After `Small mobile` | 320 x 568 | 320 |
| After `Desktop` | 1280 x 578 | 1280 |

Result: pass. The real browser resizes the frame, and the story inside it reports the new width.

On the placeholder stories the control is disabled, with the accessible name `Viewport size set by story parameters Small mobile` on `Phone` and `... Desktop` on `Desktop`, and `aria-disabled` reads `true`. Those stories pin `globals.viewport`, so Storybook locks the toolbar to the story's own choice. The frames still differ by story: `Phone` renders at 320 x 568 with `innerWidth` 320, and `Desktop` at 1280 x 578 with `innerWidth` 1280. This is Storybook behaving as documented, not a defect, and it is recorded here so that a later reader is not surprised by a greyed-out control.

### The Docs tab

On `modules-placeholder-workspace-page--docs` the description from `parameters.docs.description.component` renders: the page contains `The placeholder workspace page, rendered from fixtures`. A table of contents is present, from `docs: { toc: true }` in the preview. The visible headings are `Workspace page`, `Placeholder`, `Stories`, `Desktop`, `Phone`, `Dark`, `Empty`.

All four stories render inline on the Docs page: the strings `First record`, `Second record`, and `No records yet.` are all in the rendered text.

The controls table renders with the headers `Name`, `Description`, `Default`, `Control`, and one row for the `records` argument:

```
records* unknown - records :[ 0 :{...} 3 keys 1 :{...} 3 keys ]
```

Two artifacts in the page were investigated rather than assumed. A heading reading `No Preview` exists in the document as `H1.sb-nopreview_heading` with `offsetParent` null, so it is a hidden template and not a failed preview. The first `table` element is likewise hidden, a skeleton args table; the visible table is the real controls table quoted above. Result: pass.

### The keyboard path

On `ui-disclosure--closed`, driven through the real preview frame. The frame was focused by clicking empty space inside it, away from the sidebar resize handle overlay.

| Step | Observed |
| --- | --- |
| Focus before Tab | `BODY` |
| After Tab | `BUTTON[aria-expanded=false] "Deployment notes"` |
| Initial state | `aria-expanded=false`, content `hidden` present, content not visible. The `role="region"` element stays in the document carrying `hidden`, so it is out of the accessibility tree but not out of the DOM |
| After Enter | `aria-expanded=true`, content `hidden` absent, content visible, region reads `Deployment notes \| One deployment serves one customer.` |
| After Space | `aria-expanded=false`, content `hidden` present, content not visible |
| Focus at the end | still on the trigger button |

Result: pass. A native `button` answers both keys, and focus does not move away when the panel opens or closes.

### The state reset between stories

Observed live for this record, with a throwaway Playwright script under `/tmp`, against the same dev server, working tree at commit `c1829bc`. Each step drives the manager to a story and reads the trigger and its `aria-controls` target out of the preview frame.

| Step | Story | Observed |
| --- | --- | --- |
| 1 | `ui-disclosure--closed`, on arrival | `aria-expanded=false`, content `hidden` present, content not visible |
| 2 | the same story, after clicking the trigger by hand | `aria-expanded=true`, content `hidden` absent, content visible |
| 3 | navigate to `core-story-seam--default` | left the component |
| 4 | back on `ui-disclosure--closed` | `aria-expanded=false`, content `hidden` present, content not visible |
| 5 | `ui-disclosure--open-by-default` | `aria-expanded=true`, content `hidden` absent, content visible |
| 6 | `ui-disclosure--state-resets`, after step 5 | `aria-expanded=false`, content `hidden` present, content not visible |
| 7 | `ui-disclosure--opens-on-click`, after its play function ran | `aria-expanded=true`, content `hidden` absent, content visible |
| 8 | `ui-disclosure--state-resets`, after step 7 | `aria-expanded=false`, content `hidden` present, content not visible |

The script collected `pageerror` events and reported `[]`, so no step raised a page error.

Result: pass. A disclosure opened by hand comes back closed after the reader leaves the component and returns. `State Resets` renders closed after a story that renders open and after a story whose play function opens it, so one story does not leak its state into the next.

The element carrying `role="region"` stays in the document at every step, including the closed ones, because `Disclosure` keeps its content mounted and toggles the native `hidden` attribute (commit `be9e251`). `hidden` removes the element from the accessibility tree, which is what the `Closed` story's `queryByRole("region")` assertion reads. The two agree. The state signals here are `aria-expanded` and the `hidden` attribute, read from the DOM.

### The accessibility panel in the running application

The addon panel tabs read `Violations 0`, `Passes 12`, `Inconclusive 0` on the story under observation. This is the browser-side panel, which is separate from the command-line gate of section 7. It confirms that deleting `vitest.setup.ts` did not remove the panel from the running Storybook.

## 10. The MCP endpoint

`@storybook/addon-mcp` 10.6.0 is registered as the fourth addon, with no options, so it serves on the documented default path `/mcp` of the dev server.

The connection was made live for this record, against the dev server running with the working tree at commit `c1829bc`:

```
curl -sS -i -X POST http://localhost:6006/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Response, with the routine headers trimmed:

```
HTTP/1.1 200 OK
content-type: text/event-stream
mcp-session-id: 6d6abda3-19e2-4990-be12-3d1ae7e9af73

event: message
data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"stories-preview",...
```

The eight tools, in the order returned:

1. `stories-preview`
2. `get-storybook-story-instructions`
3. `stories-changed`
4. `stories-find-by-component`
5. `test-run`
6. `docs-list`
7. `docs-show`
8. `docs-show-story`

Those cover all three documented toolsets: `dev`, `docs`, and `test`.

### The listening address

The pre-fix bind below is carried from the Task 8 session, recorded in `.superpowers/sdd/plan/task-8-report.md`. That session's work landed in `d3cfa2a`, so it cannot be reproduced at head `3985e5b`. The post-fix bind was read again live for this record.

Before the fix, `storybook dev` bound every interface:

```
LISTEN 0  511  *:6006  *:*  users:(("node-MainThread",pid=2394850,fd=42))
```

and the banner advertised `On your network: http://<lan-ip>:6006/`. Binding every interface publishes a local-area-network address, which this ticket must not do.

Commit `d3cfa2a` added `--host 127.0.0.1` to the `storybook` script. After the fix:

```
LISTEN 0  511  127.0.0.1:6006  0.0.0.0:*  users:(("node-MainThread",pid=2843283,fd=41))
```

The banner prints `On your network: http://127.0.0.1:6006/`, and a probe of the local-area-network address is refused: `curl -m 4 http://<lan-ip>:6006/mcp` returns `curl: (7) Failed to connect to <lan-ip>:6006 after 0 ms`. The same bind was observed again live during this task, in section 9.

The endpoint reaches no production surface. The addon is a development dependency of `apps/storybook`, which is itself private, and the static build carries no `/mcp` string. The stop condition "the MCP endpoint cannot bind to loopback only" was not reached.

## 11. G1 disposition

**G1 passes.**

The Storybook toolchain works on this dependency set. Every gate at head `3985e5b` exits 0, except `pnpm run format:check`, which exits 1 on the pre-existing `.mcp.json` and on nothing else. The four required addons load. The two test collections are separate and both nonempty. The interaction gate and the accessibility gate each failed for the right reason and then passed, with exit codes recorded both times. The static build carries the module's stories under the default selection and excludes them under an empty selection. The MCP endpoint answers on loopback only. The six manual observations, sidebar, theme, viewport, docs, keyboard and state reset, all pass in a real browser.

One stop condition was reached during the work, in section 7: the accessibility addon reported nothing while a real violation was present. It was resolved inside this ticket by deleting the setup file that suppressed the addon, and the gate now fails on that violation. No check was weakened to reach this disposition, no import boundary was changed, no addon was omitted, and no dependency major was moved to make an install succeed.

S0-04 is unblocked by this record on the presentation side only. Read section 12 before you rely on any part of it.

## 12. Not proved by this ticket

- Synthetic browser fixtures prove presentation. They prove no database behavior, no authorization, no routing, and no deployed end-to-end path.
- The full selection and cache matrix of R-41b and AC-28 belongs to S0-10. This ticket proves only that `MODULE_INCLUDE` is a declared input and that an empty selection excludes the module's stories.
- Customer runtime image exclusion is unproved, because no image exists yet. S0-11 owns it.
- The placeholder module holds presentation only. S0-04 adds every server declaration.
- Vitest sits one major below the line in the tech stack. ADR 0009 records the reason and the reopening conditions.
- The generator discovery half of AC-27 is unproved. No module generator exists yet. S0-08 and S0-10 own it.
- Only the axe rule `aria-allowed-attr` was exercised against the gate. The gate is proved to run axe and to fail the Nx target. It is not proved against every rule class. `color-contrast` in particular cannot fire, because no component on this branch carries styling.
- `MODULE_INCLUDE` set to a real non-default value, naming some modules and not others, was not exercised against `test-storybook`. Only the unset default and the explicitly empty selection were run.
- Nx cannot distinguish an unset `MODULE_INCLUDE` from an empty one in its input hash. Bead `genie-ops-center-v2-2cg` holds this.
- Whether an excluded module stays confidential to the MCP endpoint is untested. The `docs-list` and `stories-find-by-component` tools read the live index, and no run checked a scoped selection against them.
- No end-to-end test exists at any viewport. The phone and desktop requirement of `DEC-25` belongs to the end-to-end layer, which Spec 0 has not built yet. Section 9's viewport observation is a manual check of the Storybook toolbar, not a test that runs in a gate.
- Nothing proves that an agent using the MCP tools writes a correct story. The tools answer; their usefulness is unmeasured.
- The `build` target is still absent from every project. `build-storybook` depends on `^build`, which today resolves to nothing.

Passing gates on one component, one story seam and one presentation-only module is not deployment proof. It proves that the toolchain runs, that its failures are visible, and that the two test collections stay apart. Everything a customer would use is later work.

## 13. Deferred findings

Every finding this ticket did not fix is filed in Beads. None is left only in this document.

| Bead | Priority | Title | Why it is deferred |
| --- | --- | --- | --- |
| `genie-ops-center-v2-c1u` | P2 | `@nx/web` 23.2.1 breaks the Nx project graph under TS 7.0.2 | Upstream defect in a package this ticket does not install. The workaround, not registering the plugin, is in place. |
| `genie-ops-center-v2-2cg` | P2 | Nx env input cannot tell `MODULE_INCLUDE` unset from empty | Nx behavior, not repository behavior. It affects cache correctness in the selection matrix, which S0-10 owns. |
| `genie-ops-center-v2-y4f` | P3 | Drop the unused `@nx/storybook` devDependency or document why it stays | A dependency removal decision belongs to the integration owner, not to the ticket that discovered the package is idle. |
| `genie-ops-center-v2-8nb` | P3 | Fresh pnpm resolution fails on two pre-existing unmet peers | Pre-existing on `develop`. Fixing it means moving a dependency this ticket does not own. |
| `genie-ops-center-v2-owz` | P3 | Split `packages/core` tsconfig lib into node and browser programs | A typecheck restructure across packages, wider than this ticket's scope. |
| `genie-ops-center-v2-z30` | P3 | Align Storybook host tag and theme toolbar with later tasks | Raised while the host was still changing. Section 9 now records the toolbar's real behavior. |
| `genie-ops-center-v2-p12` | P3 | `tech-stack.md` overstates `@nx/storybook` role after plugin was dropped | The document fix landed on this branch in `b042ed3` and `3985e5b`. The bead stays open until the integration owner confirms and closes it. |
| `genie-ops-center-v2-n35` | P3 | Amend S0-02 plan stale lines after `vitest.setup.ts` deletion | The plan document still lists the deleted setup file as a deliverable. Correcting an approved plan is the integration owner's call. |
| `genie-ops-center-v2-div` | P3 | Selection resolver is unreachable by package specifier and its plugin dependency is misplaced | The exports map landed on this branch in `094d063`. The bead stays open until the integration owner confirms and closes it. |

No new finding was opened by this task. The one surprise in section 9, the disabled viewport control on a story that pins `globals.viewport`, is Storybook working as documented and is recorded in this document rather than filed.

## 14. Changed paths

Base `7fe04be` to head `3985e5b`, 46 files.

New:

- `apps/storybook/.storybook/main.ts`, `apps/storybook/.storybook/preview.tsx`, `apps/storybook/README.md`, `apps/storybook/package.json`, `apps/storybook/tsconfig.json`, `apps/storybook/vitest.config.ts`
- `docs/adr/0009-storybook-pins-the-vitest-major.md`
- `docs/tickets/spec-0/02-storybook-compatibility-g1/plan.md`
- `packages/config/src/vitest/component.ts`, `packages/config/src/vitest/component.test.ts`
- `packages/core/src/lib/story-seam/core-group.tsx`, `core-group.stories.tsx`, `README.md`
- `packages/modules/placeholder/` in full: `README.md`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/README.md`, `src/presentation/README.md`, `src/presentation/workspace-page.tsx`, `src/presentation/workspace-page.stories.tsx`, `src/presentation/__fixtures__/README.md`, `src/presentation/__fixtures__/records.ts`, `src/presentation/__fixtures__/records.test.ts`
- `packages/ui/src/disclosure/disclosure.tsx`, `disclosure.stories.tsx`, `README.md`

Changed:

- `.gitignore`, `nx.json`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- `apps/genie/package.json`
- `docs/core/tech-stack.md`
- `packages/config/package.json`, `packages/config/src/storybook/index.ts`, `index.test.ts`, `README.md`, `packages/config/src/vitest/unit.ts`
- `packages/core/package.json`, `packages/core/tsconfig.json`
- `packages/ui/package.json`, `packages/ui/src/index.ts`, `packages/ui/tsconfig.json`
- `tools/generators/package.json`

This record is the only file added after `3985e5b`.
