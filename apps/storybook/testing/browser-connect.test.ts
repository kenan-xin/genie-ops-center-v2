import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { resolveConfig } from "vitest/node";

/**
 * The time Vitest waits for Chromium to launch and connect before it fails the
 * whole component-test run. Vitest reads it from the root configuration only,
 * so a value in the story project or its shared preset is silently ignored.
 */
describe("the browser connect timeout", () => {
  it("gives a loaded runner twice Vitest's 60 s default, where Vitest reads it", async () => {
    const { vitestConfig } = await resolveConfig({
      config: join(import.meta.dirname, "../vitest.config.ts"),
    });

    // Develop run 35883152097 hit the default while an image build and a
    // Next build shared the 4-vCPU runner with the nested story run.
    expect(vitestConfig.browser.connectTimeout).toBe(120_000);
  });
});
