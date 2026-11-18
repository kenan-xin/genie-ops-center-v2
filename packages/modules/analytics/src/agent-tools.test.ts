import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ANALYTICS_SURFACE } from "./agent-surface.ts";

describe("the analytics-change-dashboard input", () => {
  // The chat reads progress while the call streams, so a later key shows it only at the end (czjw.181).
  it("puts progress first in the change tool's schema", () => {
    const tool = ANALYTICS_SURFACE.tools.find(
      ({ name }) => name === "analytics-change-dashboard"
    );

    const schema = z.toJSONSchema(tool?.input ?? z.never(), {
      target: "draft-7",
    });

    expect(Object.keys(schema.properties ?? {})[0]).toBe("progress");
  });
});
