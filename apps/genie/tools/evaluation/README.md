# apps/genie/tools/evaluation

The model evaluation of Spec 7 (R-58, S7-14): a script that scores candidate models on reading the seven live uploads and on answering the nine read questions with their charts, three runs per case per model, and writes a report with the recommended defaults.

## What belongs here

The case lists, the scorers, the report writer and the runner script, with unit tests for the pure parts. The scorers read the expected values. Nothing a model sees does.

## What must not go here

- An Nx target or a root `package.json` script that starts the runner. No gate may call a live model; `gate-guard.test.ts` fails if one does.
- A report written by a recorded run at the committed report path. Only the owner's live run writes there.

## Run it

The runner needs Docker: each model gets its own disposable deployment with the demo history. It runs under its own Vitest config, because the module declarations it composes import `.tsx` pages, which plain Node cannot load. Options go in `EVALUATION_ARGS`.

To prove the suite on the recorded test model, which sends no request out of the machine:

```sh
EVALUATION_ARGS="--out /tmp/model-evaluation" pnpm --dir apps/genie exec vitest run --config tools/evaluation/vitest.evaluation.config.ts
```

The owner's live run, from the repository root, in a shell outside CI:

```sh
read -rs MODEL_RECORDING_KEY && export MODEL_RECORDING_KEY
EVALUATION_ARGS="--transport live --out $PWD/docs/modules/invoices-and-payments/evaluation" pnpm --dir apps/genie exec vitest run --config tools/evaluation/vitest.evaluation.config.ts
unset MODEL_RECORDING_KEY
```

- Models: `anthropic/claude-opus-5.5`, `openai/gpt-6.1-terra`, `deepseek/deepseek-v4.1-flash-1017`. Three runs per case. `--model <id>` (repeatable) and `--runs <n>` narrow a run.
- Calls: at least (7 extraction + 9 answer cases) x 3 runs x 3 models = 144 model requests, plus one more request for each tool call inside an answer. The 13 chart cases reuse the answers' calls.
- Output: `results.json` (every scored case), `report.json` and `report.md` in the `--out` folder.
- The key goes only on the request headers. The runner prints model names, case ids and pass or fail, never the key.

After the live run, the owner:

1. Commits `report.md` and `report.json` in `docs/modules/invoices-and-payments/evaluation/` (AC-11).
2. Writes the recommended chat and document models into the seed's model connection.
3. Refreshes the hand-written recordings that the tests replay (`packages/core/testing/README.md`).
