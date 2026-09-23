# Module import spelling: separate packages, slash imports

Researched 2026-09-20. Research only; no implementation or compatibility spike performed.

Owner decision after this research: use `@genie/module-<name>` with existing capability folders `packages/modules/<name>/` folders. See [the canonical contract](../architecture/repository-layout.md#module-package-naming) and [rework plan](../tech-plans/module-naming-revision.md). The observations and rejected alias examples below remain historical evidence, not current layout requirements.

Superseded in part on 2026-09-23 by the `pg4` owner decision: excluded-module absence is proved at the build input, with a builder-stage prune of unselected `packages/modules/` folders, a check that the remaining folders equal the selection, and a failing-import test (Spec 0 AC-24). The advice below to verify exclusion in actual image files and traces stays a record of this research, not the current proof method.

## Recommendation

**Use the fallback `@genie/module-<name>` spelling for the proposed names: `@genie/module-contract-data` and `@genie/module-solution`.** Slash imports are possible without merging module packages, and one shared TypeScript mapping is a credible inexpensive option for bundled application code. However, the evidence does not establish that this one mapping alone meets this repository's full runtime, graph, cache and image-exclusion contract. Given the stated preference for hyphens unless slash spelling is demonstrably cheap, adopt no additional abstraction now.

The requested slash spellings are `@genie/module/contract-data` and `@genie/module/solution`. Existing source fixtures and boundary rules use plural `@genie/modules-*` and `@genie/modules/*`; the singular examples below describe the proposed naming, not an implemented rename. Filesystem paths remain `packages/modules/*`.

The important distinction: `@genie/module/alpha` is invalid as an independent npm package **name**, but valid as an **import specifier** for subpath `./alpha` of package `@genie/module`, or as a tooling alias. The existing comment about plural `@genie/modules/<id>` saying it “can never appear in a real import” in [boundaries.ts](../../packages/config/src/oxlint/boundaries.ts) is too strong. No correction was made in this research task.

## Evidence and provenance

| Source inspected | What it establishes |
| --- | --- |
| Main checkout `7fe04be688b5d51a13d563908cd43fad3e97f422`, plus identified uncommitted documentation | [Workspace globs](../../pnpm-workspace.yaml) already include independent `packages/modules/*`; [inventory](../../tools/generators/src/selection/inventory.ts) reads each manifest's package name, module id and declaration path as data. Fixtures use plural hyphen names such as `@genie/modules-alpha`. Root pins Nx 23.2.1, TS 7.0.2, Vitest 5.0.1. |
| Main [TS base](../../packages/config/src/typescript/base.json), [root tsconfig](../../tsconfig.base.json), [unit preset](../../packages/config/src/vitest/unit.ts), [Nx config](../../nx.json) | NodeNext/noEmit; no paths mapping; unit preset has no paths resolver enabled. Root tsconfig is already a shared cache input. This does not prove every future selection-dependent task has all necessary inputs. |
| S0-02 worktree `/home/kenan/work/genie-ops-center-v2.feature-s0-02-storybook-g1`, HEAD `6c6c056`, clean when inspected | Host uses `@storybook/nextjs-vite` 10.6.0, Next 16.3.5, Vite 8.3.0, Vitest 4.1.11. Its shared Storybook configuration discovers only selected module roots; browser tests use `storybookTest`. These are branch facts, not main adoption. |
| Approved, currently untracked [S0-02 upgrade contract](../architecture/storybook-dependency-upgrades.md) | Approved stable route retains vite-tsconfig-paths 5.1.4, isolates TS 5.9.3 for tsconfck, preserves TS 7 compiler and TS 6 tooling API. Historical scratch evidence is not integrated-branch acceptance. Inherited wildcard alias failure/pass is reported for the alpha comparison; the stable route still requires that verification. |
| [Spec 0 R-3a, R-7a, R-21/R-22](../specs/00-monorepo-foundation.md), [layout](../architecture/repository-layout.md), [module contract](../architecture/module-contract.md) | Selection must precede cache lookup; retain visible allowed dependencies; registry imports only selected modules; excluded imports/routes/schema/migrations must be absent from build/image. Independent package ownership and module boundaries remain required. |

Online sources below were read through a browser; Vite documentation was additionally checked through Context7. Rolling documentation/upstream `main` demonstrates documented capability, not exact-version acceptance. Installed Nx source was unavailable through the checkout's package symlink, so no pinned Nx-source or runtime graph claim is made.

## Ranked options

| Rank | Approach | Cost and result |
| --- | --- | --- |
| 1 | Use independent `@genie/module-contract-data` / `@genie/module-solution` packages and ordinary workspace dependencies | Lowest maintenance; native package resolution and exports. Existing selection/image gates still apply. Recommended. |
| 2 | Keep independent package identities, add singular slash aliases in one inherited `tsconfig.base.json` | Smallest slash candidate. Next consumes paths; existing Storybook integration already has a resolver; Vite 8 can consume the same mapping with one opt-in. No evidence that each needs a duplicate alias table. Still requires package-interface, unit-test, Nx and runtime verification below. |
| 3 | Add real `@genie/module` facade with separate subpath wrapper files | Standards-based resolution, preserves separate underlying packages. More generator/selection/package-graph maintenance; not automatically an all-module runtime bundle. Poor trade for spelling alone. |
| — | pnpm workspace aliases or npm aliases alone | Alias is still a package name. Cannot allocate multiple independent packages to `@genie/module/alpha`, `.../beta` dependency keys. Aliasing the single legal name `@genie/module` selects one target package, not a namespace of independently selected packages. |
| — | `package.json#imports` | Can map to external packages, but keys must begin `#` and apply within the declaring package. Could offer `#module/alpha`, not the requested spelling. |

### Why package-manager aliases do not solve this

[npm's validator](https://github.com/npm/validate-npm-package-name/blob/main/lib/index.js) permits an optional `@scope/` followed by one slash-free package component. [pnpm](https://pnpm.io/workspaces#referencing-workspace-packages-through-aliases) supports `"bar": "workspace:foo@*"`, converted to an npm alias on publish. This renames a package dependency; it does not provide a subpath-to-different-package routing table. [npm package documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json) likewise describes alias dependencies as package aliases.

### Cheapest slash candidate: shared paths, with explicit limits

Illustrative mapping in the **root** tsconfig, not a proposed edit:

```json
{
  "compilerOptions": {
    "paths": {
      "@genie/module/*": ["./packages/modules/*/src/index.ts"]
    }
  }
}
```

This targets the declared entrypoint only if module folder/id conventions agree and every module uses `src/index.ts`. Current inventory allows another entrypoint, so that convention would need enforcement or generation of exact entries from metadata. A wildcard accepts slashes: `@genie/module/alpha/testing` would map incorrectly to `packages/modules/alpha/testing/src/index.ts`. Root imports alone can use one wildcard; public subpaths need deliberate mappings matching the actual API. Do not expose every internal file for convenience.

Documented support and remaining obligations:

| Consumer/contract | Evidence and obligation |
| --- | --- |
| TypeScript | [TS reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html#paths) documents wildcard substitution, inherited relative resolution and unchanged emitted imports. It discourages paths to sibling packages because aliases bypass package exports and conditions. Keep ordinary workspace dependencies; matching the source entrypoint is an explicit interface-maintenance obligation. No `baseUrl` is needed for this root-relative mapping. Confirm inheritance is not replaced by leaf `paths`. |
| Next.js | [Next installation docs](https://nextjs.org/docs/app/getting-started/installation#set-up-absolute-imports-and-module-path-aliases) document built-in paths support. A separate webpack alias table is not inherently necessary. Verify the pinned production build and both server/client consumers. |
| Storybook | The S0-02 contract already identifies the Next.js/Vite paths resolver. Reuse it; no new resolver dependency is inherently necessary. Verify stable TS5 parser + TS6 tooling + TS7 typecheck with a real inherited TSX alias and a negative removal test. Alpha-only scratch proof cannot substitute. |
| Vite / standalone Vitest | [Vite](https://vite.dev/config/shared-options.html#resolve-tsconfigpaths) has `resolve.tsconfigPaths`, default false. On the S0-02 Vite 8 baseline, a shared unit preset can opt in without duplicating mappings or installing a plugin. [Vitest troubleshooting](https://vitest.dev/guide/common-errors.html#cannot-find-module-relative-path) confirms that default resolution is insufficient. Browser and Node test paths need separate execution proof; do not assume Storybook's plugin config applies to ordinary unit tests. |
| Nx graph | [Nx officially supports paths-based project linking](https://nx.dev/docs/kb/typescript-project-linking); [upstream locator source](https://github.com/nrwl/nx/blob/master/packages/nx/src/plugins/js/project-graph/build-dependencies/target-project-locator.ts) resolves matched paths to owning projects. This makes automatic edges plausible, not a reason to add manual edges preemptively. Prove the wildcard maps to each independent module on pinned Nx; graph/affected and cache tests remain separate. |
| Runtime | TS does not rewrite imports. Any unbundled worker, CLI, migration runner or externalized dependency using slash aliases needs runtime-compatible resolution or must keep canonical package imports. The repository includes these consumers; a successful Next build is not sufficient evidence for them. |
| Lint | Existing [Oxlint boundaries](../../packages/config/src/oxlint/boundaries.ts) cover plural `@genie/modules/*` and `@genie/modules-*` roots/subpaths, not the proposed singular names. Adoption must add and test singular `@genie/module/*`, `@genie/module/**`, `@genie/module-*` and `@genie/module-*/**` patterns; a facade also needs its bare `@genie/module` root covered. Retain plural coverage while those names remain valid. No new alias-aware lint resolver is automatically needed. Run forbidden-import fixtures with singular and existing plural spellings; keep public-entrypoint restrictions consistent because paths bypass exports. |
| Selection/image | A mapping does not import every module. Conversely, an unrestricted mapping does not prevent accidental excluded-module imports. Preserve selected-only registry and story discovery; verify exclusions in actual image files, migrations and runtime traces, not merely JS tree shaking. |
| Generator/cache | Preserve canonical package names in manifests/inventory; choose explicitly which generated consumers use aliases. Root mapping changes are already shared Nx inputs, but module source/declaration changes still need correct edges. Selection and modules.txt changes must invalidate all dependent output before cache lookup; use empty/one/all selections and cache restores. |

**Conclusion:** one mapping can be the single source of alias truth across several tools. It is not currently a complete, proven one-change solution. Some obligations are baseline acceptance, not costs caused by aliases; incremental costs are resolver activation, public-entrypoint conventions, runtime coverage and alias-specific graph/regression proof.

### Facade: possible, but more moving parts

A real `@genie/module` package can export `./alpha` to its own `./alpha.ts`, which re-exports from `@genie/module-alpha`. [Node package rules](https://nodejs.org/api/packages.html#subpath-exports) require exports targets to start `./` and remain inside the package: direct `"./alpha": "@genie/module-alpha"` or `"../alpha/..."` targets are not valid shortcuts. Wrappers are required. Preserve default/type exports deliberately.

Separate wrappers do **not** inherently load every module. However, an all-module facade manifest and source set can expand pnpm deployment closure, Nx graph dependencies and copied image files even when unused JavaScript is eliminated. A selected-only generated facade/manifest, or an independently verified pruning/tracing strategy, can satisfy exclusion; both add work. Its classification, allowed imports, generated outputs and selection cache inputs also need ownership. A common barrel importing all modules is unnecessary and should not be introduced.

[Node package imports](https://nodejs.org/api/packages.html#subpath-imports) allow external targets but require `#` keys. They are not a hidden way to give the requested `@genie/…` spelling native resolution.

## Smallest verification spike if slash spelling remains desirable

Use an isolated disposable checkout after the approved S0-02 baseline is available. Keep this research task read-only apart from this note.

1. Use two synthetic independent module packages with distinct exported markers and one public subpath. Add the single root wildcard for roots and opt the shared unit preset into existing Vite 8 paths support. Retain canonical workspace dependencies. Test whether the required subpath forces generated explicit mappings.
2. Through Nx, typecheck with TS7, run a Node unit test, build/render a TSX Storybook story with the approved stable resolver, and build/start a minimal Next page importing the alias. Remove the mapping to prove failure, then restore. Exercise any unbundled runtime consumer separately.
3. Inspect Nx graph edges to both modules. Change one module and the mapping separately; prove relevant affected selection/cache misses and valid repeat hits. Change `MODULE_INCLUDE` across empty/alpha/beta and back, including modules.txt input and restored generated outputs.
4. Update and test singular boundary patterns for core/UI/module/tooling with slash and hyphen spellings, retaining coverage of existing plural names during any transition. Inspect a selected production image for the other module's marker, files and migrations. If image tooling is not yet implemented, record that acceptance as pending; do not call the alias universally verified.

Stop if this needs custom Node loaders, duplicated alias registries or a facade solely for naming. With the user's preference, retain hyphens instead. No install, build, graph generation, source modification, commit or push was performed for this report.
