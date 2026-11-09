"use client";

import { useQuery } from "@tanstack/react-query";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import { agentContract } from "../../services/agent/contract.ts";
import type { AgentRunStatus } from "../../services/agent/runs.ts";

/** How often a page reads a session while its run builds (R-42b, "within about a second"). */
export const RUN_POLL_MS = 1000;

/** RUN_POLL_MS while the run builds or stops, else false. */
export function runPollInterval(
  detail:
    | { readonly session: { readonly run: AgentRunStatus | null } }
    | null
    | undefined
): number | false {
  const run = detail?.session.run;

  return run === "building" || run === "stopping" ? RUN_POLL_MS : false;
}

/**
 * One session with its run status and messages (`agent.session`), read again each second while its
 * run builds (P11-32). The card, the chip and the chat share this key, so they read once.
 */
export function useSessionDetail(
  sessionId: string,
  options: { readonly enabled?: boolean } = {}
) {
  const agent = useModuleClient(agentContract);

  return useQuery({
    queryKey: ["agent", "session", sessionId],
    queryFn: () => agent.session({ id: sessionId }),
    enabled: options.enabled ?? true,
    staleTime: 0,
    refetchInterval: (query) => runPollInterval(query.state.data),
  });
}
