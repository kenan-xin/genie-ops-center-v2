# packages/core/testing

The generic test helpers every integration test starts from.

## What belongs here

A disposable Postgres with the real migration histories applied in the order the image applies them, tenant-context construction for a test, and factories for core's own tables. A core table gets its factory in the section that creates it, so Section 0 adds none.

## Recorded test model

The recorded test model (`DEC-55`): `model-transports.ts` loads a folder of `*.json` recordings, replays the one whose whole request matches, and turns a recorded answer into a provider response and back. The no-live-model setup that `@genie/config`'s unit preset and core's integration config install refuses a request to a model host, so a test cannot reach the provider by accident (R-21, AC-5).

Only the owner refreshes `model-recordings/`, from a live run in their own shell. The script prints names and statuses, never the key, refuses to run in CI, and changes only files under the directories it is given. It never runs in a gate.

```sh
read -rs MODEL_RECORDING_KEY && export MODEL_RECORDING_KEY
node packages/core/tools/refresh-model-recordings.ts packages/core/testing/model-recordings
unset MODEL_RECORDING_KEY
```

The refresh script replays each saved request one time. A recording whose live answer calls a tool needs a new recording for the request that follows the tool result, so the script cannot refresh an agent conversation. Use record mode for that. With `MODEL_RECORDING_KEY` set outside CI, the no-live-model guard steps aside, and a request that no recording answers goes to the provider and is saved beside the others as `live-<hash>.json`. Delete the stale recordings of the conversation first, run the tests that use them, then update the expected answers in those tests.

```sh
read -rs MODEL_RECORDING_KEY && export MODEL_RECORDING_KEY
pnpm nx run @genie/module-placeholder:test:integration --skip-nx-cache
unset MODEL_RECORDING_KEY
```

## What must not go here

An import of a module, a module's factory, and any composition that knows which modules a deployment includes. A module owns its own factories, and the app harness composes them with these helpers (R-39). No database mock: a test here takes a real Postgres.

## What it imports

Testcontainers, the core migrator and the tenant-context factory beside it, and for the model transports the `ai` stream helpers, es-toolkit's `isEqual` and zod.
