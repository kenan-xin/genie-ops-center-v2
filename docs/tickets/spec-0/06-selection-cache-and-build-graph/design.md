# S0-06 design — selection-aware build graph and local cache proof

Bead: `genie-ops-center-v2-1rd.6`. Baseline: develop `7a20b93`, which contains the integrated G2 revision `3bafa24`.

This document records the approach agreed before implementation. Beads owns status. This document owns the approach only.

## Confidence

Confidence: 7.8/10.

The raises: the resolver, the app-owned identity check and the tooling import bans already exist and pass, so this ticket adds a hash contract on top of proven parts. The design invents no new selection format. It reuses `serializeSelection`, which is already documented as the source of selection truth.

The lowers: three behaviors are read from documentation and not yet measured in this repository. First, that an Nx `runtime` input runs from the workspace root and hashes its full standard output. Second, whether a dependent task hash propagates to its consumer, which the design works around rather than assumes. Third, the cost and stability of a test that drives the real Nx cache. Each is measured in the first implementation slice, before anything depends on it.

## What already exists, and is not rebuilt

- `tools/generators/src/selection/`: the data-only inventory reader, the resolver, `serializeSelection` and `fingerprintSelection`.
- The resolver already fails on an unknown id, a duplicate id, a missing entrypoint, a non-file entrypoint and an entrypoint that escapes its package.
- `apps/genie/src/registry.ts`: `assertSelectedIdentity` already checks the compiled declarations against the resolved ids, in both directions and in order.
- `packages/config/src/oxlint/boundaries.ts`: tooling cannot import a module, an app, a customer folder, a database driver or the core runtime entrypoint. Proven through the oxlint binary.
- The task edges `generate-registry -> build`, `build -> build-image`, and `generate-registry -> typecheck, test`.

## The gap

The `generate-registry` target declares `{ "env": "MODULE_INCLUDE" }` as a cache input. That raw value is the wrong thing to hash, for three reasons.

1. An unset variable and an empty variable produce the same hash. The resolver treats them as opposite selections: unset means every module, empty means none.
2. The raw value carries spelling the resolver discards. `alpha, beta` with a space and `alpha,beta` resolve to one identical selection, but they hash apart, so an identical selection misses its own cache entry.
3. A change to a module package name or entrypoint path changes the emitted registry but does not change the raw value.

## Design

### 1. The selection line, printed before the hash

A new script `tools/generators/src/selection/print.ts` reads `MODULE_INCLUDE`, reads the inventory and resolves the selection. It writes two lines to standard output:

```text
{"source":"explicit","ids":["placeholder"]}
metadata:<sha256>
```

The first line is `serializeSelection` verbatim. No second format is introduced. The second line is a digest over the selected entries' id, package name and entrypoint path, in resolved order. The digest is what makes a package rename or an entrypoint move invalidate the cache, even for a module the application does not depend on.

Unset prints `"source":"unset"` with every id. Explicitly empty prints `"source":"explicit"` with an empty list. The two can never collapse.

The script exits non-zero with the resolver's message when the selection is not valid. A build that cannot resolve its selection must not reach a cache lookup.

### 2. Nx reads that script as a runtime input

In `apps/genie/package.json`, the `generate-registry` input `{ "env": "MODULE_INCLUDE" }` is replaced by:

```json
{ "runtime": "node tools/generators/src/selection/print.ts" }
```

Nx runs the command itself while it computes the hash, so every entrypoint is covered by construction. A direct `nx run`, a `pnpm` script and the `docker build` stage all get the same treatment. There is no wrapper for a developer to forget.

The same input is added to the app's `build`, `typecheck` and `test` targets. Those targets already depend on `generate-registry`, and Nx is documented to fold a dependency's hash into its consumer. The input is declared anyway, because the alternative is to depend on that behavior without measuring it. The first implementation slice measures it and records the result here.

`nx.json` is not edited. The `build-storybook` and `test-storybook` defaults there keep their `MODULE_INCLUDE` env input, because the Storybook host belongs to S0-10 and its child `2cg`. That child consumes this contract later. It is not corrected here.

### 3. Generation takes its workspace root as a parameter

`apps/genie/tools/generate-registry.ts` gains `--root <path>`, defaulting to the checkout it sits in. Nothing about the root is inferred from a hidden global.

This is the isolation plumbing. Two concurrent customer selections run against two staged roots, exactly as `build-fixture-image.ts` already stages a workspace outside the repository. Neither run can write the other's `src/modules.ts`, because neither knows the other's root.

Generation needs no installed dependencies. It reads `package.json` metadata and writes text. A staged root for a concurrency proof therefore costs a file copy, not an install.

### 4. A staleness guard between generation and build

A new script `apps/genie/tools/check-registry.ts` resolves the selection again, emits the registry text again with the existing `emitRegistryModule`, and compares it byte for byte against `src/modules.ts` on disk. A difference fails the build with the selection it found and the selection it expected.

The comparison is exact, because `emitRegistryModule` is deterministic given a selection. No header field is added and no comment is parsed.

The guard closes the window between generation and bundling: a registry left by another selection, a registry restored for a different hash, or a hand-edited file all fail closed rather than being bundled.

### 4a. Why this ticket does not claim the application root

Two builds of this project in one checkout share `apps/genie/.next`, so they can mix one output tree, and Nx can then cache the result. Three mechanisms were tried and each failed in a way worse than the hole.

A lock file outlives a build killed by a signal, so a crash blocked every later build in that checkout. A socket file fixed that but needed a recovery step, and two builds could each judge one abandoned path dead, with the second removal deleting the first's live socket, leaving two owners. A port derived from the root path collided with unrelated programs and denied builds that were perfectly valid, which attacks the supported path: isolated roots must always work.

Node has no advisory file lock, so the textbook mechanism needs a new dependency, which is a separate decision on a shared surface.

Two builds of one project in one workspace are already unsupported for every other target here. `test`, `typecheck` and `build-storybook` all write shared outputs and nothing claims those either. The owner decided on 2026-09-22 to keep the registry checks, document the limit and track the residual hole separately (genie-ops-center-v2-vst).

The superseded text follows, kept because the evidence refers to it.

### 4a-superseded. One owner per application root, added after review

Checking the registry is not enough, because the registry is not the artifact. Two builds in one checkout write into one `apps/genie/.next`. Each can find its own registry intact at both boundaries while the other writes the same output tree, and Nx then caches that mixed tree under a legitimate selection hash. Declaring `.next` as an output is what made such a tree cacheable.

`apps/genie/tools/build.ts` therefore owns the build: it takes the application root, runs the steps, and releases it in a `finally`. A second build fails at once instead of waiting.

The claim is a listening port on the loopback interface, derived from the application root. A lock file outlives the process that wrote it, so a crashed build would block every later build until somebody deleted the file. A socket file fixed that but needed a recovery step, and two builds could each judge one abandoned path dead, with the second removal deleting the first's live socket, leaving two owners. A port has no filesystem entry: binding either wins or fails, nothing is inspected or removed, and the kernel takes the address back however the process ends. The one cost is that an unrelated program holding that port refuses the build, which the error message states.

This reverses the rejection of a root lock recorded below. That rejection was about the registry file and predates the artifact hole, and its stated cost, stale-lock recovery, is the cost this mechanism does not carry.

### 4b. The registry guard on both sides of the bundler

The `build` steps run it twice, before the bundler and after it. One check before the bundler settles nothing on its own, because the bundler reads the registry minutes later and a second build in the same checkout can rewrite it in between. The second check turns that race into a failed build. It proves the registry was the expected one at the start and at the end, not at every instant between, so two selections that must run at once still get two build roots.

### 5. The customer entrypoint stays `MODULE_INCLUDE`

`readModulesFile` has no caller today and `customers/` does not exist. The customer entrypoint in this repository is the `MODULE_INCLUDE` build argument, which the runtime input already covers.

`readModulesFile` is left unchanged for S0-11, which owns the customer image matrix. No new environment variable is introduced, so `docs/architecture/environment-contract.md` needs no change.

## Tests

### Fast layer, no install, in `tools/generators`

- `print.ts` output for unset, explicitly empty, one module and every module. Four distinct strings.
- An invalid selection exits non-zero and prints the resolver message.
- A package name change and an entrypoint path change each change the metadata digest.
- A module the selection excludes is never evaluated. The existing throwing fixture under `__fixtures__/throwing-module/` is the proof.
- Two `generate-registry --root` child processes run concurrently against two staged roots. Each root holds its own correct registry afterwards.
- The staleness guard passes on a fresh registry and fails on a registry written for another selection.

### Real cache layer, in the app integration suite

This layer runs Nx against a temporary `NX_CACHE_DIRECTORY`, so it never reads or writes the developer's cache.

- Run `generate-registry` for two selections on one revision. Record the generated bytes for each.
- Repeat an identical selection. Assert a cache hit and identical restored bytes.
- Delete `src/modules.ts`, then run the cached selection. Assert the file is restored with the recorded bytes before any consumer runs.
- Assert unset and explicitly empty restore different content.
- Assert the declared edges from `nx show project @genie/app --json`, not from a cache label.

This suite rewrites the generated `apps/genie/src/modules.ts`, which is a build artifact. It restores the checkout selection when it finishes, and it runs serially.

### Recorded runs, in `evidence.md`

Real `next build` runs are minutes each, so they are recorded rather than automated: build selection A, build selection B, then rebuild A on the same revision. The restored bundle content is compared, with exact commands and observed output written into the ticket evidence file.

## Shared paths

One file outside this ticket's own new files is edited:

- `apps/genie/package.json`: the `nx.targets` input and dependency metadata, and the `build` script.

`nx.json`, `pnpm-lock.yaml`, the root `package.json` and every package export list are not edited.

## Out of scope

No remote cache provider. No second registry. No shared mutable selection file. No change to `module:new` or `tenant:new` templates, the migrator runtime, the Storybook host or the devtools. No cache-disabled proof.

The downstream image matrix stays open: S0-11 owns it, and this ticket does not close it.

## Open questions

None blocking. Two are answered by measurement in the first slice: whether a dependent task hash propagates to its consumer, and the wall-clock cost of the real cache suite.

## Assumptions

- Nx 23.2.1 runs a `runtime` input command from the workspace root and hashes its complete standard output, including a second line.
- Node 26 runs a `.ts` entry directly, as the existing `node tools/generate-registry.ts` script already relies on.
- `apps/genie/src/modules.ts` is a generated artifact that no gate expects to find unchanged.
