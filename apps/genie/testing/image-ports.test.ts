import { afterEach, describe, expect, it, vi } from "vitest";

import { imageHostPort } from "./image-ports.ts";

describe("imageHostPort", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps every configured image port below the ephemeral range for any worktree", () => {
    // Each id lands on a different offset in [0, 2000); the highest configured
    // ports in use are 3442 and the two-stack pair.
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      vi.stubEnv("GENIE_WORKTREE_ID", id);

      expect(imageHostPort(3442)).toBeLessThan(32768);
      expect(imageHostPort(3501 + 2 * 8)).toBeLessThan(32768);
    }
  });

  it("refuses a configured port that lands in the ephemeral range", () => {
    vi.stubEnv("GENIE_WORKTREE_ID", "a");

    expect(() => imageHostPort(3399 + 2768)).toThrow(
      /ephemeral range from 32768/
    );
  });
});
