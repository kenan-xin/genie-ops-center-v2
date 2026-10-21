import { describe, expect, it } from "vitest";

import { newRequestId } from "./request-id.ts";

describe("newRequestId", () => {
  it("produces a distinct value each call", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });

  it("produces a value safe to put in a header and a log line", () => {
    expect(newRequestId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
