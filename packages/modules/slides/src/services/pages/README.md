# src/services/pages

The server loaders behind the module's pages (Spec 7 R-52, R-55).

## What belongs here

A loader that asks the page's read key through `can()`, reads the caller's own decks through the
deck store, and answers a view type from `../../presentation/views.ts`. Another person's deck
answers `not-found`, which core shows as missing. File links come from `FileStorage` only, one per
image the deck shows.

## What must not go here

A React component, a direct query of the `deck` table that skips the store's owner filter, a
dataset query outside core's dataset service or chart gate, and any write.
