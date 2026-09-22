# S0-06 evidence — selection-aware build graph and local cache

Bead: `genie-ops-center-v2-1rd.6`. Branch: `kenan-xin/feature-s06-slection-aware-application-build`.

Baseline at implementation: develop `7a20b93`, which contains the accepted G2 revision `3bafa24`. **Integrated** into local develop by fast-forward, twice: `7a20b93 → 1bd039e` (commits `5f98706`..`1bd039e`) and `1bd039e → 01b8a5e` (commits `2ad3622`, `01b8a5e`), no squash or rebase. Develop has since advanced to `4a9fd37` on S0-08; `apps/genie/**` and `tools/generators/src/selection/**` are unchanged across `01b8a5e..4a9fd37`, so this proof transfers. This record covers the owned slice only.

Versions: Nx 23.2.1, Node v26.9.0, Vitest 4.1.11, pnpm 12.4.2.

The approach is in [design.md](design.md).

## Integrated re-verification, closure review 2026-09-22

Re-run on the integrated revision (`01b8a5e`) by an independent reviewer, on this branch, to decide acceptance. Nothing here is a new plan; it is the same evidence, re-measured.

```bash
nx run-many -t lint typecheck test -p @genie/app @genie/generators --skip-nx-cache   # green, 7 tasks
nx run @genie/generators:validate --skip-nx-cache                                    # 31 passed
vitest run --config vitest.integration.config.ts testing/selection-cache.test.ts     # 6 passed, 16.8s
```

The recorded build matrix was re-measured end to end on one revision with one isolated `NX_CACHE_DIRECTORY`/`NX_WORKSPACE_DATA_DIRECTORY`, digesting every file under `apps/genie/.next` (excluding Next's own cache):

| Step | Selection | Cache | Registry | Needle files in `.next` | `standalone/server.js` | Digest |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `placeholder` | 0/2 hit | imports the placeholder | 15 | 3 | `1e22b4afe8acf483` |
| 2 | explicitly empty | 0/2 hit | no import | 0 | 3 | `f47cfb574298d5ab` |
| 3 | `placeholder` again | 2/2 hit | imports the placeholder | 15 | 3 | `1e22b4afe8acf483` |
| 4 | `placeholder`, after `rm -rf apps/genie/.next` | 2/2 hit | imports the placeholder | 15 | 3 | `1e22b4afe8acf483` |

The absolute digest strings differ from the earlier table because the digest command is not frozen; the properties are what the run re-establishes: two selections give different trees, an identical selection restores its own tree byte for byte, and deleting the output restores it from the cache before any consumer reads it (`[local cache]` on both tasks). The needle is `__drizzle_migrations_placeholder`; the count here includes source maps, unlike the earlier non-map count.

The isolation contract was re-measured the same way, with two full copies of the checkout (including `node_modules`) built concurrently, `placeholder` in one root and the explicitly empty selection in the other:

| Check | Root A, `placeholder` | Root B, explicitly empty |
| --- | --- | --- |
| Build exit | 0 | 0 |
| Final registry | imports the placeholder | no import |
| Files in `.next` carrying the needle | 15 | 0 |
| Standalone `server.js` | 3 | 3 |

The checkout's own registry was byte-identical before and after. A first attempt that symlinked the root `node_modules` into the stage failed both builds with Turbopack's "symlink points out of the filesystem root" — a defect of that staging shortcut, not of the product; full copies reproduce the recorded result.

## Two defects this work found

Both were measured on 2026-09-22, on this baseline, before the change that fixes them.

### A consumer compiled the wrong registry

`generate-registry` declared the selection as a cache input. `build`, `typecheck` and `test` did not: they named their files and depended on generation. Nx computes a consumer's hash from the files on disk before generation rewrites them, so a consumer was restored from the previous selection's cache entry.

Observed, with the selection changed from `placeholder` to explicitly empty:

```text
> nx run @genie/app:generate-registry
> nx run @genie/app:typecheck  [existing outputs match the cache, left as is]
  Cache:             1/2 hit (50%)
```

Generation correctly wrote the empty registry. The typecheck never read it. After the fix, the same sequence reports `0/2 hit`, and an identical repeat reports `2/2 hit`.

### A cache hit restored no bundle

The `build` target declared no `outputs`, so Nx cached its terminal output and nothing else. Delete `.next`, run `build` on an unchanged selection, and the run reported success with no bundle on disk. `test:integration` depends on `build`, so a consumer could run against a missing build.

`nx show project @genie/app --json` before the change reported `build` outputs as `undefined`.

## What changed

- `tools/generators/src/selection/print.ts`: prints the canonical serialized selection and a digest of the selected entries' id, package name and entrypoint path. New.
- `apps/genie/package.json`: the selection is declared as an Nx `runtime` input on `generate-registry`, `build`, `typecheck` and `test`. It replaces `{ "env": "MODULE_INCLUDE" }`. `build` now declares `.next` as its output, excluding Next's own cache. The `build` script runs the registry guard first.
- `apps/genie/tools/generate-registry.ts`: takes `--root`, so a build root is a parameter and never an inferred global.
- `apps/genie/tools/check-registry.ts`: compares the registry on disk against the text the current selection generates, byte for byte, before `next build`. New.
- `apps/genie/vitest.config.ts`: the app's own `tools/` tests join the fast run.

`nx.json` is not edited. The `build-storybook` and `test-storybook` `MODULE_INCLUDE` env inputs there are still wrong for the same reason, and they belong to S0-10 and its child `2cg`.

## Fast tests

```bash
nx run-many -t lint typecheck test -p @genie/app @genie/generators
```

All green. The selection cases are:

- `tools/generators/src/selection/print.test.ts`, 13 cases. Unset, explicitly empty, one module and every module print four distinct values. Two spellings of one selection print one value. Order changes the value. An entrypoint move changes the digest. A module the selection excludes changes nothing. A package name that no longer matches its id is refused while the inventory is read, before any hash. An unknown id exits non-zero with nothing on standard output.
- `apps/genie/tools/registry-roots.test.ts`, 10 cases. `--root` without a path is refused. Two concurrent child processes generate into two staged roots, and neither root holds the other's module. The guard passes on a fresh registry and fails on another selection's registry, on a hand edit, on a missing registry, and between unset and explicitly empty when both import the same packages.
- `apps/genie/tools/build-graph.test.ts`, 7 cases. Read from `nx show project @genie/app --json`: generation precedes build, typecheck and test; build precedes the image; generation declares its output and is cached; the image target is not cached; all four targets declare the selection input; the registry guard sits on both sides of the bundler in `BUILD_STEPS`; none hashes a raw `MODULE_INCLUDE` value.

## Real cache matrix

```bash
vitest run --root apps/genie --config vitest.integration.config.ts testing/selection-cache.test.ts
```

6 cases, 13 seconds, all green. Every case reads the restored registry's bytes, never a cache label alone.

The suite runs against a temporary `NX_CACHE_DIRECTORY` and a temporary `NX_WORKSPACE_DATA_DIRECTORY`. Both are needed. Nx 23 keeps its cache metadata in a database under the state directory, and a fresh cache directory alone still reported hits from the checkout's database. An earlier measurement in this session was void for exactly that reason.

## Recorded build runs

One revision, one workspace, isolated Nx cache and state. The digest is a sha256 over every file under `apps/genie/.next`, excluding Next's own cache directory.

| Step | Selection | Cache | Registry | Bundle digest |
| --- | --- | --- | --- | --- |
| 1 | `placeholder` | 0/2 hit | imports the placeholder | `1a02078021b5ace6` |
| 2 | explicitly empty | 0/2 hit | no import | `0e0dd37d8a7e1561` |
| 3 | `placeholder` again | 2/2 hit | imports the placeholder | `1a02078021b5ace6` |
| 4 | `placeholder`, after `rm -rf apps/genie/.next` | 2/2 hit | imports the placeholder | `1a02078021b5ace6` |

These digests are from the final code. Earlier runs in this session reported different values because the build tooling itself changed between them; each run is internally consistent, and only the last one describes what is committed.

Step 4 restored three `server.js` files under `.next/standalone`, so the standalone server came back out of the cache and not from a rebuild.

### A concurrent build in one checkout

A review found that one check before the bundler settles nothing on its own. The bundler reads the registry minutes later, so a second build in the same checkout can rewrite it inside that window and the first build bundles the other selection. The build script now runs the guard again after the bundler.

Measured: a `placeholder` build, with a second process rewriting the registry for the empty selection every two seconds throughout.

```text
nx exit: 1
.../apps/genie/src/modules.ts is not the registry this selection generates.
The selection is explicit [placeholder]. A concurrent build in this checkout,
another build root, a restored cache entry or a hand edit left a different
registry. Give each selection its own build root, then regenerate.
 NX   Running target build for project @genie/app and 1 task it depends on failed
```

The build failed, so Nx cached nothing and no bundle from the wrong selection was stored.

The limit, stated plainly: the second check proves the registry was the expected one when the bundler started and when it finished. It does not prove every instant in between. A run that overwrote the registry and restored it inside the window would pass.

### Why checking the registry was still not enough

A second review found the deeper hole. The registry is not the artifact. Two builds in one checkout write into one `apps/genie/.next`, so a build can find its own registry intact at both boundaries while the other build writes the same output tree throughout. Nx then stores that mixed tree under a legitimate selection hash and restores it later. Declaring `.next` as an output, which this ticket did, is what made such a tree cacheable at all.

No check on the registry can see that, and this ticket does not close it. Three claim mechanisms were built and each failed review in a way worse than the hole, so the owner decided on 2026-09-22 to keep the registry checks, state the limit and track the rest separately (genie-ops-center-v2-vst). The attempts are recorded below because each names a trap worth not repeating. The superseded description of the mechanism follows.

No check on the registry can see that, so the application build refused the situation. `apps/genie/tools/build.ts` takes the application root before it runs any step, and releases it in a `finally`. A second build fails at once rather than waiting, because waiting would only queue a second writer behind the first.

The claim is a listening port on the loopback interface, derived from the application root. Two earlier mechanisms were wrong, and review found both.

A lock file outlives the process that wrote it. A build killed by a signal, a full disk or a lost machine left every later build in that checkout failing until somebody deleted the file by hand.

A socket file fixed that but needed a recovery step, and the recovery is what broke it. Two builds could each find the same abandoned path, each judge it dead, and the second removal would delete the first's live socket. Both would then be listening, on different inodes, and both would believe they owned the root. That is the exact situation the claim exists to prevent.

A port has no filesystem entry, so there is nothing to leave behind and nothing to clean up. Binding is the whole mechanism: the kernel grants the address to one process, refuses everybody else, and takes it back however that process ends. There is no recovery path, because there is no state that can go stale. The one cost is that an unrelated program holding that port refuses the build, and the error message says so.

Measured deterministically, with one process holding the root and a second selection then asking to build:

```text
held on port 62305
second build exit: 1
Error: Another build already owns .../apps/genie. Two builds in one checkout share
.next, so the cached bundle would mix both selections. Build each selection in its
own root. Nothing needs cleaning up: port 62305 is released when that build ends,
however it ends. If no build is running, an unrelated program holds that port.
```

The owner was then killed with `SIGKILL`, so none of its own cleanup ran. The next build took the root and succeeded.

Two unit cases in `apps/genie/tools/registry-roots.test.ts` hold the property directly. One kills an owner with `SIGKILL` and takes the root afterwards. The other asks for one root from eight builds at once and requires that exactly one is granted, which is the case the socket file failed.

An earlier attempt to measure this by starting two builds four seconds apart was invalid: an incremental build finished in 4.1 seconds, so the two never overlapped. Both reported success and neither proved anything. The recorded run below is the cold-build version of the same pair, where the windows did overlap.

Measured: build A with `placeholder` and build B with the empty selection, started four seconds apart in one checkout, on a cold build.

```text
B exit: 1
Error: Another build already owns .../apps/genie (pid 1146393 selection placeholder
at 2026-09-22T09:59:46.241Z). Two builds in one checkout share .next, so the cached
bundle would mix both selections. Build each selection in its own root, or remove
/tmp/genie-app-build-b361dc6fb5435701.lock if no build is running.

A exit: 1
 NX   Running target build for project @genie/app and 1 task it depends on failed
```

A failed too, and that is the correct outcome rather than a second defect. B was refused before it could write any bundle, but B's `generate-registry` task runs before its build step and had already rewritten the registry, so A's second boundary check caught it. Nothing was cached by either run. In every ordering the artifact is safe: while A holds the marker, B cannot reach the bundler at all.

An ordinary build is unaffected. After the concurrent pair, a clean `placeholder` build succeeded, `rm -rf apps/genie/.next` followed by the same build restored `81ef946f2bbac44d` from the cache with three `server.js` files under `.next/standalone`, and no marker was left behind.

This reverses an earlier choice in [design.md](design.md), where locking the shared root was rejected. That choice was made about the registry file, before the artifact hole was known. It is recorded here so the owner can overrule it.

### The guard, on the real checkout

```text
$ MODULE_INCLUDE= node tools/generate-registry.ts
$ MODULE_INCLUDE=placeholder node tools/check-registry.ts
.../apps/genie/src/modules.ts is not the registry this selection generates.
The selection is explicit [placeholder]. Another build root, a restored cache
entry or a hand edit left a different registry. Regenerate it.
exit: 1
```

## The isolation contract, proved

The supported way to build two selections at the same time is one build root each. This is the proof of that contract, and it is a positive one: both builds succeed, and each artifact carries its own selection and nothing of the other's.

Two roots were staged from this checkout, each a full copy including `node_modules`, and both were built at the same time, `placeholder` in one and the explicitly empty selection in the other.

```bash
for n in rootA rootB; do
  rsync -a --exclude='.next' --exclude='.git' --exclude='.nx' "$REPO/" "$STAGE/$n/"
done

# in each root, concurrently, with its own Nx cache and state:
( cd "$STAGE/rootA" && MODULE_INCLUDE=placeholder ./node_modules/.bin/nx run @genie/app:build ) &
( cd "$STAGE/rootB" && MODULE_INCLUDE= ./node_modules/.bin/nx run @genie/app:build ) &
wait
```

Result:

| Check | Root A, `placeholder` | Root B, explicitly empty |
| --- | --- | --- |
| Build exit | 0, succeeded | 0, succeeded |
| Final registry | `explicit`, imports the placeholder | `explicit`, no import |
| Files in `.next` carrying the placeholder module | 10 | 0 |
| Standalone `server.js` | 3 | 3 |

The artifact needle is `__drizzle_migrations_placeholder`, a string the placeholder module owns. It survives minification into the non-map server output, so the count is read from the built bundle and not from the registry that produced it. A bare module id would not do: an id such as `placeholder` also occurs as an ordinary HTML attribute in bundled code.

The checkout itself was untouched: its registry still read `unset` afterwards.

Neither build was denied, neither waited for the other, and neither artifact contains any trace of the other's selection. That is the isolation this ticket owes.

## Two builds in one root, which is misuse and not a contract

Two builds of `@genie/app` in one checkout write into one `apps/genie/.next`. This is unsupported. It is not a weaker form of the isolation contract above, and nothing here promises it works.

The same is already true of every other target in this repository. `test`, `typecheck` and `build-storybook` all write shared outputs, nothing claims those either, and Nx assumes one invocation per project at a time.

The earlier recorded run, where one shared-root build was refused and the other failed its own boundary check, is a misuse check. It shows the failure is loud rather than silent. It is not evidence of isolation, and it must not be read as such.

## The residual hole, stated plainly

Two builds of `@genie/app` in one checkout can still mix one `apps/genie/.next`, and Nx can cache the mixed tree. The registry checks catch the case where the generated registry itself changed, which is the cross-customer case they were built for, but they do not inspect the artifact.

This is deferred hardening of an unsupported path, not a gap in a supported one. The isolation contract is one root per selection, and it is proved above. Nothing documented promises that two builds may share one root.

### How much the registry checks actually cover

The residue is smaller than "two builds can mix an output tree" suggests, and the difference matters when judging whether a claim is worth its failure modes.

Two builds of the SAME selection produce the same registry and the same bundle. Interleaving them mixes two identical trees, so there is nothing to leak.

Two builds of DIFFERENT selections each run their own `generate-registry` immediately before their own build, and each checks the registry before and after its bundler. Work through the orderings and at least one build fails in every one of them, because the second generation lands inside the first build's window, and nothing ever writes a registry back. That is not an argument from the design: it is what the recorded concurrent run did. Build A failed on its own boundary check when build B's generation landed, build B was refused, and neither cached anything.

So the case that constitutes cross-customer leakage, two different selections, is caught. What is genuinely unguarded is chunk-level interleaving between two builds whose registries never disagree, which is the harmless case.

A future mechanism should check the artifact rather than claim the root: compare the module identities present in the built server output against the selection. One trap is already known. The module id survives minification as a string literal, but a bare id is not a safe needle, because an id such as `placeholder` also occurs as an ordinary HTML attribute in bundled code. The package name does not survive minification outside source maps. A marker the application itself reads is needed, and designing one belongs with `genie-ops-center-v2-vst`, not with a rushed edit here.

The supported way to build two selections at once is two build roots, which `generate-registry --root` exists for. That path is never denied.

Three claim mechanisms were tried and rejected:

- A lock file outlives a build killed by a signal, so a crash blocks every later build in that checkout until somebody deletes the file.
- A socket file removes that staleness but needs a recovery step. Two builds can each judge one abandoned path dead, and the second removal deletes the first's live socket, so both end up listening and both believe they own the root.
- A port derived from the root path has no staleness and no recovery, but it collides with unrelated programs and denies valid isolated builds, which attacks the supported path.

Node exposes no advisory file lock, so the textbook mechanism needs a new dependency and a `docs/core/tech-stack.md` entry, which is a separate decision on a shared surface.

## Not proven here

Each item below is named in the ticket's acceptance text or its scope, and each is owned by another ticket. None is an S0-06 obligation, and none is closed by this record.

- The customer image matrix stays open. S0-11 owns it (`coverage.md` R-3a "S0-11 images"; R-21..R-23a "S0-11 customer smoke"; AC-5 and AC-24 "S0-11 image"). This covers the fresh-image/database routes/tables/migration-history clause and the "staging histories" clause of the acceptance text; the image is built from the S0-06-declared `generate-registry → build → build-image` edge, which this ticket proves and does not cache.
- No image was built for this record. The recorded runs are host builds, so the *bundle* artifact is inspected and the *image* filesystem/migration files are S0-11's.
- "Change modules.txt" is untested because no task reads a `modules.txt` yet. `readModulesFile` still has no caller; R-3a makes the file input conditional on a reader, and the reader is S0-11's customer wrapper. The customer entrypoint in this repository is the `MODULE_INCLUDE` build argument, which the runtime input covers.
- The Storybook selection inputs in `nx.json` are unchanged and still hash raw `MODULE_INCLUDE`. S0-10 and its child `2cg` own them (`coverage.md` R-41b "S0-10"; design.md §2). `2cg` also owns the unset/empty artifact-content proof (`coverage.md` auxiliary table).
- The residual same-root artifact hole is deferred hardening of an unsupported path, tracked as `genie-ops-center-v2-vst` (task P3). The supported contract — one build root per selection — is proved above and is never denied.
- The real cache suite is collected and runs in `@genie/app:test:integration`, but is not named in the mandatory manifest in `apps/genie/testing/required-tests-guard.ts`. That manifest is the S0-05-owned acceptance helper (`07-.../index.md`: "Retain and extend G2's required-execution guard"); wiring the integration suite into CI is S0-11.
- Config/schema invalidation beyond the selection metadata digest (shared presets, exposed generator schemas) is AC-1, whose final integration is S0-11/S0-12.
