# 1rd.3.4: module contract validator gaps

Bead: `genie-ops-center-v2-1rd.3.4`, the deferred Minor findings of the S0-03 whole-branch review. Branch `fix/s003-contract-validation`, base `9f67536`. Run date 2026-09-21.

Four findings are fixed. One is reported for a decision and not started.

## M-2: the pinned rail is cross-checked against the declared entries

`validateModule` now reports three problems the navigation row implies. A pinned entry whose id is not among `navigation.entries`. A pinned entry whose id matches a declared entry but whose label, path, surface, required permission, category or landing flag differs. The same id pinned twice.

The pinned rail draws from the entries the module declares, so a pinned id core cannot find renders nothing, and a second copy of one takes a slot from the six.

## M-3: the DEC-50 default-role convention is checked

A module with a workspace entry must seed a default role named `<Display name> user` that carries `<id>:use`. `validateModule` reports a missing role by its expected name, and a role of that name that does not carry the use key. A module with no workspace entry is asked for no such role.

Source: DEC-50 in `docs/core/decision-log.md` and the Default roles row of `docs/architecture/module-contract.md`.

## M-4: a capability provision names a registered capability

`CapabilityProvision.name` was `string`, so a module could name a capability that does not exist. It is now `CapabilityName`, the key type of the `CapabilityInterfaces` registry in `packages/core/contracts`. Section 0 registers no capability, so the empty list is the only list that compiles today, which is what the module contract document already describes: a capability is added to the registry in the same change that a real module needs it.

The valid fixture therefore declares `capabilities: []`. The type assertion that an invented name is refused lives in `module.test-d.ts`.

This is a semantics choice a reviewer can reject: it makes every capability declaration impossible until the registry gains a member. The alternative is a runtime list of capability names in `packages/core/contracts`, which adds a runtime concept to a contracts module that holds only types and zod today. I did not take that path without a decision.

## M-9: the type assertions cover the declaration points

`module.test-d.ts` grew from 3 assertions to 26, at least one for each of the seventeen points, covering identity, schema history, router, permission keys, record resolvers, default roles, both navigation lists and the surface union, pages, the three optional points in their omitted and their broken form, configuration schema, event version, capabilities, jobs, inbound endpoints, integration kinds, the frame origin provider and the test presets.

Optional points are omitted rather than set to `undefined`, because the core tsconfig turns on `exactOptionalPropertyTypes`.

## M-6: deferred, needs an owner decision

`packages/core/src/lib/tenant-config/branding-seed.ts` repeats the four font keys that `docs/architecture/data-shape.md` says are a constant in `packages/ui`. I did not fix it.

The reason is that `packages/ui` holds no font-list constant today, so the fix is not a move: it creates the constant, decides its shape and its owner, and makes the build-safe seed schema depend on `packages/ui`. The seed schema is build-safe and imports only zod, so a dependency on a UI package needs a decision about what that package may export at build time. That is an architectural slice, not a validator gap. It needs its own bead.

## Checks

All from the worktree root.

| Command | Result |
| --- | --- |
| `pnpm exec vitest run packages/core` | 13 files, 152 tests, all passed |
| `pnpm exec tsc --noEmit -p packages/core/tsconfig.json` | No errors found |
| `pnpm exec oxlint --config oxlint.config.ts packages/core/src/lib/module-contract packages/core/contracts` | no diagnostic |
| `pnpm exec oxfmt --check packages/core/src/lib/module-contract` | all files correctly formatted |

Mutation evidence, each applied to the working tree and reverted:

| Mutation | Result |
| --- | --- |
| The five new validator cases, written before the rules | 5 failed, 22 passed |
| The same cases after the rules | 38 passed |
| `CapabilityProvision.name` back to `string` | `tsc` fails: `module.test-d.ts(161,3): error TS2578: Unused '@ts-expect-error' directive` |

The fixture transforms `withLanding` and `withAdminLanding` now flag the pinned copy of an entry along with the entry. Without that, each transform broke two rules instead of one, which is what the pinned cross-check exposed.
