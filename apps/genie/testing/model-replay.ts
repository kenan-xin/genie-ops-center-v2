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
 * Answers this process's requests to the model origin from the recordings of `directory`
 * (DEC-55, P13). Every request to that one origin is replayed in-process, because the request
 * guard accepts only the provider's own HTTPS origin and DEC-55 allows no base-URL variable. In
 * the owner's record mode (`MODEL_RECORDING_KEY` set, never in CI), a request that no recording
 * answers goes to the provider and is saved in that folder.
 */
export function replayModelRequests(directory: string): void {
  // Before the replacement below, so record mode sends through the real fetch.
  const replay = replayModelTransport(
    loadModelRecordings(directory),
    liveRecorder(directory)
  );

  const original = globalThis.fetch;

  globalThis.fetch = (input, init) =>
    new URL(input instanceof Request ? input.url : input).origin ===
    MODEL_PROVIDER_ORIGIN
      ? replay(input, init)
      : original(input, init);
}
