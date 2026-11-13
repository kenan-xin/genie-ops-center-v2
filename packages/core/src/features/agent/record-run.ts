"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import { agentContract } from "../../services/agent/contract.ts";
import type { AgentSessionSummary } from "../../services/agent/index.ts";
import type { AgentRunStatus } from "../../services/agent/runs.ts";
import { agentPanelStore, setPanelOpen } from "./agent-panel-store.ts";
import { runPollInterval } from "./session-detail.ts";

/** How often a page reads its record's run while none builds, so a run started in the panel shows. */
const IDLE_POLL_MS = 10_000;

const active = (run: AgentRunStatus | null | undefined) =>
  run === "building" || run === "stopping";

export type RecordRun = {
  readonly sessionId: string;
  readonly title: string;
  readonly run: AgentRunStatus | null;
};

/** The record's chat whose run builds or stops, else its newest chat, else null. */
export function recordRunOf(
  sessions: readonly AgentSessionSummary[],
  recordId: string
): RecordRun | null {
  const own = sessions.filter((session) => session.recordId === recordId);

  const found =
    own.find(({ run }) => active(run)) ??
    own.reduce<AgentSessionSummary | undefined>(
      (newest, session) =>
        newest === undefined || session.updatedAt > newest.updatedAt
          ? session
          : newest,
      undefined
    );

  return found === undefined
    ? null
    : { sessionId: found.id, title: found.title, run: found.run };
}

export type SeenRun = {
  readonly sessionId: string | null;
  readonly active: boolean;
  readonly endedHere: boolean;
};

/**
 * The next state after one read. `endedHere` turns true when the same chat's run went from building
 * or stopping to an end, and false when it builds again. An unchanged read answers the same object.
 */
export function seenRun(
  seen: SeenRun,
  sessionId: string | null,
  run: AgentRunStatus | null
): SeenRun {
  const now = active(run);

  if (sessionId === seen.sessionId && now === seen.active) return seen;

  return {
    sessionId,
    active: now,
    endedHere:
      !now && seen.active && sessionId === seen.sessionId && run !== null,
  };
}

export type RecordRunHandle = {
  readonly sessionId: string | null;
  readonly sessionTitle: string | null;
  readonly run: AgentRunStatus | null;
  /** This mount saw the run go from building or stopping to an end. */
  readonly endedHere: boolean;
  readonly stop: () => void;
  readonly refresh: () => void;
};

const UNSEEN: SeenRun = { sessionId: null, active: false, endedHere: false };

/**
 * The run of one record of a surface, for its page, with or without the panel. It reads the
 * record's chats each second while the run builds or stops, else every ten seconds.
 */
export function useRecordRun(input: {
  readonly surface: string;
  readonly recordId: string;
  readonly enabled: boolean;
}): RecordRunHandle {
  const agent = useModuleClient(agentContract);
  const { surface, recordId, enabled } = input;

  // The panel's key, so a refetch in the panel also reaches the page.
  const sessions = useQuery({
    queryKey: ["agent", "sessions", surface, recordId],
    queryFn: () => agent.sessions({ surface, recordId }),
    enabled,
    staleTime: 0,
    refetchInterval: (query) =>
      runPollInterval({
        session: {
          run: recordRunOf(query.state.data ?? [], recordId)?.run ?? null,
        },
      }) || IDLE_POLL_MS,
  });

  const stopRun = useMutation({
    mutationFn: (id: string) => agent.stop({ id }),
    onSettled: () => sessions.refetch(),
  });

  // The cache may hold the panel's read, so a disabled page reads nothing from it either.
  const found = enabled ? recordRunOf(sessions.data ?? [], recordId) : null;
  const sessionId = found?.sessionId ?? null;
  const run = found?.run ?? null;

  const [seen, setSeen] = useState(UNSEEN);
  const next = seenRun(seen, sessionId, run);

  if (next !== seen) setSeen(next);

  return {
    sessionId,
    sessionTitle: found?.title ?? null,
    run,
    endedHere: next.endedHere,
    stop: () => {
      if (sessionId !== null) stopRun.mutate(sessionId);
    },
    refresh: () => {
      if (enabled) void sessions.refetch();
    },
  };
}

/**
 * Starts a surface's run on a new record from its list page (S7-48). On success it opens the panel
 * and the record's page, through the app's router when the panel host registered one.
 */
export function useStartRecordRun(surface: string) {
  const agent = useModuleClient(agentContract);

  return useMutation({
    mutationFn: (description: string) => agent.start({ surface, description }),
    onSuccess: ({ address }) => {
      setPanelOpen(true);

      const { navigate } = agentPanelStore.getState();

      if (navigate === null) window.location.assign(address);
      else navigate(address);
    },
  });
}
