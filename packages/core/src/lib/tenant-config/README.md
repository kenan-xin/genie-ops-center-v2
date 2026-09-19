# packages/core/src/lib/tenant-config

The strict schemas for a customer's `tenant.yaml` and `branding.seed.json`.

## What belongs here

The zod schemas, their inferred types, and the JSON Schema emission that `deploy/schemas/` is built from. A schema rejects an unknown key, so a value written in the wrong file fails the generator.

## What must not go here

A deployment environment read, a database connection, a service, a secret, and a hosting mode. Importing this folder must stay safe during a build.

## What it imports

`zod` only. This is the one core folder that `tools/generators` may import, so it must never pull in the core runtime.
