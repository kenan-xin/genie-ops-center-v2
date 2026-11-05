import { describe, expect, it } from "vitest";

import {
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

const rows = (parts: readonly MessagePart[], streaming = false) =>
  stepTimeline(parts, LABELS, streaming).rows.map((row) => [
    rowText(row),
    row.count,
  ]);

describe("stepTimeline", () => {
  it("groups the reads of one dataset at its first read, with a count", () => {
    expect(
      rows([
        read("ledger.invoices"),
        read("ledger.payments"),
        read("ledger.invoices"),
      ])
    ).toEqual([
      ["Read Invoices", 2],
      ["Read Payments", 1],
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

  it("thinks only while an answer streams with no step and no text", () => {
    expect(stepTimeline([], LABELS, true).thinking).toBe(true);
    expect(stepTimeline([], LABELS, false).thinking).toBe(false);
    expect(stepTimeline([read("ledger.invoices")], LABELS, true).thinking).toBe(
      false
    );
    expect(stepTimeline([answerText], LABELS, true).thinking).toBe(false);
  });

  it("never folds away the running step, even when it is not the last row", () => {
    const running: MessagePart = {
      type: "tool-query-dataset",
      toolCallId: "call-running",
      state: "input-available",
      input: { dataset: "ledger.invoices", query: {} },
    };

    // A later read of Invoices makes its first row, the second of five, run again.
    const { rows: all } = stepTimeline(
      [
        read("ledger.customers"),
        read("ledger.invoices"),
        read("ledger.payments"),
        read("ledger.orders"),
        read("ledger.refunds"),
        running,
      ],
      LABELS,
      true
    );

    const { shown, hidden } = shownRows(all, false);

    expect(shown.map((row) => [rowText(row), row.state])).toEqual([
      ["Reading Invoices", "active"],
      ["Read ledger.orders", "done"],
      ["Read ledger.refunds", "done"],
    ]);
    expect(hidden).toBe(2);
    expect(shownRows(all, true).shown).toHaveLength(5);
  });

  it("shows the time from 3 s and the slow line from 20 s", () => {
    expect(elapsedLabel(2999)).toBeNull();
    expect(elapsedLabel(3000)).toBe("3s");
    expect(isSlow(19_999)).toBe(false);
    expect(isSlow(20_000)).toBe(true);
  });
});
