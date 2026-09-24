# packages/core/src/services/setup

The resumable `genie-ops setup` command (R-18 to R-26, R-77, R-78).

## What belongs here

The setup steps this section knows — `migrations` and `seed` — and the recording of each one in
`setup_step`, outside the step's own transaction so a failed step leaves a `failed` row with its
cause. The `seed` step is the only writer of `tenant_module` rows until it is `done` (R-20): it
inserts one row per compiled module, the single `tenant_settings` row from `tenant.yaml`, and the
single `tenant_branding` row from `branding.seed.json`, in one transaction, with the foreground
derived by the shared rule. `config.ts` reads and strictly validates the two files, naming the file
and the offending key on refusal (R-22).

## What must not go here

The runner, the audit helper, and the migrator run (each has its own home), a second database
connection, and a step from a later section. Section 2 lengthens the step list elsewhere and this
folder keeps only what it has tables for.

## What it imports

`zod` through the tenant-config schemas, the `yaml` parser, the migrator, the tenant context, and
the shared branding and error-cause rules.
