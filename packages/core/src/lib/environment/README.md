# packages/core/src/lib/environment

The validation of the environment values the image reads.

## What belongs here

The schema of the variables in `docs/architecture/environment-contract.md` and the function that turns one environment into a validated `DeploymentEnvironment`. A variable of a later section is added here in the change that delivers the runtime which reads it.

## What must not go here

A database connection, a default that the environment contract does not state, and a value a tenant administrator owns. Those live in `tenant_settings` and `tenant_branding`. Validation runs before anything connects, so nothing here may open a connection or read a file.

## What it imports

zod and the `DeploymentEnvironment` type beside it. Nothing else.
