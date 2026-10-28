/**
 * Refreshes the recorded test model from a live run (DEC-55). Only the owner runs it, from a shell
 * with the key, never in CI and outside every gate. It changes only files under the directories it
 * is given, and prints names and statuses, never the key.
 *
 *   read -rs MODEL_RECORDING_KEY && export MODEL_RECORDING_KEY
 *   node packages/core/tools/refresh-model-recordings.ts packages/core/testing/model-recordings
 *   unset MODEL_RECORDING_KEY
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  guardedModelFetch,
  MODEL_PROVIDER_ORIGIN,
  MODEL_REQUEST_TIMEOUT_MS,
} from "../src/services/models/connection.ts";
import {
  CORE_MODEL_RECORDINGS,
  loadModelRecordings,
  recordingFromResponse,
} from "../testing/model-transports.ts";

if (process.env.CI !== undefined) {
  console.error("The refresh script calls a live model. It never runs in CI.");
  process.exit(1);
}

const key = process.env.MODEL_RECORDING_KEY;

if (!key) {
  console.error(
    "Set MODEL_RECORDING_KEY in this shell first: read -rs MODEL_RECORDING_KEY && export MODEL_RECORDING_KEY"
  );
  process.exit(1);
}

const directories =
  process.argv.length > 2 ? process.argv.slice(2) : [CORE_MODEL_RECORDINGS];

// The guard carries the key: it checks the key before it touches the headers, so the
// request is the only place the key exists outside this shell.
const send = guardedModelFetch(globalThis.fetch, {
  origin: MODEL_PROVIDER_ORIGIN,
  timeoutMs: MODEL_REQUEST_TIMEOUT_MS,
  apiKey: key,
});

let failed = false;

/* oxlint-disable no-await-in-loop -- one live request at a time, in the order the owner reads. */
for (const directory of directories) {
  const recordings = loadModelRecordings(directory).toSorted((left, right) =>
    left.name.localeCompare(right.name)
  );

  for (const recording of recordings) {
    const response = await send(recording.request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(recording.request.body),
    });

    if (!response.ok) {
      console.log(`${recording.name}: HTTP ${response.status}`);
      failed = true;
      continue;
    }

    await writeFile(
      join(directory, `${recording.name}.json`),
      `${JSON.stringify(
        { ...recording, response: await recordingFromResponse(response) },
        undefined,
        2
      )}\n`,
      "utf8"
    );

    console.log(`${recording.name}: refreshed`);
  }
}
/* oxlint-enable no-await-in-loop */

process.exit(failed ? 1 : 0);
