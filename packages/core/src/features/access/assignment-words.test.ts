import { describe, expect, it } from "vitest";

import { assignedLabel, assignedOn, holderLine } from "./assignment-words.ts";

describe("assignment words", () => {
  it("names a holder's kind and count, and a group without a count by its kind alone", () => {
    expect(holderLine({ type: "user", id: "p", name: "Ada" }, {})).toBe(
      "Person · Direct"
    );
    expect(
      holderLine(
        { type: "group", id: "g", name: "Ops", source: "local" },
        { g: 1 }
      )
    ).toBe("Group · 1 member");
    expect(
      holderLine(
        { type: "group", id: "g", name: "IT", source: "idp" },
        { g: 12 }
      )
    ).toBe("Directory group · 12 members");
    expect(
      holderLine({ type: "group", id: "g", name: "IT", source: "idp" }, {})
    ).toBe("Directory group");
  });

  it("says who assigned a role and when, and only the date when nobody is named", () => {
    const addedAt = "2026-06-01T09:00:00.000000Z";

    expect(assignedLabel({ addedAt, addedBy: "Priya Nair" }, "UTC")).toBe(
      "Assigned 1 Jun 2026 by Priya Nair"
    );
    expect(assignedLabel({ addedAt, addedBy: null }, "UTC")).toBe(
      "Assigned 1 Jun 2026"
    );
    expect(assignedOn({ addedAt, addedBy: "Priya Nair" }, "UTC")).toBe(
      "1 Jun 2026 by Priya Nair"
    );
  });

  it("says at setup for a row that setup wrote, and the date alone for a break-glass row (T7-l)", () => {
    const addedAt = "2026-06-01T09:00:00.000000Z";

    expect(
      assignedOn({ addedAt, addedBy: "Priya Nair", addedAtSetup: false }, "UTC")
    ).toBe("1 Jun 2026 by Priya Nair");
    expect(
      assignedOn({ addedAt, addedBy: null, addedAtSetup: true }, "UTC")
    ).toBe("1 Jun 2026 at setup");
    expect(
      assignedOn({ addedAt, addedBy: null, addedAtSetup: false }, "UTC")
    ).toBe("1 Jun 2026");
  });
});
