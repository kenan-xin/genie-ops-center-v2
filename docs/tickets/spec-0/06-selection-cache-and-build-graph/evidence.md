# S0-06 evidence — selection-aware build graph and local cache

Bead: `genie-ops-center-v2-1rd.6`. Branch: `kenan-xin/feature-s06-slection-aware-application-build`.

Baseline: develop `7a20b93`, which contains the accepted G2 revision `3bafa24`. Not integrated. This record covers the owned slice only.

Versions: Nx 23.2.1, Node v26.9.0, Vitest 4.1.11, pnpm 12.4.2.

The approach is in [design.md](design.md).

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
- `apps/genie/tools/build-graph.test.ts`, 6 cases. Read from `nx show project @genie/app --json`: generation precedes build, typecheck and test; build precedes the image; generation declares its output and is cached; the image target is not cached; all four targets declare the selection input; none hashes a raw `MODULE_INCLUDE` value.

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
| 1 | `placeholder` | 0/2 hit | imports the placeholder | `ead296ff0de1752d` |
| 2 | explicitly empty | 0/2 hit | no import | `ee5077253219ad78` |
| 3 | `placeholder` again | 2/2 hit | imports the placeholder | `ead296ff0de1752d` |
| 4 | `placeholder`, after `rm -rf apps/genie/.next` | 2/2 hit | imports the placeholder | `ead296ff0de1752d` |

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

No check on the registry can see that, so the application build now refuses the situation. `apps/genie/tools/build.ts` takes the application root before it runs any step, and releases it in a `finally`. A second build fails at once rather than waiting, because waiting would only queue a second writer behind the first.

The claim is a listening socket, not a file holding a process id. A third review found the reason: a lock file outlives the process that wrote it, so a build killed by a signal, a full disk or a lost machine leaves every later build in that checkout failing until somebody deletes the file by hand. The operating system closes a socket whatever ends the process, so a crash leaves nothing to clean up. The path may remain, and the next build finds nothing listening on it, clears it and takes the root. The socket lives in the operating system's temporary directory, keyed by the application root, so it is never a repository file and never reaches a cached output. Windows has no filesystem socket, and a named pipe is the same resource there.

Measured deterministically, with one process holding the root and a second selection then asking to build:

```text
owner holds the root
second build exit: 1
Error: Another build already owns .../apps/genie. Two builds in one checkout share
.next, so the cached bundle would mix both selections. Build each selection in its
own root. Nothing needs cleaning up: /tmp/genie-app-build-b361dc6fb5435701.sock is
released when that build ends, however it ends.
```

The owner was then killed with `SIGKILL`, so none of its own cleanup ran. The next build took the root and succeeded. A unit case covers the same crash in `apps/genie/tools/registry-roots.test.ts`.

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

## Not proven here

- The customer image matrix stays open. S0-11 owns it. Nothing in this record closes it.
- `readModulesFile` still has no caller. The customer entrypoint in this repository is the `MODULE_INCLUDE` build argument, which the runtime input covers. A `modules.txt` consumer belongs to S0-11.
- The Storybook selection inputs in `nx.json` are unchanged. S0-10 and `2cg` own them.
- The real cache suite is not in the mandatory integration manifest in `apps/genie/testing/required-tests-guard.ts`. That manifest belongs to the S0-05 harness, so adding an entry needs its owner.
- No image was built for this record. The recorded runs are host builds.
