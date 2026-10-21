import { describe, expect, it } from "vitest";

import { stateChangeOriginAllowed } from "./request-origin.ts";

const PUBLIC_URL = "https://ops.example.test";

describe("stateChangeOriginAllowed", () => {
  it("accepts the configured public origin and same-origin Fetch Metadata", () => {
    expect(
      stateChangeOriginAllowed(
        new Request(PUBLIC_URL, {
          method: "POST",
          headers: { origin: PUBLIC_URL },
        }),
        PUBLIC_URL
      )
    ).toBe(true);
    expect(
      stateChangeOriginAllowed(
        new Request(PUBLIC_URL, {
          method: "POST",
          headers: { "sec-fetch-site": "same-origin" },
        }),
        PUBLIC_URL
      )
    ).toBe(true);
  });

  it("refuses a foreign origin and missing Fetch Metadata", () => {
    expect(
      stateChangeOriginAllowed(
        new Request(PUBLIC_URL, {
          method: "POST",
          headers: { origin: "https://evil.example.test" },
        }),
        PUBLIC_URL
      )
    ).toBe(false);
    expect(
      stateChangeOriginAllowed(
        new Request(PUBLIC_URL, { method: "POST" }),
        PUBLIC_URL
      )
    ).toBe(false);
  });
});
