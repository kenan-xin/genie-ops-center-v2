"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

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

/** The query key of Ask's history (`agent.history`), which a seen chat refreshes. */
export const HISTORY_KEY = ["agent", "history"];

/**
 * Clears the open chat's unseen mark (R12): when the chat shows with a session that has a run, and
 * again when its run leaves building or stopping while it shows, so a run the person watched end
 * gets no dot. A hidden chat (the closed panel keeps it mounted) or a chat that never ran marks
 * nothing.
 */
export function useMarkSeen(
  sessionId: string,
  detail:
    | { readonly session: { readonly run: AgentRunStatus | null } }
    | null
    | undefined,
  visible: boolean
): void {
  const agent = useModuleClient(agentContract);
  const queryClient = useQueryClient();

  const { mutate } = useMutation({
    mutationFn: () => agent.markSeen({ sessionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HISTORY_KEY }),
  });

  // A chat not saved yet (a null read) or that never ran has no unseen mark to clear.
  const ran = (detail?.session.run ?? null) !== null;
  const working = runPollInterval(detail) !== false;

  useEffect(() => {
    if (visible && ran && !working) mutate();
  }, [mutate, sessionId, visible, ran, working]);
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
