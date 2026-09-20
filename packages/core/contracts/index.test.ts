import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineEventContract } from "./index.ts";

describe("defineEventContract", () => {
  it("keeps the name, the version and the payload schema together", () => {
    const contract = defineEventContract(
      "placeholder.record-created",
      1,
      z.object({ recordId: z.string() })
    );

    expect(contract.name).toBe("placeholder.record-created");
    expect(contract.version).toBe(1);
    expect(contract.payload.parse({ recordId: "r1" })).toEqual({
      recordId: "r1",
    });
  });

  it("refuses a version below one, so a payload change cannot reuse a version", () => {
    expect(() =>
      defineEventContract("placeholder.record-created", 0, z.object({}))
    ).toThrow("version");
  });
});
