import { gatedArea } from "../../lib/rpc/implement-core-area.ts";
import { ASK_PERMISSION } from "../authorization/roles.ts";
import { checkChart } from "../charts/index.ts";
import { agentContract } from "./contract.ts";
import { listOwnSessions } from "./store.ts";

// The session check and the `core:ask:use` gate run before input is parsed, so a person without
// the key is refused `forbidden` before any read, whatever the config (R-42, DEC-39).
const os = gatedArea(agentContract, ASK_PERMISSION);

/**
 * The `agent` area, mounted by the application under `agent`: the caller's own sessions, and a
 * chart of an answer drawn through the S7-04 gate as the viewer (R-45).
 */
export function createAgentRouter() {
  return os.router({
    sessions: os.sessions.handler(({ context }) => listOwnSessions(context)),
    chart: os.chart.handler(({ context, input }) =>
      checkChart(context, input.config)
    ),
  });
}

export type AgentRouter = ReturnType<typeof createAgentRouter>;
