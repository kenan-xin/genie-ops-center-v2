import { describe, expect, it } from "vitest";

import {
  chatTranscript,
  COMPACTION_INPUT_TOKENS,
  compactionPlan,
} from "./compaction.ts";
import type { AgentMessage, OwnHistory } from "./store.ts";

function user(index: number): AgentMessage {
  return {
    id: `u${index}`,
    role: "user",
    parts: [{ type: "text", text: `Question ${index}` }],
  };
}

function answer(index: number): AgentMessage {
  return {
    id: `a${index}`,
    role: "assistant",
    parts: [{ type: "text", text: `Answer ${index}` }],
  };
}

/** `turns` questions with their answers, then the new question; seq counts from 100. */
function history(turns: number, lastInputTokens: number | null): OwnHistory {
  const messages = [
    ...Array.from({ length: turns }, (_, i) => [user(i), answer(i)]).flat(),
    user(turns),
  ];

  return {
    summary: null,
    summaryThroughSeq: null,
    lastInputTokens,
    messages: messages.map((message, i) => ({ seq: 100 + i, message })),
  };
}

describe("when a chat summarizes", () => {
  it("summarizes past 40 messages or a large input, and keeps whole turns from a question", () => {
    // 19 turns and a new question are 39 messages; one more makes exactly 40.
    const short = history(19, 1000);

    const atLimit = {
      ...short,
      messages: [...short.messages, { seq: 999, message: answer(99) }],
    };

    expect(atLimit.messages).toHaveLength(40);
    expect(compactionPlan(atLimit)).toEqual({ compact: false });

    const long = compactionPlan(history(20, 1000));

    expect(long).toEqual({
      compact: true,
      covered: history(20, null)
        .messages.slice(0, 32)
        .map((m) => m.message),
      kept: history(20, null)
        .messages.slice(32)
        .map((m) => m.message),
      throughSeq: 131,
      throughMessageId: "a15",
    });

    const large = compactionPlan(history(6, COMPACTION_INPUT_TOKENS));

    expect(large).toMatchObject({
      compact: true,
      kept: [user(6)],
      throughSeq: 111,
      throughMessageId: "a5",
    });

    expect(compactionPlan(history(0, COMPACTION_INPUT_TOKENS))).toEqual({
      compact: false,
    });

    // A turn that stored no answer leaves two questions in a row; the cut still ends on an answer.
    const unanswered = history(6, COMPACTION_INPUT_TOKENS);

    expect(
      compactionPlan({
        ...unanswered,
        messages: [...unanswered.messages, { seq: 200, message: user(7) }],
      })
    ).toMatchObject({
      compact: true,
      kept: [user(6), user(7)],
      throughSeq: 111,
      throughMessageId: "a5",
    });
  });
});

describe("the transcript the summary call reads", () => {
  it("writes each step in the timeline's words, names a dataset by its title, and holds no read result", () => {
    const covered: AgentMessage[] = [
      user(1),
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-list-datasets",
            toolCallId: "c0",
            state: "output-available",
            input: {},
            output: [{ name: "example.items", rows: 1234 }],
          },
          {
            type: "tool-query-dataset",
            toolCallId: "c1",
            state: "output-available",
            input: {
              dataset: "example.items",
              query: { select: ["amountCents"], limit: 5 },
            },
            output: { rows: [{ amountCents: 481_250 }] },
          },
          {
            type: "tool-make-artifact",
            toolCallId: "c2",
            state: "output-available",
            input: { config: { type: "table" } },
            output: { artifact: 2, version: 1, title: "Open items" },
          },
          {
            type: "tool-open-record",
            toolCallId: "c3",
            state: "output-available",
            input: { dataset: "example.items", id: "ITEM-7" },
            output: { label: "ITEM-7", path: "/items/7" },
          },
          {
            type: "tool-example-change-status",
            toolCallId: "c4",
            state: "output-error",
            input: { id: "ITEM-7" },
            errorText: "Not allowed 999.",
          },
          {
            type: "tool-example-aging",
            toolCallId: "c5",
            state: "output-available",
            input: {},
            output: { overdue: 777 },
          },
          {
            type: "tool-make-file",
            toolCallId: "c6",
            state: "output-available",
            input: { format: "csv" },
            output: { file: "f1" },
          },
          { type: "data-artifact", data: { artifactId: "x", version: 1 } },
          { type: "text", text: "Here they are." },
        ],
      },
    ];

    const transcript = chatTranscript({
      previous: "They asked for items.",
      covered,
      labels: {
        steps: {
          "example-change-status": {
            active: "Changing the status",
            done: "Changed the status",
            failed: "Could not change the status",
          },
        },
        datasets: { "example.items": "Example items" },
        fields: {},
      },
    });

    expect(transcript).toBe(
      [
        "Summary of the messages before these:",
        "They asked for items.",
        "",
        "Messages:",
        "Person: Question 1",
        "Assistant step: Looked up the data.",
        "Assistant step: Read Example items.",
        'Assistant step: Made a table: artifact 2, version 1, "Open items".',
        'Assistant step: Opened a record: "ITEM-7".',
        "Assistant step: Could not change the status.",
        "Assistant step: Used a tool.",
        "Assistant step: Made a CSV file.",
        "Assistant: Here they are.",
      ].join("\n")
    );

    for (const name of [
      "example.items",
      "amountCents",
      "query-dataset",
      "make-artifact",
      "481250",
    ]) {
      expect(transcript).not.toContain(name);
    }
  });
});
