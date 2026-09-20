# packages/core/src/services

Code that does work for the application: business logic and integrations.

## What belongs here

A unit of work for the application — the mailer, the file store, the event bus, a connector, the
authorization seam. It must have its own API worth naming, or it belongs in `utils/` instead.

## What must not go here

A mini-package that could stand alone with its own API (that is `lib/`), a small generic stateless
helper (`utils/`), and anything that reads the database outside the `TenantContext` object.
