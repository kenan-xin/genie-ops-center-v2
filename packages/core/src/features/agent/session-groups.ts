import { ASK_SURFACE } from "../../lib/module-contract/agent-tools.ts";
import type {
  AgentHistoryEntry,
  AgentSessionSummary,
} from "../../services/agent/index.ts";
import type { AgentRunStatus } from "../../services/agent/runs.ts";
import type { SurfaceView } from "../../services/agent/surface-address.ts";

export type SessionGroup = {
  readonly label: string;
  readonly sessions: readonly AgentSessionSummary[];
};

/** A surface panel's groups (R-42): "On this page", then "Other chats"; an empty group is left out. */
export function surfaceSessionGroups(
  sessions: readonly AgentSessionSummary[],
  recordId: string
): readonly SessionGroup[] {
  const groups: readonly SessionGroup[] = [
    {
      label: "On this page",
      sessions: sessions.filter((session) => session.recordId === recordId),
    },
    {
      label: "Other chats",
      sessions: sessions.filter((session) => session.recordId !== recordId),
    },
  ];

  return groups.filter((group) => group.sessions.length > 0);
}

/** A run that builds or stops still works, so its chat shows the spinner. */
export function isWorking(run: AgentRunStatus | null | undefined): boolean {
  return run === "building" || run === "stopping";
}

export type AgentHistoryGroup = {
  /** The surface id; Ask's is `core:ask`. */
  readonly key: string;
  readonly label: string;
  readonly entries: readonly AgentHistoryEntry[];
  /** One of its chats works, so the group keeps a spinner while folded. */
  readonly working: boolean;
};

/** How many chats Recents lists (DEC-57 item 11). */
const RECENTS = 6;

/**
 * Ask's history by agent (DEC-57 item 11): Ask first, then each listed surface in list order, each
 * group in the list's order and an empty one left out; Recents is the newest 6 of them all. A chat
 * of a surface that is not listed is left out, as it has no page to open.
 */
export function agentHistoryGroups(
  entries: readonly AgentHistoryEntry[],
  surfaces: readonly SurfaceView[]
) {
  const agents = [
    { id: ASK_SURFACE, label: "Ask" },
    ...surfaces.map(({ id, name, label }) => ({ id, label: label ?? name })),
  ];

  const groups = agents.flatMap(({ id, label }): AgentHistoryGroup[] => {
    const own = entries.filter((entry) => entry.surface === id);

    return own.length === 0
      ? []
      : [
          {
            key: id,
            label,
            entries: own,
            working: own.some((entry) => isWorking(entry.run)),
          },
        ];
  });

  const listed = new Set(agents.map(({ id }) => id));

  return {
    groups,
    recents: entries
      .filter((entry) => listed.has(entry.surface))
      .slice(0, RECENTS),
  };
}
