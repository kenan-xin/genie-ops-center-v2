import { describe, expect, it } from "vitest";

import type { AgentSessionSummary } from "../../services/agent/index.ts";
import { sessionGroups, surfaceSessionGroups } from "./session-groups.ts";

function chat(id: string, updatedAt: string): AgentSessionSummary {
  return {
    id,
    title: id,
    modelId: "m",
    surface: "core:ask",
    recordId: null,
    runState: null,
    updatedAt,
  };
}

function slidesChat(id: string, recordId: string): AgentSessionSummary {
  return {
    ...chat(id, "2026-10-27T02:00:00.000Z"),
    surface: "slides",
    recordId,
  };
}

function labelled(groups: ReturnType<typeof surfaceSessionGroups>) {
  return groups.map((group) => [
    group.label,
    group.sessions.map(({ id }) => id),
  ]);
}

describe("surfaceSessionGroups", () => {
  it("puts this record's chats first, in list order, and leaves out an empty group", () => {
    expect(
      labelled(
        surfaceSessionGroups(
          [
            slidesChat("a", "r1"),
            slidesChat("b", "r2"),
            slidesChat("c", "r1"),
            slidesChat("d", "r2"),
          ],
          "r2"
        )
      )
    ).toEqual([
      ["On this page", ["b", "d"]],
      ["Other chats", ["a", "c"]],
    ]);
    expect(
      labelled(surfaceSessionGroups([slidesChat("a", "r1")], "r1"))
    ).toEqual([["On this page", ["a"]]]);
  });
});

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

    expect(labelled(groups)).toEqual([
      ["Today", ["early-today"]],
      ["Earlier", ["late-yesterday"]],
    ]);
  });
});
