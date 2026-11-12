# packages/core/testing

The generic test helpers every integration test starts from.

## What belongs here

A disposable Postgres with the real migration histories applied in the order the image applies them, tenant-context construction for a test, and factories for core's own tables. A core table gets its factory in the section that creates it, so Section 0 adds none.

## Recorded test model

The recorded test model (`DEC-55`): `model-transports.ts` loads a folder of `*.json` recordings, replays the one whose whole request matches, and turns a recorded answer into a provider response and back. The no-live-model setup that `@genie/config`'s unit preset and core's integration config install refuses a request to a model host, so a test cannot reach the provider by accident (R-21, AC-5).

A recording matches its whole request, or the whole request up to a one-to-one renaming of UUIDs and 64-character hashes. A renamed match answers with the sent ids and hashes in place of its own, also inside a tool call that streams in fragments. An exact match wins, and two renamed matches are an error. A handed-over record has a new id each run, and a deck's content hash covers the read time of its figures, so this keeps their recordings stable.

A renamed match keeps every id or hash that both requests hold at its place. When it would move such a token, for example swap two known ids, the transport throws an error that names the recording and the token, so record mode never saves that request either. Re-key the recording, or fix the id that the request sends. The `sent` entry of a renamed match carries `renamed`: each pair it swapped, `{ recorded, sent }`, in the order the sent body first holds them. An exact match carries no `renamed`. A renamed match cannot tell a consistently wrong fresh id from a right one, so a test that relies on a renamed record id pins it against the id it expects, for example the id from a factory or the database.

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

### Re-key recordings after a prompt edit

A prompt or tool-description edit changes the request of every recording that carries the old text, and replay then finds no recording. The re-key command edits the request part of those recordings as text and keeps every response byte-equal. It calls no model and reads no key, so any agent can run it.

1. Write the edits to a file, for example `edits.json`: `[{ "find": "old text", "replace": "new text" }]`. Write `find` and `replace` as the decoded text. Add `"raw": true` to match the file's own JSON text instead, for example a whole tool entry, or text inside a tool call's `arguments`, which the file holds escaped twice.
2. Run the command over the recording folders that the edit touches:

```sh
node packages/core/tools/rekey-model-recordings.ts edits.json --refresh-list <list-file> \
  packages/core/testing/model-recordings apps/genie/testing/model-recordings \
  packages/modules/invoices/testing/model-recordings packages/modules/placeholder/testing/model-recordings
```

The command prints each changed file and appends it to `--refresh-list`, because a re-keyed recording still holds the answer to the old prompt. In each file an edit matches once or not at all. If an edit matches no file, matches one request twice, or leaves a file that is not JSON, the command stops and writes nothing.

## What must not go here

An import of a module, a module's factory, and any composition that knows which modules a deployment includes. A module owns its own factories, and the app harness composes them with these helpers (R-39). No database mock: a test here takes a real Postgres.

## What it imports

Testcontainers, the core migrator and the tenant-context factory beside it, and for the model transports the `ai` stream helpers, es-toolkit's `isEqual` and zod.
