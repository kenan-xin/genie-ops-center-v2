import { describe, expect, it } from "vitest";

import {
  durationLabel,
  elapsedLabel,
  isSlow,
  type MessagePart,
  rowText,
  shownRows,
  stepTimeline,
} from "./step-model.ts";

const LABELS = {
  steps: {},
  datasets: { "ledger.invoices": "Invoices", "ledger.payments": "Payments" },
  fields: {},
};

let calls = 0;

function read(dataset: string): MessagePart {
  calls += 1;

  return {
    type: "tool-query-dataset",
    toolCallId: `call-${calls}`,
    state: "output-available",
    input: { dataset, query: {} },
    output: { rows: [] },
  };
}

function chart(state: "done" | "refused" | "running"): MessagePart {
  calls += 1;

  const input = { config: { type: "bar" } };

  const toolCallId = `call-${calls}`;

  if (state === "done") {
    return {
      type: "tool-make-artifact",
      toolCallId,
      state: "output-available",
      input,
      output: { artifact: 1, version: 1 },
    };
  }

  return state === "refused"
    ? {
        type: "tool-make-artifact",
        toolCallId,
        state: "output-error",
        input,
        errorText: 'Field "qty" is not in the dataset.',
      }
    : {
        type: "tool-make-artifact",
        toolCallId,
        state: "input-available",
        input,
      };
}

const answerText: MessagePart = { type: "text", text: "Done." };

/** A fake module tool that adds one slide of a planned deck per call. */
const DECK_LABELS = {
  ...LABELS,
  steps: {
    "deck-add": {
      active: "Changing the deck",
      done: "Changed the deck",
      failed: "Could not change the deck",
      progress: {
        active: "Writing slide {n} of {m}",
        doneOne: "Wrote slide {n}",
        done: "Wrote slides {first} to {last}",
      },
    },
  },
};

function slide(
  progress: { n?: number; m?: number } | undefined,
  state: "done" | "running" = "done"
): MessagePart {
  calls += 1;

  const input =
    progress === undefined ? { title: "A" } : { progress, title: "A" };

  return state === "done"
    ? {
        type: "tool-deck-add",
        toolCallId: `call-${calls}`,
        state: "output-available",
        input,
        output: { added: true },
      }
    : {
        type: "tool-deck-add",
        toolCallId: `call-${calls}`,
        state: "input-available",
        input,
      };
}

const rows = (parts: readonly MessagePart[], streaming = false) =>
  stepTimeline(parts, LABELS, streaming).rows.map((row) => [
    rowText(row),
    row.count,
  ]);

describe("stepTimeline", () => {
  it("moves a repeated read to its latest place, with a count", () => {
    const running: MessagePart = {
      type: "tool-query-dataset",
      toolCallId: "call-running-read",
      state: "input-available",
      input: { dataset: "ledger.invoices", query: {} },
    };

    expect(
      stepTimeline(
        [read("ledger.invoices"), read("ledger.payments"), running],
        LABELS,
        true
      ).rows.map((row) => [rowText(row), row.count, row.state])
    ).toEqual([
      ["Read Payments", 1, "done"],
      ["Reading Invoices", 2, "active"],
    ]);
  });

  it("folds refused calls into the call that fixed them", () => {
    expect(rows([chart("refused"), chart("done")])).toEqual([
      ["Made a chart, fixed 1 problem", 1],
    ]);
    expect(rows([chart("refused"), chart("running")], true)).toEqual([
      ["Making a chart, fixing 1 problem", 1],
    ]);
  });

  it("fails only a final refusal", () => {
    const failed = stepTimeline(
      [read("ledger.invoices"), chart("refused"), answerText],
      LABELS,
      false
    ).failed;

    expect(failed === null ? null : rowText(failed)).toBe(
      "Could not make a chart"
    );
    expect(
      stepTimeline([chart("refused"), chart("done"), answerText], LABELS, false)
        .failed
    ).toBeNull();
  });

  it("follows a file's job: making while queued or running, made when ready, and a failed job is no refusal", () => {
    const call: MessagePart = {
      type: "tool-make-file",
      toolCallId: "call-file",
      state: "output-available",
      input: { title: "All invoices", format: "xlsx", dataset: "x", query: {} },
      output: { title: "All invoices", format: "xlsx", state: "making" },
    };

    const timeline = (state: "queued" | "running" | "ready" | "failed") =>
      stepTimeline([call, answerText], LABELS, false, { "call-file": state });

    expect(
      (["queued", "running", "ready", "failed"] as const).map((state) => {
        const {
          rows: [row],
          failed,
        } = timeline(state);

        return [row && rowText(row), row?.state, failed];
      })
    ).toEqual([
      ["Making an Excel file", "active", null],
      ["Making an Excel file", "active", null],
      ["Made an Excel file", "done", null],
      ["Could not make an Excel file", "failed", null],
    ]);

    const refused = stepTimeline(
      [
        {
          type: "tool-make-file",
          toolCallId: "call-refused",
          state: "output-error",
          input: { format: "csv" },
          errorText: "You may not do that.",
        },
        answerText,
      ],
      LABELS,
      false
    ).failed;

    expect(refused === null ? null : rowText(refused)).toBe(
      "Could not make a CSV file"
    );
  });

  it("thinks between steps while the run works and no step runs", () => {
    expect(stepTimeline([], LABELS, true).thinking).toBe(true);
    expect(stepTimeline([read("ledger.invoices")], LABELS, true).thinking).toBe(
      true
    );
    expect(
      stepTimeline([read("ledger.invoices"), chart("running")], LABELS, true)
        .thinking
    ).toBe(false);
    expect(
      stepTimeline([read("ledger.invoices")], LABELS, false).thinking
    ).toBe(false);
  });

  it("stops thinking once the answer starts", () => {
    expect(
      stepTimeline([read("ledger.invoices")], LABELS, true, {}, true).thinking
    ).toBe(false);
  });

  it("adds no row for an offer of choices, which shows as buttons", () => {
    const offer: MessagePart = {
      type: "tool-offer-choices",
      toolCallId: "call-offer",
      state: "output-available",
      input: { question: "Add it, or just show it here?", choices: ["Add"] },
      output: { shown: true },
    };

    expect(stepTimeline([offer], LABELS, false).rows).toEqual([]);
  });

  it("never folds away the running step, even when it is not the last row", () => {
    const file: MessagePart = {
      type: "tool-make-file",
      toolCallId: "call-file",
      state: "output-available",
      input: { title: "All invoices", format: "xlsx", dataset: "x", query: {} },
      output: { title: "All invoices", format: "xlsx", state: "making" },
    };

    // A file job still runs while the agent reads on, so its row is the second of five.
    const { rows: all } = stepTimeline(
      [
        read("ledger.customers"),
        file,
        read("ledger.payments"),
        read("ledger.orders"),
        read("ledger.refunds"),
      ],
      LABELS,
      true,
      { "call-file": "running" }
    );

    const { shown, hidden } = shownRows(all, false);

    expect(shown.map((row) => [rowText(row), row.state])).toEqual([
      ["Making an Excel file", "active"],
      ["Read ledger.orders", "done"],
      ["Read ledger.refunds", "done"],
    ]);
    expect(hidden).toBe(2);
    expect(shownRows(all, true).shown).toHaveLength(5);
  });

  it("folds calls in a row that carry progress into one row, named by the running call", () => {
    const { rows: all } = stepTimeline(
      [
        slide({ n: 1, m: 5 }),
        slide({ n: 2, m: 5 }),
        slide({ n: 3, m: 5 }, "running"),
      ],
      DECK_LABELS,
      true
    );

    expect(all.map((row) => [rowText(row), row.progress])).toEqual([
      ["Writing slide 3 of 5", { n: 3, m: 5 }],
    ]);
  });

  it("names a finished build by its first and last item, and one call by its item", () => {
    const build = [1, 2, 3, 4, 5].map((n) => slide({ n, m: 5 }));

    for (const [parts, words] of [
      [build, "Wrote slides 1 to 5"],
      [[slide({ n: 4, m: 5 })], "Wrote slide 4"],
    ] as const) {
      expect(
        stepTimeline(parts, DECK_LABELS, false).rows.map((row) => [
          rowText(row),
          row.progress,
        ])
      ).toEqual([[words, undefined]]);
    }
  });

  it("keeps an unfinished build live between calls, with the next item", () => {
    const timeline = stepTimeline(
      [slide({ n: 1, m: 5 }), slide({ n: 2, m: 5 })],
      DECK_LABELS,
      true
    );

    expect(
      timeline.rows.map((row) => [rowText(row), row.state, row.progress])
    ).toEqual([["Writing slide 3 of 5", "active", { n: 3, m: 5 }]]);
    expect(timeline.thinking).toBe(false);
  });

  it("keeps the build live while the next call's input still streams", () => {
    for (const input of [{ progress: { n: 3 } }, undefined]) {
      calls += 1;

      const streamingCall: MessagePart = {
        type: "tool-deck-add",
        toolCallId: `call-${calls}`,
        state: "input-streaming",
        input,
      };

      const timeline = stepTimeline(
        [slide({ n: 1, m: 5 }), slide({ n: 2, m: 5 }), streamingCall],
        DECK_LABELS,
        true
      );

      expect(
        timeline.rows.map((row) => [rowText(row), row.state, row.progress])
      ).toEqual([["Writing slide 3 of 5", "active", { n: 3, m: 5 }]]);
      expect(timeline.thinking).toBe(false);
    }
  });

  it("starts a new row when a second build restarts at its first item", () => {
    const parts = [1, 2, 3, 1].map((n) => slide({ n, m: 3 }));

    expect(
      stepTimeline(parts, DECK_LABELS, false).rows.map((row) => rowText(row))
    ).toEqual(["Wrote slides 1 to 3", "Wrote slide 1"]);
  });

  it("shows a finished plan as done, then Thinking", () => {
    const timeline = stepTimeline(
      [1, 2, 3, 4, 5].map((n) => slide({ n, m: 5 })),
      DECK_LABELS,
      true
    );

    expect(timeline.rows.map((row) => [rowText(row), row.state])).toEqual([
      ["Wrote slides 1 to 5", "done"],
    ]);
    expect(timeline.thinking).toBe(true);
  });

  it("falls back to the tool's own words", () => {
    for (const progress of [{ n: 7, m: 5 }, { n: 3 }, undefined]) {
      const { rows: all } = stepTimeline(
        [slide(progress, "running")],
        DECK_LABELS,
        true
      );

      expect(all.map((row) => [rowText(row), row.progress])).toEqual([
        ["Changing the deck", undefined],
      ]);
    }
  });

  it("shows the time from 0 s and the slow line from 20 s", () => {
    expect(elapsedLabel(0)).toBe("0s");
    expect(elapsedLabel(2999)).toBe("2s");
    expect(isSlow(19_999)).toBe(false);
    expect(isSlow(20_000)).toBe(true);
  });

  it("words a finished answer's time, singular for one", () => {
    expect(durationLabel(1000)).toBe("1 second");
    // A fast answer still worked for some time, never "0 seconds".
    expect(durationLabel(300)).toBe("1 second");
    expect(durationLabel(60_000)).toBe("1 minute");
    expect(durationLabel(125_000)).toBe("2 minutes 5 seconds");
  });
});
