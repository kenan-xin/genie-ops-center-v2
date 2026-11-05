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
  it("holds the asks, the tool inputs and what was made or opened, and no read result", () => {
    const read = {
      type: "tool-query-dataset",
      toolCallId: "c1",
      state: "output-available",
      input: { dataset: "invoices.invoices", query: { limit: 5 } },
      output: { rows: [{ total: 4812.5 }] },
    } as const;

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
            output: [{ name: "invoices.invoices", rows: 1234 }],
          },
          read,
          {
            type: "tool-make-artifact",
            toolCallId: "c2",
            state: "output-available",
            input: { kind: "table" },
            output: { artifact: 2, version: 1, title: "Open invoices" },
          },
          {
            type: "tool-open-record",
            toolCallId: "c3",
            state: "output-available",
            input: { dataset: "invoices.invoices", id: "INV-7" },
            output: { label: "INV-7", path: "/invoices/7" },
          },
          {
            type: "tool-invoices-change-status",
            toolCallId: "c4",
            state: "output-error",
            input: { id: "INV-7" },
            errorText: "Not allowed 999.",
          },
          {
            type: "tool-invoices-aging",
            toolCallId: "c5",
            state: "output-available",
            input: {},
            output: { overdue: 777 },
          },
          { type: "data-artifact", data: { artifactId: "x", version: 1 } },
          { type: "text", text: "Here they are." },
        ],
      },
    ];

    expect(
      chatTranscript({ previous: "They asked for invoices.", covered })
    ).toBe(
      [
        "Summary of the messages before these:",
        "They asked for invoices.",
        "",
        "Messages:",
        "Person: Question 1",
        "Assistant used list-datasets with {}.",
        `Assistant used query-dataset with ${JSON.stringify(read.input)}.`,
        'Assistant used make-artifact with {"kind":"table"}: made artifact 2, version 1, "Open invoices".',
        'Assistant used open-record with {"dataset":"invoices.invoices","id":"INV-7"}: opened "INV-7".',
        'Assistant used invoices-change-status with {"id":"INV-7"}: refused.',
        "Assistant used invoices-aging with {}.",
        "Assistant: Here they are.",
      ].join("\n")
    );
  });
});
