import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { gatedArea } from "../../lib/rpc/implement-core-area.ts";
import { ASK_PERMISSION } from "../authorization/roles.ts";
import { checkChart } from "../charts/index.ts";
import { agentContract } from "./contract.ts";
import { withRecordPaths } from "./record-paths.ts";
import { listOwnSessions } from "./store.ts";

// The session check and the `core:ask:use` gate run before input is parsed, so a person without
// the key is refused `forbidden` before any read, whatever the config (R-42, DEC-39). The
// break-glass account bypasses `can()`, so it is refused here as `agentAccess` refuses it (P7).
const os = gatedArea(agentContract, ASK_PERMISSION).use(
  async ({ context, next }) => {
    if ((await context.caller.grants()).bypass === true) {
      throw new AppError(CORE_ERRORS.forbidden);
    }

    return next();
  }
);

/**
 * The `agent` area, mounted by the application under `agent`: the caller's own sessions, and a
 * chart of an answer drawn through the S7-04 gate as the viewer (R-45), whose records table opens
 * each row's record (R-44).
 */
export function createAgentRouter() {
  return os.router({
    sessions: os.sessions.handler(({ context }) => listOwnSessions(context)),
    chart: os.chart.handler(async ({ context, input }) =>
      withRecordPaths(context, await checkChart(context, input.config))
    ),
  });
}

export type AgentRouter = ReturnType<typeof createAgentRouter>;
