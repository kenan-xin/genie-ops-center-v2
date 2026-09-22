# S0-08 evidence

Bead `genie-ops-center-v2-1rd.8`. Recorded 2026-09-22 against develop `3f928ea`,
merged into the ticket branch. Beads owns status; this file records what ran.

## What the generators are

`nx g @genie/generators:module <capability>` and `nx g @genie/generators:tenant
<slug>`, registered in `tools/generators/generators.json` and written through an
Nx devkit `Tree`, so both support `--dry-run` and write nothing when a value is
refused.

The command spelling differs from the wording Spec 0 first used. An Nx collection
is addressed by a package name, and the earlier spelling needed two more packages,
one of them inside the namespace module packages reserve. The decision and its
reason are recorded beside R-29.

## The generated module proof (AC-7)

One script runs every layer and restores the workspace on every exit path,
including a failing gate:

```bash
node tools/generators/scripts/prove-generated-module.ts generated-proof
```

The module is disposable. It is generated into this workspace, linked the way any
module is linked, put through the gates and removed; the host module list, the
default selection and continuous integration never gain a module, and the
lockfile and the application manifest are restored exactly.

Run of 2026-09-22, all layers, exit 0:

| Layer | Command the script ran | Result |
| --- | --- | --- |
| Scaffold | `nx g @genie/generators:module generated-proof` | 28 files, no hand edit |
| Link | `pnpm install` | the package resolves; no other manifest edited |
| Lint, typecheck, unit | `nx run-many -t lint typecheck test --projects=@genie/module-generated-proof` | passed |
| Selection and story discovery | `node tools/generators/scripts/assert-discovered.ts generated-proof` | reached by the unset selection and by an explicit one, absent from a selection that excludes it, and its story glob appears and disappears with it |
| Real database | `nx run @genie/module-generated-proof:test:integration` | 4 passed: its own migration applied, its ledger separate from core's, and its read procedure refused twice |
| Storybook component tests | `nx run @genie/storybook:test-storybook` with `MODULE_INCLUDE=generated-proof` | 5 files, 14 tests passed |
| Denied route in a browser | `playwright test --config apps/genie/playwright.config.ts generated-module` | 6 passed, three cases at a phone and a desktop viewport |

Story discovery was measured by difference, not asserted from a log line. An
explicitly empty selection runs 3 story files and 9 tests; the same command with
`MODULE_INCLUDE=generated-proof` runs 5 files and 14 tests. The generated module
contributed exactly its two story files and five stories, with no edit to the
Storybook host or to continuous integration.

## The stage boundary held

The authorization stub is unchanged. It grants one key and that key belongs to
another module, so every generated procedure and every generated page is refused,
and the refusal is the proof. The generated integration test asserts refusal for a
caller holding nothing and for the stub principal; the browser tests assert the
application's own denied response and that nothing the module would have rendered
appears. No test was skipped, no grant widened, no success principal invented.

The application's page loader remains the single authorization decision. Generated
presentation components hold no permission branch, and a generator unit test fails
any generated presentation file whose code reaches for `can()`, names a permission
state, or imports core.

## What the application gained

A module the generator writes needs a route. `apps/genie/src/app/m/[moduleId]/`
and `apps/genie/src/app/admin/m/[moduleId]/` mount any compiled module's workspace
and admin pages behind `renderIfPermitted`, so a generated module reaches a browser
with no edit to the application. The namespace mirrors `/api/m/<id>/...`, which the
module contract already uses. The placeholder keeps its own route files, unchanged.

The generator adds the new package to `apps/genie/package.json` dependencies,
because the registry imports a module by package name. That is composition, not
selection: `MODULE_INCLUDE` still decides what an image compiles.

## Tenant generator

`tenant.yaml` and `branding.seed.json` are validated against the strict schemas in
`packages/core/src/lib/tenant-config/`, which are now the default rather than a
schema the caller supplies. A malformed administrator address, an empty
administrator list and an onboarding mode outside the documented set each fail the
command and leave nothing written. Seven files, no secret, no hosting mode, and
branding seeded with the four required values only.

## Gates

- `nx affected -t build test lint typecheck build-storybook test-storybook test:integration --base=3f928ea --parallel=1`: exit 0 over 7 projects.
- The same command at the default parallelism failed twice on this host, both times a Testcontainers port-binding timeout while the core migrator suite and the application image suite started containers at once. Each passed alone straight afterwards: core 9 of 9, application 89 of 89 with every mandatory case executed. The failures are host contention, not a defect in this change, and the serial run is the recorded result.
- `oxfmt` clean.

## Not proven here

A generated module's own end-to-end main path with a granted role. The stub has no
such role until Section 2 item 6, and widening it to manufacture one is exactly
what this ticket's stop condition forbids.
