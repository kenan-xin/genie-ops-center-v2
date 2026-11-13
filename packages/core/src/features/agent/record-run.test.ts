import { describe, expect, it } from "vitest";

import type { AgentSessionSummary } from "../../services/agent/index.ts";
import type { AgentRunStatus } from "../../services/agent/runs.ts";
import { recordRunOf, type SeenRun, seenRun } from "./record-run.ts";

const RECORD = "record-1";

function session(
  id: string,
  recordId: string,
  run: AgentRunStatus | null,
  updatedAt: string
): AgentSessionSummary {
  return {
    id,
    title: `Chat ${id}`,
    modelId: "openai/gpt-6.1-terra",
    surface: "example",
    recordId,
    runState: null,
    run,
    updatedAt,
  };
}

describe("recordRunOf", () => {
  it.each([
    {
      // Bug: the page reads the newest chat and misses the run that still builds.
      case: "a building run of the record wins over a newer ended chat",
      sessions: [
        session("ended", RECORD, "saved", "2026-11-13T10:00:00.000Z"),
        session("building", RECORD, "building", "2026-11-13T09:00:00.000Z"),
      ],
      answer: {
        sessionId: "building",
        title: "Chat building",
        run: "building",
      },
    },
    {
      // Bug: the list answers other records' chats too, and the page follows another record's run.
      case: "a chat of another record is never picked",
      sessions: [
        session("other", "record-2", "building", "2026-11-13T10:00:00.000Z"),
        session("mine", RECORD, "stopped", "2026-11-13T09:00:00.000Z"),
      ],
      answer: { sessionId: "mine", title: "Chat mine", run: "stopped" },
    },
    {
      // Bug: with no run the page shows an old chat's end state, not the latest one.
      case: "with no run, the newest chat of the record and its ended run",
      sessions: [
        session("old", RECORD, "saved", "2026-11-13T08:00:00.000Z"),
        session("new", RECORD, "failed", "2026-11-13T09:00:00.000Z"),
      ],
      answer: { sessionId: "new", title: "Chat new", run: "failed" },
    },
    {
      // Bug: a record with no chat reads as one with a run, so the page shows Stop.
      case: "no chat answers null",
      sessions: [],
      answer: null,
    },
  ])("$case", ({ sessions, answer }) => {
    expect(recordRunOf(sessions, RECORD)).toEqual(answer);
  });
});

describe("seenRun", () => {
  const start: SeenRun = { sessionId: null, active: false, endedHere: false };

  function walk(
    ...reads: readonly (readonly [string | null, AgentRunStatus | null])[]
  ) {
    return reads.reduce(
      (seen, [sessionId, run]) => seenRun(seen, sessionId, run),
      start
    ).endedHere;
  }

  it("is true only after this mount saw the run build and then end", () => {
    expect([
      // Bug: a page opened after the run ended acts as if it just ended.
      walk(["s", "saved"]),
      walk(["s", "building"], ["s", "stopping"], ["s", "stopped"]),
      // Bug: the next poll of the ended run flips it back, so the page misses the end.
      walk(["s", "building"], ["s", "saved"], ["s", "saved"]),
      // Bug: Try again builds again, and the page still says the run ended.
      walk(["s", "building"], ["s", "saved"], ["s", "building"]),
      // Bug: another chat's ended run counts as this run's end.
      walk(["s", "building"], ["t", "saved"]),
    ]).toEqual([false, true, true, false, false]);
  });
});
