import {
  liveRecorder,
  loadModelRecordings,
  MODEL_PROVIDER_ORIGIN,
  replayModelTransport,
} from "@genie/core/testing/model-transports";

/**
 * The development browser run's model (DEC-55, P13). `NODE_OPTIONS=--import` loads this file into
 * `next dev` before the server starts, and it answers every request to the model origin from the
 * recordings in `GENIE_E2E_MODEL_RECORDINGS`, so no request of the run reaches a model host. It
 * is in-process because the request guard accepts only the provider's own HTTPS origin, and
 * DEC-55 allows no base-URL variable. A missing folder throws, which stops `next dev`: the run
 * fails closed. In the owner's record mode (`MODEL_RECORDING_KEY` set, never in CI), a request
 * that no recording answers goes to the provider and is saved in that folder.
 */
const directory = process.env.GENIE_E2E_MODEL_RECORDINGS;

if (directory === undefined || directory === "") {
  throw new Error(
    "GENIE_E2E_MODEL_RECORDINGS is not set. The model stand-in will not load without its recordings."
  );
}

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
