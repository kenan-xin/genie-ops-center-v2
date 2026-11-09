import type { AgentSessionSummary } from "../../services/agent/index.ts";

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

/**
 * The chat history's groups (AG22): the chats of today in the tenant's zone, then the rest, each
 * in the list's order. An empty group is left out.
 */
export function sessionGroups(
  sessions: readonly AgentSessionSummary[],
  timeZone: string,
  now: Date
): readonly SessionGroup[] {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const today = day.format(now);

  const groups: readonly SessionGroup[] = [
    {
      label: "Today",
      sessions: sessions.filter(
        (session) => day.format(new Date(session.updatedAt)) === today
      ),
    },
    {
      label: "Earlier",
      sessions: sessions.filter(
        (session) => day.format(new Date(session.updatedAt)) !== today
      ),
    },
  ];

  return groups.filter((group) => group.sessions.length > 0);
}
