# packages/modules/placeholder/testing

The module's own test helpers.

## What belongs here

Factories for this module's tables, and the real-database integration tests of its router and its schema. A module owns the factories for its own tables; core holds none of them (R-39).

`model-recordings/artifact-chart-*.json` and `artifact-change-*.json` hold one hand-written conversation: "Chart the quantity of each placeholder record." makes artifact 1 after one refused call, and "Show it as a line by day instead." makes its version 2 (AC-8).

`model-recordings/stream-slow-1.json` answers "Describe each placeholder record." in three paragraphs, one event every 150 ms (`chunkDelayMs`), so an end-to-end test can watch an answer stream and press Stop.

`model-recordings/synthetic-run-slow-1.json` and `synthetic-run-slow-2.json` are synthetic timing fixtures of a durable agent run on the test surface in `test-surface.ts` (S7-40). The first answers "Build the placeholder record step by step." with a 16-part note, one event every 300 ms, then one call of `placeholder-surface-step`. The second answers the request that carries the tool result with the final answer. They stay synthetic when the recordings are refreshed, because a test needs their timing.

`model-recordings/synthetic-chain-1.json` to `synthetic-chain-11.json` are a synthetic run of two turns on the test surface (S7-49). The first ten answer "Build the placeholder record in eleven steps." with one call of `placeholder-surface-step` each, so the first turn reaches the step cap; the eleventh answers the second turn, whose last message is the run's continue message, with the final answer. Their requests are what a scripted transport received from a real run, never written by hand. Make them again the same way when a request changes.

## What must not go here

A unit test, which lives beside its source under `src/`. A core table factory. A database mock: every test here takes a disposable Postgres with the real migration histories applied.

## What it imports

The module's own source, the core test helpers, and `@genie/core`.
