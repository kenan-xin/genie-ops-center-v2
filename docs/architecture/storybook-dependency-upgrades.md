# Storybook resolver compatibility and upgrade path

Recorded 2026-09-20 for [S0-02](../tickets/spec-0/02-storybook-compatibility-g1/index.md).

Removal backlog: `genie-ops-center-v2-8c2` (P4). Live status and assignment remain in Beads.

## Status and scope

The user approved the stable workaround for the bounded S0-02 correction pass on 2026-09-20. Adoption must follow the existing prerequisite and shared-file handoff gates; approval does not establish G1 acceptance or authorize branch integration. Beads owns implementation status. The S0-02 toolchain maintainer owns adoption; the future removal item remains unassigned.

Here, **v7 means vite-tsconfig-paths v7**, distinct from the TypeScript 7 compiler. This is development tooling maintenance, with no expected application rewrite or database migration.

## Why the workaround exists

The recorded scratch baseline used this dependency chain:

```text
@storybook/nextjs-vite@10.6.0
└─ vite-plugin-storybook-nextjs@10.6.0
   └─ vite-tsconfig-paths@5.1.4
      └─ tsconfck@3.1.6
         └─ optional TypeScript peer ^5.0.0
```

Optional permits an absent peer, not an incompatible installed peer. In the probe, the TypeScript 6 tooling alias did not satisfy that range, so fresh strict installation failed. A frozen installation alone did not expose the problem.

The proposed addition to `pnpm-workspace.yaml` is narrowly version-scoped:

```yaml
packageExtensions:
  "vite-tsconfig-paths@5.1.4":
    dependencies:
      typescript: "5.9.3"
```

This adds a real dependency to the parent of tsconfck. The scratch probe verified that tsconfck resolves TypeScript 5.9.3, while the root compiler remains TypeScript 7.0.2 and Nx's tooling API remains TypeScript 6.0.3. The TypeScript 6 alias wrapper version was 6.0.2; record wrapper and resolved API versions separately when refreshing evidence.

No peer range is widened, strict checks are not suppressed, and no library source is patched. Preserve disabled automatic peer installation, release-age policy and the build-script allowlist. Keep the official Nx Storybook plugin, one nonempty component-test target and loopback-only serving. Compatibility-only ESLint is a separate approved development dependency; Oxlint remains the sole configured and executed linter.

## Costs and limits

| Cost | Consequence |
| --- | --- |
| Third development TypeScript version | Additional installation footprint and maintenance; it must not become the workspace compiler |
| Deprecated/unmaintained tsconfck remains | Peer compatibility is repaired, maintenance status is not |
| Locally owned metadata extension | This is not an upstream Storybook fix; review it on every relevant dependency update |
| Exact version scope | Re-evaluate when the resolver version changes; never silently broaden the selector |
| Older parser capability | Recheck newer tsconfig features, especially if native TypeScript parsing is enabled |

The alternative scratch override to vite-tsconfig-paths 7.0.0-alpha.3 removed tsconfck and TS5 and passed bounded tests, but crossed Storybook's declared dependency range and introduced a beta parser. It is evidence for a future upgrade, not approval to adopt a prerelease. The prior registry investigation reported that Storybook 11.0.0-alpha.1 still requested the v5 resolver; Storybook 11 was not tested. These are historical observations, not current release guarantees.

## Upgrade trigger and procedure

Review this backlog item at each Storybook/Nx/resolver dependency refresh. The preferred trigger is a stable vite-tsconfig-paths v7 release with a tsconfck-free dependency graph **and** a compatible Storybook Next.js integration whose declared dependencies support it. Another stable, supported tsconfck-free release can satisfy the same removal goal; the major number alone is not the goal.

1. Check current upstream package metadata, changelogs and migration guidance. Confirm Storybook/Nx/Vitest/Node compatibility, aligned Storybook package versions, resolver platform support and any removed options such as `parseNative`. Do not infer compatibility from dist-tags or an old successful probe.
2. Capture the last passing source revision, manifests, pnpm version and lockfile. Use an isolated checkout for the candidate and coordinate ownership of shared dependency files with S0-02's maintainer.
3. Upgrade the aligned Storybook packages to the supported release. Remove only the obsolete TypeScript 5 package extension and any superseded resolver override. Retain the TypeScript 6/7 aliases and compatibility-only ESLint until their independent removal conditions are met.
4. Generate the candidate lockfile under unchanged strict dependency policies. Test fresh resolution in a disposable clone without lockfile or node_modules, then test a separate clean frozen installation using the candidate lockfile. Record both results; neither substitutes for the other.
5. Inspect the dependency graph and actual package-local resolution. Confirm the Storybook resolver path no longer contains tsconfck or isolated TS5, and that the root compiler and Nx API still resolve correctly. Explain any remaining TS5/tsconfck from unrelated consumers rather than forcibly removing them.
6. Run the verification matrix below against the exact candidate revision. Integrate only after the required review and integration proof; close the backlog item only after the supported replacement is adopted and removal is verified.

If v7 becomes stable before Storybook supports it, keep the bridge or propose a separately reviewed, narrowly scoped override with explicit compatibility ownership. Stability alone does not make an out-of-range override upstream-supported.

## Required verification

| Proof | Acceptance |
| --- | --- |
| Fresh and frozen installs | Both pass independently with strict policies unchanged |
| Official Nx inference | Plugin loads; intended serve/build targets and exactly one component-test target resolve |
| Compiler, lint and build | Nx-run affected build/test/lint/typecheck pass; uncached Storybook build and browser targets run explicitly when needed; only Oxlint runs |
| Component behavior | Nonempty interaction/a11y tests pass; empty discovery and intentional assertion failure make the test target fail |
| Alias resolution | An inherited wildcard tsconfig mapping resolves in a real TSX story; removing the mapping fails, restoring it passes |
| Serve | Persisted loopback/no-open settings work; Storybook itself reports successful smoke, not just Nx's outer status |
| Graph and cache | Relevant source, config and lockfile changes select/invalidate the correct targets; representative repeat runs reuse valid cache |
| Platform and integration | Install/build/browser checks pass on supported CI platforms; evidence records exact source, versions and commands; full G1 obligations remain separate |

Rollback by restoring the known-good manifests, lockfile and any changed tooling configuration together, reinstalling from the frozen lockfile and rerunning the affected checks. Do not weaken peers or independently edit the lockfile to salvage a failed upgrade.

## Independent future upgrades

| Change | Separate removal condition |
| --- | --- |
| Storybook 11 / newer Vitest | Stable supported combination, including official Nx plugin support, with fresh compatibility evidence |
| TypeScript 6 API alias | Nx and all relevant tooling consumers support the replacement API and pass verification |
| Compatibility-only ESLint | No remaining installed tooling dependency requires its peer contract |

None of these is automatically required to remove tsconfck, and removing tsconfck does not justify removing them.

## Recorded evidence

Prior scratch probes used S0-02 base `22e9d9c046348a2876c6af3a40b648fdcd353de1`. The stable isolation probe reported fresh strict and clean frozen installs, 103 unit tests, 11 browser tests, typechecking, Oxlint and Storybook build passing. The alpha probe additionally demonstrated inherited alias failure/pass behavior. These runs were not repeated for this documentation change and do not prove current branch acceptance, the full affected/cache matrix or every CI platform.

- [Stable workaround and TypeScript alias probe](/home/kenan/.traycer/epics/0489dfa0-8d29-4eef-a10e-da865988d4d3/artifacts/s002-typescript-alias-probe/index.md)
- [v7 alpha comparison and resolver probe](/home/kenan/.traycer/epics/0489dfa0-8d29-4eef-a10e-da865988d4d3/artifacts/s002-paths-v7-alpha-probe/index.md)

These local evidence links belong to the current Traycer epic. This document retains the upgrade contract for repository readers without access to those artifacts.
