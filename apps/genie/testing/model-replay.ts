import { fileURLToPath } from "node:url";

import {
  liveRecorder,
  loadModelRecordings,
  MODEL_PROVIDER_ORIGIN,
  replayModelTransport,
} from "@genie/core/testing/model-transports";

/** The absolute path of `testing/model-recordings`: the agent answers on the app's module selection. */
export const APP_AGENT_RECORDINGS = fileURLToPath(
  new URL("model-recordings", import.meta.url)
);

/**
 * Answers this process's requests to the model origin from the recordings of `directories`
 * (DEC-55, P13). Every request to that one origin is replayed in-process, because the request
 * guard accepts only the provider's own HTTPS origin and DEC-55 allows no base-URL variable. In
 * the owner's record mode (`MODEL_RECORDING_KEY` set, never in CI), a request that no recording
 * answers goes to the provider and is saved in the first folder. The owner records the invoice
 * answers through the app test `invoice-answers.integration.test.ts`, not through this run.
 */
export function replayModelRequests(directories: readonly string[]): void {
  const [first] = directories;

  if (first === undefined) {
    throw new Error("The model stand-in got no recordings folder.");
  }

  // Before the replacement below, so record mode sends through the real fetch.
  const replay = replayModelTransport(
    directories.flatMap((directory) => loadModelRecordings(directory)),
    liveRecorder(first)
  );

  const original = globalThis.fetch;

  globalThis.fetch = (input, init) =>
    new URL(input instanceof Request ? input.url : input).origin ===
    MODEL_PROVIDER_ORIGIN
      ? replay(input, init)
      : original(input, init);
}
