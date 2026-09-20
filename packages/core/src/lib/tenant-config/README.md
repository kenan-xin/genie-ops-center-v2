# packages/core/src/lib/tenant-config

The strict schemas for a customer's `tenant.yaml` and `branding.seed.json`.

## What belongs here

The zod schemas, their inferred types, and the JSON Schema emission that `deploy/schemas/` is built from. A schema rejects an unknown key, so a value written in the wrong file fails the generator.

`branding.seed.json` carries a `$schema` key for editors; the loader strips it before parsing, and `brandingSeedSchema` validates what remains. An object still carrying `$schema` fails validation, which is what makes the strip mandatory. Which columns are required and what omission means is settled by [the branding seed contract](../../../../../docs/architecture/branding-seed.md); the schema implements that document and materializes none of its defaults.

## What must not go here

A deployment environment read, a database connection, a service, a secret, and a hosting mode. Importing this folder must stay safe during a build.

## What it imports

`zod` only. This is the one core folder that `tools/generators` may import, so it must never pull in the core runtime.
