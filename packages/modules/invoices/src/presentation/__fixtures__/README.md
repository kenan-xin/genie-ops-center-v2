# src/presentation/\_\_fixtures\_\_

The browser-safe sample data the invoice page stories render.

## What belongs here

Plain deterministic data and the view types that describe it. A fixture is a literal value,
written in English, stable across runs, so a story renders the same thing every time and a failure
names a real change.

## What must not go here

Seed data, a factory that talks to a database, a schema import, a server type, and anything that
runs at application runtime. A fixture exists for a story and never reaches a runtime path.

## What it imports

Only the view types from `../views.ts`.
