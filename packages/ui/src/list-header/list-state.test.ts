import { describe, expect, it } from "vitest";

import type { ListDefinition } from "./definitions.ts";
import {
  dayRangeParam,
  readDayRange,
  readSort,
  setFilterCount,
} from "./list-state.ts";

const invoices: ListDefinition = {
  label: "Invoices",
  noun: ["invoice", "invoices"],
  filters: [
    { id: "q", kind: "search", label: "Search", placeholder: "Search" },
    {
      id: "customer",
      kind: "option",
      label: "Customer",
      placeholder: "All customers",
      options: [{ value: "c-1", label: "Harbor Freight" }],
    },
    {
      id: "date",
      kind: "date-range",
      label: "Invoice date",
      placeholder: "Any invoice date",
    },
  ],
  tabs: {
    param: "status",
    items: [
      { value: "all", label: "All" },
      { value: "open", label: "Open" },
      { value: "overdue", label: "Overdue", tone: "danger" },
    ],
  },
  sorts: [
    { column: "total", kind: "number" },
    { column: "updated", kind: "date" },
  ],
  defaultSort: { column: "updated", direction: "desc" },
};

// An old or hand-edited address reads as the default, never as a broken list (Review Focus 4).
describe("readDayRange", () => {
  it("keeps a range with one end", () => {
    expect(readDayRange("2026-10-01..")).toEqual({ from: "2026-10-01" });
    expect(readDayRange("..2026-10-31")).toEqual({ to: "2026-10-31" });
  });

  it("drops a day that is not a calendar day", () => {
    expect(readDayRange("2026-02-30..2026-03-01")).toEqual({});
  });

  it("writes a range with one end back as it reads it", () => {
    expect(dayRangeParam({ from: "2026-10-01" })).toBe("2026-10-01..");
  });
});

describe("readSort", () => {
  it("reads a column outside the list, or a wrong direction, as the default", () => {
    expect(readSort(invoices, "outstanding.desc")).toEqual({
      column: "updated",
      direction: "desc",
    });
    expect(readSort(invoices, "total.sideways")).toEqual({
      column: "updated",
      direction: "desc",
    });
  });

  it("reads a listed column and direction", () => {
    expect(readSort(invoices, "total.asc")).toEqual({
      column: "total",
      direction: "asc",
    });
  });
});

// Phase 08 C10: the Filters badge counted a range twice.
describe("setFilterCount", () => {
  it("counts a range once and the search not at all", () => {
    expect(
      setFilterCount(invoices, { q: "harbor", date: "2026-10-01..2026-10-31" })
    ).toBe(1);
  });

  it("counts a tab that is not the resting tab", () => {
    expect(
      setFilterCount(invoices, { status: "overdue", customer: "c-1" })
    ).toBe(2);
    expect(setFilterCount(invoices, { status: "all" })).toBe(0);
  });
});
