import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineEvent } from "./index.ts";

describe("defineEvent", () => {
  it("keeps the name, the version and the payload schema together", () => {
    const contract = defineEvent({
      name: "placeholder.record-created",
      version: 1,
      payload: z.object({ recordId: z.string() }),
    });

    expect(contract.name).toBe("placeholder.record-created");
    expect(contract.version).toBe(1);
    expect(contract.payload.parse({ recordId: "r1" })).toEqual({
      recordId: "r1",
    });
  });

  it("refuses a version below one, so a payload change cannot reuse a version", () => {
    expect(() =>
      defineEvent({
        name: "placeholder.record-created",
        version: 0,
        payload: z.object({}),
      })
    ).toThrow("version");
  });
});
