# apps/genie/tools/evaluation

The model evaluation of Spec 7 (R-58, S7-14): a script that scores candidate models on reading the seven live uploads and on answering the nine read questions with their charts, three runs per case per model, and writes a report with the recommended defaults.

## What belongs here

The case lists, the scorers, the report writer and the runner script, with unit tests for the pure parts. The scorers read the expected values. Nothing a model sees does.

## What must not go here

- An Nx target or a root `package.json` script that starts the runner. No gate may call a live model; `gate-guard.test.ts` fails if one does.
- A report written by a recorded run at the committed report path. Only the owner's live run writes there.
