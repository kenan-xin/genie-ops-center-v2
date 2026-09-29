# packages/core/src/services/setup

The resumable `genie-ops setup` command (R-18 to R-26, R-77, R-78, R-52 to R-57, R-17b).

## What belongs here

The setup steps this section knows, in run order — `migrations`, `seed`, `realm`, `clients`,
`roles`, `admin_seed`, `break_glass` — and the recording of each one in `setup_step`, outside the
step's own transaction so a failed step leaves a `failed` row with its cause. The `seed` step is
the only writer of `tenant_module` rows until it is `done` (R-20): it inserts one row per compiled
module, the single `tenant_settings` row from `tenant.yaml`, and the single `tenant_branding` row
from `branding.seed.json`, in one transaction, with the foreground derived by the shared rule. The
`realm` and `clients` steps are listed here in run order; their work lives in `services/keycloak`.
The `roles` step seeds the two core system roles, every compiled module's default roles (definitions
only for a disabled module) and the local `Genie Administrators` group holding `Tenant
administrator` tenant-wide (R-55); its `roles-step.ts` composes `seedRoles` and
`seedGenieAdministrators` from `services/authorization`. `admin-seed-step.ts` pre-adds the initial
administrators as pending, invited local members (R-56). `break-glass-step.ts` creates the
operator-provisioned account and its credential row, hashing the generated password with Better
Auth's hasher and printing it once to the command output (R-57, D2-5). `config.ts` reads and
strictly validates the two files, naming the file and the offending key on refusal (R-22).

## What must not go here

The runner, the audit helper, and the migrator run (each has its own home), a second database
connection, and the work of a step from a later section. The `realm` and `clients` Keycloak calls
live in `services/keycloak`; the role and group seeding lives in `services/authorization`; the
password rule lives in `lib/password`.

## What it imports

`zod` through the tenant-config schemas, the `yaml` parser, the migrator, the tenant context, the
Keycloak realm and clients steps, Better Auth's password hasher, the authorization seeding, the
shared password rule, and the shared branding and error-cause rules.
