import { describe, expect, it } from "vitest";

import { targetLabel } from "./seed-demo.ts";

describe("the demo seed target label", () => {
  it("names the host, port and database and never the user or the password", () => {
    const label = targetLabel("postgres://genie:s3cret@127.0.0.1:5433/genie");

    expect(label).toBe("127.0.0.1:5433/genie");
    expect(label).not.toContain("s3cret");
    expect(label).not.toContain("genie:");
  });
});
