import { describe, expect, it } from "vitest";

import { summaryForPerson } from "./summary.ts";

describe("the summary fold", () => {
  it("shows each dataset name of a stored summary as its title", () => {
    expect(
      summaryForPerson(
        "The assistant used the datasets example.items, example.items_archive and example.orders. Then example.orders2 stayed.",
        {
          "example.items": "Items",
          "example.items_archive": "Archived items",
          "example.orders": "Orders",
        }
      )
    ).toBe(
      "The assistant used the datasets Items, Archived items and Orders. Then example.orders2 stayed."
    );
  });
});
