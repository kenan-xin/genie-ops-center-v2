# src/services/pages

The server loaders behind the module's pages (Spec 7 R-48).

## What belongs here

A loader that asks the page's read key through `can()`, reads the caller's own dashboards through
the dashboard store, and answers a view type from `../../presentation/views.ts`. Another person's
dashboard answers `not-found`, which core shows as missing.

## What must not go here

A React component, a direct query of the `dashboard` table that skips the store's owner filter,
a dataset query outside core's dataset service or chart gate, and any write.
