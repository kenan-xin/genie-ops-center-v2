# packages/core/src/utils

Small generic stateless helpers, one file per topic.

## What belongs here

A helper with no state, no connection and no tenant context: it takes a value and returns one.
It lives here only after the standard library and es-toolkit were checked and neither fits. One
file per topic, never a wrapper around a library function.

## What must not go here

A mini-package with its own API (`lib/`), work for the application such as a mailer or a migrator
(`services/`), a database read, and a one-caller helper that belongs beside its only user.

## What it imports

The standard library and es-toolkit. Nothing internal.
