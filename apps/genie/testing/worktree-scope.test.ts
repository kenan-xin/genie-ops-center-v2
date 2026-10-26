import { createServer } from "node:http";

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

      const server = createServer((_request, response) => response.end("ok"));
      await new Promise<void>((resolve) =>
        server.listen(port, "127.0.0.1", resolve)
      );

      try {
        // fetch refuses a bad port before it connects, so a blocked port never reaches the server.
        const response = await fetch(`http://127.0.0.1:${port}/`);
        expect(response.status).toBe(200);
        await response.body?.cancel();
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }

      expect(port - blocked).toBeLessThan(10);
    }
  );
});
