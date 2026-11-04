import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { CheckedChart } from "../charts/index.ts";
import type { AgentArtifact } from "./artifacts.ts";
import type { AgentMessage, AgentSessionSummary } from "./store.ts";

/**
 * The `agent` area's API (R-42), under core's `/agent/` area. It imports only zod and the
 * browser-safe `@genie/core/rpc` entry, so the browser client types its calls from it. The answers
 * are typed with `z.custom`, which checks nothing at run time: the store and the gate build them.
 */
export const agentContract = {
  sessions: oc
    .route({ method: "GET", path: "/agent/sessions" })
    .output(z.custom<readonly AgentSessionSummary[]>()),
  // The messages of one of the caller's own sessions; none for an id not saved yet.
  messages: oc
    .route({ method: "GET", path: "/agent/sessions/{id}/messages" })
    .input(z.object({ id: z.string() }))
    .output(z.custom<readonly AgentMessage[]>()),
  // The artifacts of one of the caller's own sessions, each with every version (R-45a).
  artifacts: oc
    .route({ method: "GET", path: "/agent/sessions/{id}/artifacts" })
    .input(z.object({ id: z.string() }))
    .output(z.custom<readonly AgentArtifact[]>()),
  // The config is the model's raw panel config; the S7-04 gate is its parser.
  chart: oc
    .route({ method: "POST", path: "/agent/chart" })
    .input(z.object({ config: z.unknown() }))
    .output(z.custom<CheckedChart>()),
};

export type AgentContract = typeof agentContract;
