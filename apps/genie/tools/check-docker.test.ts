import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

import { expect, it } from "vitest";

const CHECK = resolve(import.meta.dirname, "check-docker.ts");

// The dev target ran `docker compose` blind, and Nx reported success when it failed (xok3.92).
it("refuses the dev start with a clear line when the Docker daemon does not answer", () => {
  // A stub `docker` that fails at once: the real CLI took over 5 s on the CI runner (xok3.119).
  const bin = mkdtempSync(join(tmpdir(), "genie-no-docker-"));

  writeFileSync(join(bin, "docker"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });

  const run = spawnSync(process.execPath, [CHECK], {
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    encoding: "utf8",
  });

  expect(run.status).toBe(1);
  expect(run.stderr).toContain(
    "Docker is not running. Start Docker, then run the dev target again."
  );
});
