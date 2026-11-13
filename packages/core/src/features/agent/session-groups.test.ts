import { describe, expect, it } from "vitest";

import type {
  AgentHistoryEntry,
  AgentSessionSummary,
} from "../../services/agent/index.ts";
import type { AgentRunStatus } from "../../services/agent/runs.ts";
import { agentHistoryGroups, surfaceSessionGroups } from "./session-groups.ts";

function chat(id: string, updatedAt: string): AgentSessionSummary {
  return {
    id,
    title: id,
    modelId: "m",
    surface: "core:ask",
    recordId: null,
    runState: null,
    run: null,
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

function entry(
  id: string,
  surface: string,
  run: AgentRunStatus | null = null
): AgentHistoryEntry {
  return {
    ...chat(id, "2026-11-05T01:00:00Z"),
    surface,
    run,
    unseen: false,
    agentName: null,
    address: null,
  };
}

const SURFACES = [
  {
    id: "slides",
    name: "Slides agent",
    label: "Slides",
    recordPage: "/m/slides/decks/:id",
    acceptsHandoff: true,
  },
  {
    id: "analytics",
    name: "Dashboards agent",
    recordPage: "/m/analytics/dashboards/:id",
    acceptsHandoff: true,
  },
];

describe("agentHistoryGroups", () => {
  it("puts Ask first, then each listed surface in list order, and Recents holds the newest 6", () => {
    // The history comes newest first; a chat of a surface that is not listed has no page to open.
    const { groups, recents } = agentHistoryGroups(
      [
        entry("d1", "analytics"),
        entry("s1", "slides", "building"),
        entry("gone", "invoices"),
        entry("a1", "core:ask"),
        entry("s2", "slides", "saved"),
        entry("a2", "core:ask", "saved"),
        entry("s3", "slides"),
        entry("a3", "core:ask"),
      ],
      SURFACES
    );

    expect(
      groups.map((group) => [
        group.label,
        group.entries.map(({ id }) => id),
        group.working,
      ])
    ).toEqual([
      ["Ask", ["a1", "a2", "a3"], false],
      ["Slides", ["s1", "s2", "s3"], true],
      // No label: the group takes the surface's name.
      ["Dashboards agent", ["d1"], false],
    ]);
    expect(recents.map(({ id }) => id)).toEqual([
      "d1",
      "s1",
      "a1",
      "s2",
      "a2",
      "s3",
    ]);
  });

  it("leaves out a surface with no chats, keeps a chat with no address, and a stopping run still works", () => {
    const { groups, recents } = agentHistoryGroups(
      [
        entry("s1", "slides", "stopping"),
        // A surface chat with no record has no address; it is still listed (shown without a link).
        { ...entry("s2", "slides"), recordId: null, address: null },
      ],
      SURFACES
    );

    expect(
      groups.map(({ key, working, entries }) => [
        key,
        working,
        entries.map(({ id }) => id),
      ])
    ).toEqual([["slides", true, ["s1", "s2"]]]);
    expect(recents.map(({ id }) => id)).toEqual(["s1", "s2"]);
  });
});
