import { describe, expect, it } from "vitest";

import type { AgentSessionSummary } from "../../services/agent/index.ts";
import { sessionGroups } from "./session-groups.ts";

function chat(id: string, updatedAt: string): AgentSessionSummary {
  return {
    id,
    title: id,
    modelId: "m",
    surface: "core:ask",
    runState: null,
    updatedAt,
  };
}

describe("sessionGroups", () => {
  it("groups chats by the day in the tenant's zone", () => {
    // 09:00 on 5 Nov in Singapore.
    const now = new Date("2026-11-05T01:00:00Z");

    const groups = sessionGroups(
      [
        // 01:30 on 5 Nov in Singapore, but still 4 Nov in UTC.
        chat("early-today", "2026-11-04T17:30:00Z"),
        // 23:59 on 4 Nov in Singapore.
        chat("late-yesterday", "2026-11-04T15:59:00Z"),
      ],
      "Asia/Singapore",
      now
    );

    expect(
      groups.map((group) => [
        group.label,
        group.sessions.map((session) => session.id),
      ])
    ).toEqual([
      ["Today", ["early-today"]],
      ["Earlier", ["late-yesterday"]],
    ]);
  });
});
