import { describe, expect, it } from "vitest";

import { holdersSentence } from "./role-holders.ts";

const group = (id: string) =>
  ({ principalType: "group", principalId: id }) as const;

const user = (id: string) =>
  ({ principalType: "user", principalId: id }) as const;

describe("holdersSentence", () => {
  it.each([
    [[], "Nobody holds this role yet."],
    [[group("g1")], "1 group holds this role."],
    [[user("u1"), user("u2")], "2 people hold this role."],
    // g1 holds the role at two scopes, so it counts once.
    [
      [group("g1"), group("g1"), group("g2"), user("u1")],
      "2 groups and 1 person hold this role.",
    ],
  ] as const)("counts distinct holders (%#)", (assignments, expected) => {
    expect(holdersSentence(assignments)).toBe(expected);
  });
});
