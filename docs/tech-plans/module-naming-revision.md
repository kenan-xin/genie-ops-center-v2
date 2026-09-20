# Module naming revision and implementation rework

2026-09-20. Singular package naming with existing capability folders is approved; the earlier matching-folder/rename proposal is superseded. This document propagates those requirements; the rework sequence for implemented tickets below is proposed for owner approval. No implementation, branch integration, commit, acceptance closure or hook activation is authorized by this planning pass. Beads owns task status.

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

Current source evidence: `tools/generators/src/selection/inventory.ts` accepts a present manifest name without checking this invariant; `tools/generators/src/workspace/classify-project.ts` classifies any direct module folder by path. These are observations from the main checkout, not proof of branch rework. S0-01's reported reviewed repair head is `5327afb`; S0-02's recorded correction head is `6c6c056`; verify live heads before implementation. Historical tests and reviews prove their original revisions only.

## Proposed rework of implemented or in-progress tickets

| Owner | Bounded rework | Acceptance before handing off |
| --- | --- | --- |
| S0-01, `1rd.1`, with `ygn` and `1rd.1.4` | Add the shared data-only naming invariant to validation/discovery; extend boundary coverage; update relevant fixture package metadata while preserving capability folders. Keep unrelated accepted repairs intact. | Red/green name/folder/ID mismatch cases, arbitrary-name rejection, singular root/subpath forbidden imports, valid composition, unevaluated throwing declaration, unchanged selection semantics, relevant Nx invalidation, fresh scoped review of the new delta. |
| S0-03, `1rd.3` | After the approved S0-01 revision, reconcile any contract fixtures/imports that actually encode old package names or paths. Preserve IDs, contract shapes and shared dependency pins. | Contract/type fixtures and build-safe import proof. If no affected source exists, record the scoped search and no-op result rather than inventing changes. |
| S0-02, `1rd.2` | After accepted S0-01 and the existing S0-03 shared-file transfer, reconcile placeholder/story package names and imports, verify existing discovery paths, and recheck the backed-up adoption patch. Preserve the stable workaround. | Recheck patch applicability and refresh hashes; story selection uses unprefixed IDs and inventory paths; boundary suites coexist with actual Storybook configs; rerun affected G1 proof at the final source. |

Recommended sequence: approve this bounded rework; S0-01 implements and receives a fresh delta review; integration owner validates/accepts its revised baseline; S0-03 reconciles affected fixtures and completes its separately approved dependency handoff; S0-02 consumes that baseline and resumes its correction. The current five acceptance beads remain open until integration-owner verification. A previous repair review is not approval of naming changes. No other branch is edited by the S0-01 owner.

Open owner choice: approve this sequence or request a different ownership split before code changes. The skill requires alignment on reworking implemented tickets; the existing choice of spelling and folder names does not need reconfirmation.

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
| S0-11 | Inspect images/staging for excluded package names, folders, source markers and migration histories; a package-name change or tree-shaking claim is not exclusion proof. |
| S0-12 | Aggregate exact integrated naming/validation/boundary/generator/selection/image evidence; preserve all existing G1–G5 obligations. |

## Documentation propagation and preservation

Updated active layers: repository layout and module contract; UI development ownership paths; Spec 0 R-7, R-15, R-30 and R-39 plus the specs glossary; core vision/roadmap/tech-stack; foundation technical plan; all twelve active ticket scope addenda. DEC-22 receives an explicit amendment rather than rewriting its prior decision text. The research report links the later decision and retains its original observations.

No product flows require rewriting because IDs and user behavior do not change. Other specs that inherit the module layout remain governed by the canonical contract. Historical review reports, ticket evidence and old implementation-plan bodies retain the exact names they tested; active ticket addenda supersede conflicting naming instructions in those plans. Imported design references are not runtime package contracts and remain unchanged. Worktree-local documents must be reconciled by their owner from this main-checkout revision; this pass does not propagate by overwriting other worktrees.

## Verification and rollback for the later implementation

Run relevant checks through Nx and keep nonempty test evidence. Demonstrate mismatched folder/name/ID failures and accepted canonical metadata, forbidden singular roots/subpaths, retained relative/legacy defenses, and no declaration execution during discovery. Include a hyphenated ID such as `contract-data`. Prove selection/cache/registry/story/image behavior in the ticket that owns each harness; unavailable later-stage checks stay pending.

Before integrating a package-naming change, retain the last accepted source/config/manifest/lockfile revision. Rollback restores that coherent set; do not revert IDs or database data. Invalidate or regenerate affected derived outputs under the restored configuration. The planning pass runs only documentation/link and Beads consistency checks, not application tests.
