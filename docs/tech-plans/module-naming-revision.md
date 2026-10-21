# Module naming revision and implementation rework

2026-09-21 reconciliation: singular package naming with existing capability folders is approved. S0-01 naming enforcement is accepted at `cb5b010`; S0-02 placeholder reconciliation is accepted at `ae00f6b`. S0-03 continuation authorizes the remaining contract/fixture work. The rework sequence below is the original approved sequencing rationale, not a fresh approval hold. Beads owns live state; the aggregate naming item remains open until all consumers satisfy it.

## Settled requirement and product impact

Preserve the canonical [tenant module visibility story](../flows/tenant-module-visibility.md): shared core plus only the tenant's included modules, subject to enablement, user permissions and tenant data isolation. Naming/layout decisions cannot weaken this requirement.

The canonical source is [Module package naming](../architecture/repository-layout.md#module-package-naming). For ID `contract-data`, use folder `packages/modules/contract-data/` and package `@genie/module-contract-data`. For the existing `solutions` ID, keep folder `solutions` and use `@genie/module-solutions`; illustrative `solution` imports do not rename that product capability. The placeholder stays at `packages/modules/placeholder/`, package `@genie/module-placeholder`, ID `placeholder`.

End-user behavior, permission keys, entitlement IDs, routes, migration ledger identities, database names, customer include lists and `docs/modules/<id>/` paths remain unchanged. Existing capability folders stay in place. The `module-` package prefix supports IDE import discoverability; it does not grant permission to import another module. This is a development packaging change, not a folder or data migration or a decision to rename contracts to agreements. The separate domain-naming decision remains deferred. Workspace globs `packages/modules/*` and broad layer globs remain valid; do not narrow discovery to a glob that silently ignores invalidly named module folders.

No umbrella, new scope, alias resolver, loader or dependency upgrade is part of this change. The approved Storybook compatibility workaround and its removal backlog remain separate.

## Technical contract

- Check `folder basename == <metadata id>` and `manifest.name == @genie/module-<metadata id>` for discovered module packages. Preserve the existing kebab-case ID contract and custom declaration entrypoint support.
- Enforce the invariant through workspace validation and data-only inventory discovery before selection/cache lookup, including unselected discovered metadata. Read metadata only; never evaluate excluded module declarations. Generator correctness alone does not protect hand-edited manifests.
- Keep architectural classification based on layer/path. Share the naming invariant rather than putting divergent checks into classification, generators and selection.
- Add singular package-root and public-subpath restrictions for the existing forbidden import directions. Preserve defensive plural/slash patterns and relative-import protections; verify permitted app composition and permitted module dependencies still work. Ensure arbitrary package names cannot bypass validation.
- Consumers use validated `packageRoot`, `packageName` and `entrypoint`; they must not derive `packages/modules/<id>` from an ID. Keep selection ordered and distinguish unset from explicitly empty.
- Update manifests, workspace references and applicable lockfile links atomically in implementation. Retain Nx project edges, affected selection and cache invalidation when package/folder metadata changes. No blanket cache reset substitutes for regression proof.

Current-revision evidence, 2026-09-22, develop `4a9fd37` (verified in the `docs/ygn-module-naming-closure` worktree; superseded by later revisions): the paragraph this replaces reported the invariant missing from `inventory.ts`, an observation that no longer holds. The rework is integrated and enforced end to end.

| Invariant leg | Evidence at `4a9fd37` |
| --- | --- |
| Folder `packages/modules/<id>`, package `@genie/module-<id>` | `packages/modules/placeholder/` declares `@genie/module-placeholder` with ID `placeholder` |
| Shared validation before selection, metadata only | `moduleNamingError` in `tools/generators/src/workspace/module-naming.ts`, applied to every discovered manifest in `tools/generators/src/selection/inventory.ts` before selection or cache lookup, without evaluating declarations |
| Singular root and public-subpath protections, mutation proof | `packages/config/src/oxlint/boundaries.ts` restricts `@genie/module-*` and `@genie/module-*/**` in every forbidden direction and keeps the defensive plural, slash and relative patterns; `packages/config/src/oxlint/boundaries.test.ts` proves each against the real oxlint binary, permitted app composition included |
| S0-08 generator emission | `tools/generators/src/module-new/render.ts` emits `modulePackageName(id)` and re-validates its own output; the hyphenated `contract-data` case is covered by its tests |
| Identity preservation | ID `placeholder` is identical on both sides of naming-rework merge `ee44c66`; permission keys and migration tag `0000_boring_gargoyle` are unchanged since introducing commit `68a4acb`; include lists keep the bare ID (`MODULE_INCLUDE-placeholder` default) |
| Canonical docs agreement | [Module package naming](../architecture/repository-layout.md#module-package-naming), the [module contract](../architecture/module-contract.md) and Spec 0 R-7/R-30 state one invariant; plural spellings survive only in historical plan bodies, as this plan's preservation rule allows |

Checks at this revision, all green: `nx run-many -t test lint typecheck --projects=@genie/generators,@genie/config`, `nx run-many -t test lint typecheck --projects=@genie/module-placeholder`, `npx oxfmt --check .`, `npx supercov quality patch --base develop`. Generator proof at the integration revision is S0-08's own record, not duplicated here: [S0-08 evidence](../tickets/spec-0/08-module-and-tenant-generators/evidence.md).

## Approved rework sequence and remaining consumers

| Owner | Bounded rework | Acceptance before handing off |
| --- | --- | --- |
| S0-01, `1rd.1`, with `ygn` and `1rd.1.4` | Add the shared data-only naming invariant to validation/discovery; extend boundary coverage; update relevant fixture package metadata while preserving capability folders. Keep unrelated accepted repairs intact. | Red/green name/folder/ID mismatch cases, arbitrary-name rejection, singular root/subpath forbidden imports, valid composition, unevaluated throwing declaration, unchanged selection semantics, relevant Nx invalidation, fresh scoped review of the new delta. |
| S0-03, `1rd.3` | After the approved S0-01 revision, reconcile any contract fixtures/imports that actually encode old package names or paths. Preserve IDs, contract shapes and shared dependency pins. | Contract/type fixtures and build-safe import proof. If no affected source exists, record the scoped search and no-op result rather than inventing changes. |
| S0-02, `1rd.2` | After accepted S0-01 and the existing S0-03 shared-file transfer, reconcile placeholder/story package names and imports, verify existing discovery paths, and recheck the backed-up adoption patch. Preserve the stable workaround. | Recheck patch applicability and refresh hashes; story selection uses unprefixed IDs and inventory paths; boundary suites coexist with actual Storybook configs; rerun affected G1 proof at the final source. |

The sequence was authorized and executed for S0-01/S0-02: shared validation and boundary enforcement landed first, then dependency handoff and placeholder/Storybook reconciliation. Their integrated acceptance records are under the owning ticket directories. S0-03 continues its contract validation and fixture checks under its current continuation authority. Later consumers retain the obligations below; the naming aggregate is not complete merely because S0-01/S0-02 are accepted.

## Downstream ticket requirements

| Ticket | Naming-specific obligation |
| --- | --- |
| S0-04 | Real placeholder package/factories keep the placeholder folder and use the singular package name; preserve `placeholder:read`, schema and history identity. |
| S0-05 | Registry/app imports consume validated inventory names/paths; startup and CSP behavior do not change. |
| S0-06 | Prove metadata/path changes invalidate selection-dependent outputs; empty/one/all selections, restored cache and concurrent builds retain ID semantics. |
| S0-07 | Locate migrations through inventory, preserving per-module history and lock identity through the packaging change. |
| S0-08 | Generator accepts an unprefixed capability, emits the capability folder/ID and prefixed package-name mapping and passes the same validation. Tenant include lists retain IDs. |
| S0-09 | Update active commands/examples for paths and package targets; preserve the documented generator CLI identity. |
| S0-10 | Discover selected stories from inventory roots; prove module package-metadata and story/source/config invalidation and excluded-story absence. |
| S0-11 | Prove the builder stage keeps only the selected `packages/modules/` folders (builder-stage prune and check, failing-import test, `pg4`, 2026-09-23) and inspect images for excluded migration histories. A package-name change or tree-shaking claim is not exclusion proof, and a source-marker scan of built chunks is not either. |
| S0-12 | Aggregate exact integrated naming/validation/boundary/generator/selection/image evidence; preserve all existing G1–G5 obligations. |

## Documentation propagation and preservation

Updated active layers: repository layout and module contract; UI development ownership paths; Spec 0 R-7, R-15, R-30 and R-39 plus the specs glossary; core vision/roadmap/tech-stack; foundation technical plan; all twelve active ticket scope addenda. DEC-22 receives an explicit amendment rather than rewriting its prior decision text. The research report links the later decision and retains its original observations.

No product flows require rewriting because IDs and user behavior do not change. Other specs that inherit the module layout remain governed by the canonical contract. Historical review reports, ticket evidence and old implementation-plan bodies retain the exact names they tested; active ticket addenda supersede conflicting naming instructions in those plans. Imported design references are not runtime package contracts and remain unchanged. Worktree-local documents must be reconciled by their owner from this main-checkout revision; this pass does not propagate by overwriting other worktrees.

## Verification and rollback for the later implementation

Run relevant checks through Nx and keep nonempty test evidence. Demonstrate mismatched folder/name/ID failures and accepted canonical metadata, forbidden singular roots/subpaths, retained relative/legacy defenses, and no declaration execution during discovery. Include a hyphenated ID such as `contract-data`. Prove selection/cache/registry/story/image behavior in the ticket that owns each harness; unavailable later-stage checks stay pending.

Before integrating a package-naming change, retain the last accepted source/config/manifest/lockfile revision. Rollback restores that coherent set; do not revert IDs or database data. Invalidate or regenerate affected derived outputs under the restored configuration. The planning pass runs only documentation/link and Beads consistency checks, not application tests.
