import { delimiter } from "node:path";

import { replayModelRequests } from "./model-replay.ts";

/**
 * The development browser run's model (DEC-55, P13). `NODE_OPTIONS=--import` loads this file into
 * `next dev` before the server starts, and it answers every request to the model origin from the
 * recordings in `GENIE_E2E_MODEL_RECORDINGS`, a list of folders joined with the path delimiter
 * (see `model-replay.ts`), so no request of the run reaches a model host. Record mode saves into
 * the first folder. A missing folder throws, which stops `next dev`: the run fails closed.
 */
const directories = process.env.GENIE_E2E_MODEL_RECORDINGS;

if (directories === undefined || directories === "") {
  throw new Error(
    "GENIE_E2E_MODEL_RECORDINGS is not set. The model stand-in will not load without its recordings."
  );
}

replayModelRequests(directories.split(delimiter));
