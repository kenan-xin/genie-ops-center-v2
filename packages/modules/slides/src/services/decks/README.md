# src/services/decks

The module's reads and writes of its own `deck` table.

## What belongs here

The permission checks of a deck procedure, which call `can()` with no resource, the content hash
expression, and the owner-only reads and writes: every query filters on the caller's own user id,
so another person's deck answers as missing (R-52). The pure helpers that change a stored deck.

## What must not go here

A page component, a direct read of another module's tables, a dataset query that does not go
through core, and a permission check that is not `can()` or `scopesFor()`.
