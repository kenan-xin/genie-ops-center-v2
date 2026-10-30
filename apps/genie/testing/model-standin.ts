import { replayModelRequests } from "./model-replay.ts";

/**
 * The development browser run's model (DEC-55, P13). `NODE_OPTIONS=--import` loads this file into
 * `next dev` before the server starts, and it answers every request to the model origin from the
 * recordings in `GENIE_E2E_MODEL_RECORDINGS` (see `model-replay.ts`), so no request of the run
 * reaches a model host. A missing folder throws, which stops `next dev`: the run fails closed.
 */
const directory = process.env.GENIE_E2E_MODEL_RECORDINGS;

if (directory === undefined || directory === "") {
  throw new Error(
    "GENIE_E2E_MODEL_RECORDINGS is not set. The model stand-in will not load without its recordings."
  );
}

replayModelRequests(directory);
