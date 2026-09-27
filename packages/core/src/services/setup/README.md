# packages/core/src/services/setup

The resumable `genie-ops setup` command (R-18 to R-26, R-77, R-78, R-52 to R-54).

## What belongs here

The setup steps this section knows — `migrations`, `seed`, `realm` and `clients` — and the
recording of each one in `setup_step`, outside the step's own transaction so a failed step leaves
a `failed` row with its cause. The `seed` step is the only writer of `tenant_module` rows until it
is `done` (R-20): it inserts one row per compiled module, the single `tenant_settings` row from
`tenant.yaml`, and the single `tenant_branding` row from `branding.seed.json`, in one transaction,
with the foreground derived by the shared rule. The `realm` and `clients` steps are listed here in
run order; their work lives in `services/keycloak`. `config.ts` reads and strictly validates the
two files, naming the file and the offending key on refusal (R-22).

## What must not go here

The runner, the audit helper, and the migrator run (each has its own home), a second database
connection, and the work of a step from a later section. Section 2 appends the `realm` and
`clients` steps to the list here; their Keycloak calls live in `services/keycloak`.

## What it imports

`zod` through the tenant-config schemas, the `yaml` parser, the migrator, the tenant context, the
Keycloak realm and clients steps, and the shared branding and error-cause rules.
