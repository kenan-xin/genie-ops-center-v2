import { describe, expect, it } from "vitest";

import type { DatasetSummary } from "../datasets/index.ts";
import { columnLabel } from "./labels.ts";

const fields: DatasetSummary["fields"] = {
  customerName: {
    kind: "dimension",
    type: "text",
    description: "The customer.",
    label: "Customer",
  },
  daysOverdue: {
    kind: "measure",
    type: "number",
    description: "Days past due.",
    label: "Days overdue",
  },
  dueDate: {
    kind: "dimension",
    type: "date",
    description: "The due date.",
    label: "Due date",
  },
  outstandingCents: {
    kind: "measure",
    type: "money",
    description: "The amount still owed.",
    label: "Outstanding",
  },
  recordedOn: {
    kind: "dimension",
    type: "date",
    description: "The day.",
  },
};

describe("columnLabel", () => {
  it("reads a field's declared label, never its name", () => {
    expect(columnLabel({ name: "customerName", type: "text" }, fields)).toBe(
      "Customer"
    );
    expect(
      columnLabel({ name: "outstandingCents", type: "money" }, fields)
    ).toBe("Outstanding");
  });

  it("reads avg, min and max as a word and the field's label", () => {
    expect(
      columnLabel({ name: "maxDaysOverdue", type: "number" }, fields, [
        { fn: "max", field: "daysOverdue", as: "maxDaysOverdue" },
      ])
    ).toBe("Highest days overdue");
    expect(
      columnLabel({ name: "firstDue", type: "date" }, fields, [
        { fn: "min", field: "dueDate", as: "firstDue" },
      ])
    ).toBe("Earliest due date");
  });

  it("keeps a sum's alias, because the alias carries its meaning", () => {
    expect(
      columnLabel({ name: "overdueCents", type: "money" }, fields, [
        { fn: "sum", field: "outstandingCents", as: "overdueCents" },
      ])
    ).toBe("Overdue");
  });

  it("reads a field with no label as its name in words", () => {
    expect(columnLabel({ name: "recordedOn", type: "date" }, fields)).toBe(
      "Recorded on"
    );
  });
});
