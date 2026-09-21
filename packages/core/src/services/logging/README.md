# packages/core/src/services/logging

The deployment's logger.

## What belongs here

The pino logger built from the validated environment, the child that carries one execution's request, tenant and user ids, and the redaction that keeps a secret out of every line whatever the call site passes.

## What must not go here

A transport, a log line written by hand, and a redaction rule applied at a call site. Redaction is a property of the logger. Nothing here reads the database or the environment directly: the validated environment arrives as an argument.

## What it imports

pino and the `DeploymentEnvironment` type. Nothing else.
