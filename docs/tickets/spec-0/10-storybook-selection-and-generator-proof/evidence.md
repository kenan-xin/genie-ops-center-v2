# S0-10 evidence — Storybook selection, confidentiality and cache

Bead: `genie-ops-center-v2-1rd.10`. Owned child: `genie-ops-center-v2-2cg`.
Branch: `feature/s0-10-storybook-selection-confidentiality`, from develop
`cb35129`. Beads owns status; this file records what ran.

Versions: Nx 23.2.1, Node v26.9.0, pnpm 12.4.2, Storybook 10.6.0, Vitest
4.1.11, Vite 8.3.0, Playwright 1.63.0.

Commits (local, not pushed):

| Commit | Subject |
| --- | --- |
| `32b5b36` | `fix(storybook): hash the resolved selection and track story owners` |
| `777c474` | `feat(ui): add the shared theme token and provider seam` |
| `2b088cc` | `test(storybook): prove the selection, confidentiality and cache matrix` |
| `0396503` | `test(storybook): exercise the generated module through the matrix` |

The approach is in [design.md](design.md).

## The `2cg` fix

`nx.json`'s `build-storybook` and `test-storybook` `targetDefaults` replaced
`{ "env": "MODULE_INCLUDE" }` with the S0-06 pre-hash contract
`{ "runtime": "node tools/generators/src/selection/print.ts" }`. The raw value
cannot tell an unset variable from an empty one; the runtime input prints the
canonical serialized selection, where `source` distinguishes them, plus a digest
over the selected entries' identity, package name and entrypoint path.

Direct measurement of the contract on this revision:

```text
$ MODULE_INCLUDE=nope node tools/generators/src/selection/print.ts
Unknown module id: nope. The inventory holds: placeholder.        exit 1

$ MODULE_INCLUDE= node tools/generators/src/selection/print.ts
{"source":"explicit","ids":[]}                                    exit 0

$ node tools/generators/src/selection/print.ts
{"source":"unset","ids":["placeholder"]}                          exit 0
```

`apps/storybook/testing/targets.test.ts` asserts the resolved graph: both
cacheable targets declare the runtime input, neither hashes `MODULE_INCLUDE`,
both reference `storybookOwners`, the named input covers all four owner trees,
`build-storybook` declares `storybook-static` and is cached, and the serve/watch
targets are not cached.

## Selection and cache matrix

`nx run @genie/storybook:test:integration` → **29 passed, 1 file, 84.2 s**.
Every case reads the artifact or the restored `index.json`, never a cache label
alone. The suite stages the workspace and gives Nx a stage-local
`NX_CACHE_DIRECTORY`/`NX_WORKSPACE_DATA_DIRECTORY`, with every inherited `NX_`
variable dropped.

| Case | Selection | Result |
| --- | --- | --- |
| Two explicit selections | `second-fixture`, then `placeholder` | Each cold, each builds its own module only; neither carries the other's needle |
| Identical selection | `second-fixture` again | Cache hit; `index.json` byte-identical to the first run |
| Explicitly empty | `""` | Cold; no `modules-*` entry; no module needle anywhere in the static output |
| All available | unset | Cold after an empty build (so unset and empty are distinct at the hash); holds both modules |
| Identical unset | unset again | Cache hit; `index.json` identical |
| Unknown id | `does-not-exist` | Non-zero for both `build-storybook` and `test-storybook`, `Unknown module id` |
| Deleted output | `second-fixture` | Directory removed, then `[local cache]`; `index.json` identical to the first run |
| Inventory change | remove the second module, unset | Cache miss although `MODULE_INCLUDE` did not change; the removed module disappears from discovery |
| Inventory change | add it back, select it | Discovered with no host or CI edit |
| Headless module | a module with an entrypoint and no stories | Selectable, builds, contributes no story, and pulls in no other module |
| Owner mutation | story, component, token, provider, message catalogue | Each append-comment mutation gives a cache miss on `build-storybook` |
| Owner mutation | a module's `package.json` version | Cache miss; the runtime digest covers only id, package name and entrypoint, so only the manifest input catches it |
| Owner mutation | story, on `test-storybook` | Cache miss |

## Confidentiality scan

The scan walks every file under `storybook-static` at any depth and searches for
needles unique to the placeholder module. Each needle was confirmed present in a
placeholder build before it was trusted:

| Needle | Placeholder build | Empty build | `second-fixture` build |
| --- | --- | --- | --- |
| `Modules/Placeholder` | present | absent | absent |
| `A fixture row. It proves layout, not persistence.` | present | absent | absent |
| `@genie/module-placeholder` | present | absent | absent |
| `Modules/Second fixture/Probe` | absent | absent | present |
| `The second fixture module renders in the workbench.` | absent | absent | present |

`placeholder:read` was tried and dropped: it appears in three files even in the
empty build (Storybook's own bundle), so it cannot distinguish the two builds.
The scan reads `index.json`, every `assets/*.js` chunk, the HTML, the manifests
and the fixtures; the build emits no `.map` file, and a case asserts that, so no
source map can carry excluded source. A control case proves the same search
finds the included module, so a scan that matched nothing could not pass.

## The component-test layer

- Nonempty collection: the run reports a positive `Tests N passed`, so
  `--passWithNoTests=false` cannot be satisfied by an empty run.
- Failure propagation: a story whose `play` asserts absent text fails the run
  with `Unable to find an element with the text`; a story with an image that has
  no `alt` fails with the axe rule `image-alt`. Each is written into the stage,
  observed, and removed; a clean run then passes.
- Cache: `test-storybook` re-runs when the selection changes and hits on an
  identical one.

## Generated UI and the MCP addon

- The S0-08 generator is run into the stage (`nx g @genie/generators:module-new
  generated-proof`). Its stories appear in `index.json` under selection
  `generated-proof`, are absent under `placeholder`, and the component-test count
  rises above the empty selection's. Nothing in the host or CI names it.
- The development server is started twice and driven over the real MCP
  protocol: `initialize`, the initialized notification, then a `tools/call` of
  the addon's `docs-list`. With the empty selection the tool returns the UI and
  Core content and no `modules-` entry and no `placeholder:` text; with
  `second-fixture` it returns that module's content and no placeholder content.
  The story index the same server exposes is checked the same way. The static
  build carries no server, so no endpoint ships.

## Image exclusion

`deploy/Dockerfile` copies only the app, `packages`, `tools` and the root
manifests; `.dockerignore` excludes `apps/storybook`, `**/storybook-static` and
`**/*.stories.tsx`. `apps/storybook/testing/targets.test.ts` asserts both, and
asserts the Dockerfile never mentions Storybook. The real image matrix is
S0-11's.

## Gates

| Command | Result |
| --- | --- |
| `nx affected -t lint typecheck test build build-storybook test-storybook --base=develop --parallel=1` | Success, 7 projects, 25 tasks, 0/25 cache, 56.5 s |
| `nx run-many -t test -p @genie/storybook @genie/ui --skip-nx-cache` | `@genie/storybook` 9 passed (1 file); `@genie/ui` 3 passed (2 files) |
| `nx run @genie/storybook:test:integration --skip-nx-cache` | 29 passed (1 file), 84.2 s |
| `MODULE_INCLUDE=placeholder nx run @genie/storybook:test-storybook --skip-nx-cache` | 7 files, 20 tests passed |
| `oxfmt --check --disable-nested-config` | clean, 286 files |
| `npx supercov quality patch --base develop` | "Nothing introduced across 5 changed files. 10 changed files not reviewed." |

## Merged-tree re-verification

Local `develop` `3bf3efb` was merged into the branch as merge commit `563920b`
(parents `d2d026b` and `3bf3efb`), a merge and not a rebase; all seven S0-10
commits are preserved. develop's changes are present (the S0-07 core required
runner under `packages/core/testing` and `packages/core/tools`, the app runner
fixtures under `apps/genie/testing`, and the core script changes), and the S0-10
paths are intact.

Structural check on the merged tree, from `nx show project @genie/storybook
--json`: `storybook` cache false and continuous; `build-storybook` cache true,
inputs `["default","^default","storybookOwners",{"runtime":"node
tools/generators/src/selection/print.ts"}]`, output `storybook-static`;
`test-storybook` cache true with the same inputs; `static-storybook`
continuous. `@genie/app` and `@genie/core` `test:integration` both resolve to
`node tools/run-required-tests.ts`, cache false, with the app's `dependsOn`
unchanged.

Re-run on `563920b`:

| Command | Result |
| --- | --- |
| `nx run @genie/storybook:test:integration --skip-nx-cache` | 29 passed (1 file) |
| `nx run-many -t build-storybook test-storybook -p @genie/storybook --skip-nx-cache` | build succeeded; 7 files, 20 tests |
| explicit cache proof, isolated cache and state | unset cold `0/1`, empty cold `0/1`, unset again `1/1` `[local cache]` restoring 27 entries / 7 modules, unknown id fails |
| `nx affected -t build test lint typecheck --base=3bf3efb --parallel=1` | Success, 7 projects, 23 tasks |
| `oxfmt --check --disable-nested-config` | clean, 289 files |
| `npx supercov quality patch --base 3bf3efb` | "Nothing introduced across 5 changed files. 13 changed files not reviewed." |

The same independent reviewer confirmed the merge resolution and the theme and
provider seam introduce no new scope or confidentiality issue; the confirmation
is recorded in the session report.

## Not proven here, and the limits

- The MCP tool call covers the addon's `docs-list` tool, which is the content
  tool an agent uses to read the storybook. The other tools (`stories-preview`,
  `docs-show`, `stories-find-by-component`, `test-run`) read the same
  selection-resolved index; they are not each driven here, so a future change
  that served a different content source would need its own proof.
- Explicit custom-app story selection has no positive mechanism. The host never
  globs a customer folder (guarded by a test), but there is no way to select a
  customer app's own composition stories, and Section 0 has no customer app.
  Filed as `genie-ops-center-v2-19o`; the mechanism is a host interface decision
  that belongs with S0-11's customer wrapper.
- A real customer image is S0-11's; this record proves the exclusion rules, not
  a built image.
- The `static-storybook` target (`4au`) keeps no host restriction. Fixing it
  means choosing between pinning its host to loopback and dropping the target
  through `staticStorybookTargetName`, and the owner deferred that decision; it
  stays deferred here and is not silently changed.
- The token/provider seam is a Section 0 fixture. The full primitive catalogue
  and the tenant-overridable layer remain Section 3's.
- The staged matrix takes the free port it binds and kills the whole dev-server
  process group, but it does not prove cross-platform staging; the
  `pnpm install` step assumes a warm store.

## Independent review

One independent semantic review (openrouter, GPT Sol medium; artifact
`s0-10-independent-semantic-review` in the epic). No blocker. Four findings,
all dispositioned:

| Finding | Severity | Disposition |
| --- | --- | --- |
| `storybookOwners` covered only `src/**/*`, so a module manifest change that the runtime digest does not see could restore stale output | major | Fixed: `packages/modules/*/package.json` and `tsconfig.json` are inputs, with a version-bump mutation case |
| The headless path and explicit custom-app selection were absent | major | Headless fixed: a storyless module is selectable, builds and contributes no story. Custom-app filed as `genie-ops-center-v2-19o`, with a guard that no customer folder is globbed |
| The MCP claim exceeded the proof, which read only `/index.json` | major | Fixed: the `docs-list` tool is now driven over the real MCP protocol and its response is scanned |
| The source-map case passed only because no map existed | minor | Fixed: the case now states the no-source-map policy and requires a future map to be scanned |

Confirmed sound: the pre-hash contract, raw-env removal, unset-versus-empty and
unknown-id failure, uncached serve/watch, non-vacuous needles and the empty
output scan, cache detection and restoration, the inventory and generated-module
cases, unit/story separation and failure propagation, the minimal theme seam, and
no weakening of G1, the S0-09 diagnostics stories or the devtools production
exclusion.
