import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, it } from "vitest";

const CHECK = resolve(import.meta.dirname, "check-docker.ts");

// The dev target ran `docker compose` blind, and Nx reported success when it failed (xok3.92).
it("refuses the dev start with a clear line when the Docker daemon does not answer", () => {
  const run = spawnSync(process.execPath, [CHECK], {
    env: { ...process.env, DOCKER_HOST: "unix:///tmp/genie-no-docker.sock" },
    encoding: "utf8",
  });

  expect(run.status).toBe(1);
  expect(run.stderr).toContain(
    "Docker is not running. Start Docker, then run the dev target again."
  );
});
