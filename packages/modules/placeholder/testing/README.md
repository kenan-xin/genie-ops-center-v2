# packages/modules/placeholder/testing

The module's own test helpers.

## What belongs here

Factories for this module's tables, and the real-database integration tests of its router and its schema. A module owns the factories for its own tables; core holds none of them (R-39).

`model-recordings/artifact-chart-*.json` and `artifact-change-*.json` hold one hand-written conversation: "Chart the quantity of each placeholder record." makes artifact 1 after one refused call, and "Show it as a line by day instead." makes its version 2 (AC-8).

`model-recordings/stream-slow-1.json` answers "Describe each placeholder record." in three paragraphs, one event every 150 ms (`chunkDelayMs`), so an end-to-end test can watch an answer stream and press Stop.

## What must not go here

A unit test, which lives beside its source under `src/`. A core table factory. A database mock: every test here takes a disposable Postgres with the real migration histories applied.

## What it imports

The module's own source, the core test helpers, and `@genie/core`.
