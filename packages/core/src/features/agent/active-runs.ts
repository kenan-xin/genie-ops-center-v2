"use client";

import { useQuery } from "@tanstack/react-query";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import { agentContract } from "../../services/agent/contract.ts";

/** The query key of `agent.activeRuns`, which a handoff refreshes, as it starts a run. */
export const ACTIVE_RUNS_KEY = ["agent", "active-runs"];

/** 5 s while a run works, else 30 s, and 30 s after a refused read (R15). */
export function activeRunsInterval(state: {
  readonly status: "pending" | "error" | "success";
  readonly data?: { readonly count: number } | undefined;
}): number {
  return state.status !== "error" && (state.data?.count ?? 0) > 0
    ? 5000
    : 30_000;
}

/**
 * How many of the person's runs work (`agent.activeRuns`), for the spinner on Ask in the main menu
 * (R15): read every 5 s while one works, else every 30 s, and when the window gets focus.
 */
export function useActiveRuns(): number {
  const agent = useModuleClient(agentContract);

  // A refused read (Ask taken away mid-session) shows no spinner and waits the long interval; it
  // is not retried, as this read runs on every page with no action of the person.
  const { data, isError } = useQuery({
    queryKey: ACTIVE_RUNS_KEY,
    queryFn: () => agent.activeRuns(),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => activeRunsInterval(query.state),
  });

  return isError ? 0 : (data?.count ?? 0);
}
