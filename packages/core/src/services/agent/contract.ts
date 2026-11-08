import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { CheckedChart } from "../charts/index.ts";
import type { AgentArtifact } from "./artifacts.ts";
import type { AgentFile } from "./files.ts";
import type { AgentMessage, AgentSessionSummary } from "./store.ts";

export const CHAT_TITLE_LIMIT = 80;

/** A chat's name, as the owner renames it (czjw.120 item 13). */
export const chatTitleSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(CHAT_TITLE_LIMIT, "Use at most 80 characters.");

/**
 * The `agent` area's API (R-42), under core's `/agent/` area. It imports only zod and the
 * browser-safe `@genie/core/rpc` entry, so the browser client types its calls from it. The answers
 * are typed with `z.custom`, which checks nothing at run time: the store and the gate build them.
 */
export const agentContract = {
  sessions: oc
    .route({ method: "GET", path: "/agent/sessions" })
    .output(z.custom<readonly AgentSessionSummary[]>()),
  // Renames one of the caller's own sessions and keeps its place in the list (czjw.120 item 13).
  rename: oc
    .route({ method: "POST", path: "/agent/sessions/{id}/title" })
    .input(z.object({ id: z.string(), title: chatTitleSchema }))
    .output(z.custom<AgentSessionSummary>()),
  // Deletes one of the caller's own sessions with its messages, artifacts and made files.
  remove: oc
    .route({ method: "DELETE", path: "/agent/sessions/{id}" })
    .input(z.object({ id: z.string() }))
    .output(z.void()),
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
  // The list files of one of the caller's own sessions, oldest first (R-44a).
  files: oc
    .route({ method: "GET", path: "/agent/sessions/{id}/files" })
    .input(z.object({ id: z.string() }))
    .output(z.custom<readonly AgentFile[]>()),
  // A short-lived link to the caller's own made file, which only they open.
  fileLink: oc
    .route({ method: "POST", path: "/agent/files/{id}/link" })
    .input(z.object({ id: z.string() }))
    .output(z.custom<{ readonly url: string }>()),
  // The config is the model's raw panel config; the S7-04 gate is its parser.
  chart: oc
    .route({ method: "POST", path: "/agent/chart" })
    .input(z.object({ config: z.unknown() }))
    .output(z.custom<CheckedChart>()),
};

export type AgentContract = typeof agentContract;
