import { afterEach, describe, expect, it, vi } from "vitest";

import { scopedPort } from "./worktree-scope.ts";

describe("scopedPort", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([5060, 5061, 6000, 6666, 10080])(
    "steps past %i, a port Node's fetch refuses, so health polling can reach the stack",
    async (blocked) => {
      vi.stubEnv("GENIE_WORKTREE_ID", "a");

      const offset = scopedPort(0);
      const port = scopedPort(blocked - offset);

      // Nothing listens there, so fetch fails either way; only a refused port names "bad port".
      await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toHaveProperty(
        "cause.message",
        expect.not.stringMatching(/bad port/i)
      );
      expect(port - blocked).toBeLessThan(10);
    }
  );
});
