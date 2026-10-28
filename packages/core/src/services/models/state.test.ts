import { expect, it } from "vitest";

import { aiStateOf } from "./state.ts";

it("AI is on only with a stored key and both defaults", () => {
  const rows = [
    [false, "a/b", "a/b", "no-key"],
    [false, null, null, "no-key"],
    [true, null, "a/b", "no-models"],
    [true, "a/b", null, "no-models"],
    [true, "a/b", "c/d", "on"],
  ] as const;

  expect(
    rows.map(([keyStored, chatModel, documentModel]) =>
      aiStateOf({ keyStored, chatModel, documentModel })
    )
  ).toEqual(rows.map((row) => row[3]));
});
