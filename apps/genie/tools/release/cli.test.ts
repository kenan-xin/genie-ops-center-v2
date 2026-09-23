import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const CLI = resolve(import.meta.dirname, "cli.ts");

const IDENTITY = `sha256:${"b".repeat(64)}`;

const temporary: string[] = [];

/**
 * A workspace with one customer and a pair of stub binaries on `PATH`.
 *
 * The stubs are the smallest honest substitute for a Docker daemon and the Nx
 * gates: the real wrapper, CLI and pipeline run, and the stub records exactly
 * what the pipeline asked for. This proves the ordering and the identity
 * handoff at the wrapper boundary, which the pipeline's own unit tests cannot
 * see.
 */
function stubWorkspace(pnpmExit: number, pnpmExtra = "") {
  const root = mkdtempSync(join(tmpdir(), "genie-release-cli-"));

  temporary.push(root);

  mkdirSync(join(root, "customers/acme/deploy"), { recursive: true });
  writeFileSync(
    join(root, "customers/acme/deploy/modules.txt"),
    "placeholder\n",
    "utf8"
  );

  // The smoke runs from `apps/genie` in the real repository; the fixture needs
  // that directory to exist for the stubbed smoke invocation to start at all.
  mkdirSync(join(root, "apps/genie"), { recursive: true });

  const bin = join(root, "bin");

  mkdirSync(bin);

  const log = join(root, "calls.log");

  writeFileSync(log, "", "utf8");

  const stub = (name: string, body: string) => {
    const path = join(bin, name);

    writeFileSync(path, `#!/bin/sh\n${body}\n`, "utf8");
    chmodSync(path, 0o755);
  };

  stub(
    "pnpm",
    `printf 'pnpm %s ENV=%s MODULE_INCLUDE=%s\\n' "$*" "$GENIE_SMOKE_IMAGE" "$MODULE_INCLUDE" >> "$STUB_LOG"\nprintf 'gate stdout marker\\n'\nprintf 'gate stderr marker\\n' >&2\n${pnpmExtra}\nexit ${pnpmExit}`
  );
  stub(
    "docker",
    `if [ "$1" = "image" ]; then printf '${IDENTITY}\\n'; exit 0; fi\nprintf 'docker %s\\n' "$*" >> "$STUB_LOG"\nexit 0`
  );

  return { root, bin, log };
}

function runCli(
  workspace: ReturnType<typeof stubWorkspace>,
  args: readonly string[]
) {
  try {
    execFileSync("node", [CLI, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${workspace.bin}:${process.env.PATH ?? ""}`,
        STUB_LOG: workspace.log,
      },
    });

    return { status: 0, stderr: "" };
  } catch (error) {
    // SAFETY: execFileSync rejects with an Error augmented with a numeric
    // status and captured stderr; a signal-terminated run reports null status.
    const failure = error as {
      status?: number | null;
      stderr?: string | Buffer;
    };

    return {
      status: failure.status ?? 1,
      stderr: String(failure.stderr ?? ""),
    };
  }
}

afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("the customer image release wrapper", () => {
  it("reads modules.txt, smokes the built digest and pushes that exact identity", () => {
    const workspace = stubWorkspace(0);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    const log = readFileSync(workspace.log, "utf8");

    expect(outcome.status, `${outcome.stderr}\nLOG:\n${log}`).toBe(0);

    expect(log).toContain("MODULE_INCLUDE=placeholder");
    expect(log).toContain("docker build");
    expect(log).toContain("MODULE_INCLUDE=placeholder");

    // The smoke ran with the identity, before the push of that same identity.
    const smokeAt = log.indexOf("vitest.release-smoke.config.ts");

    const tagAt = log.indexOf(
      `docker tag ${IDENTITY} ghcr.io/owner/genie-ops-center:acme-1.2.3`
    );

    const pushAt = log.indexOf(
      "docker push ghcr.io/owner/genie-ops-center:acme-1.2.3"
    );

    expect(smokeAt).toBeGreaterThan(-1);
    expect(tagAt).toBeGreaterThan(smokeAt);
    expect(pushAt).toBeGreaterThan(tagAt);
    expect(log).toContain(`ENV=${IDENTITY}`);
  });

  it("accepts an explicit --publish, which the release workflow passes", () => {
    const workspace = stubWorkspace(0);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
      "--publish",
    ]);

    const log = readFileSync(workspace.log, "utf8");

    expect(outcome.status, `${outcome.stderr}\nLOG:\n${log}`).toBe(0);
    expect(log).toContain("docker push");
  });

  it("publishes nothing when a gate fails", () => {
    const workspace = stubWorkspace(1);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    expect(outcome.status).toBe(1);

    const log = readFileSync(workspace.log, "utf8");

    expect(log).not.toContain("docker push");
    expect(log).not.toContain("docker build");
  });

  it("prints a failed gate's captured output before the status line", () => {
    const workspace = stubWorkspace(1);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    expect(outcome.status).toBe(1);

    const gateAt = outcome.stderr.indexOf("gate stderr marker");
    const statusAt = outcome.stderr.indexOf("release failed at typecheck");

    // Both halves of the failure reach the log, in the order a reader needs:
    // the gate's own output first, the status line that concludes it after.
    expect(gateAt).toBeGreaterThan(-1);
    expect(outcome.stderr).toContain("gate stdout marker");
    expect(statusAt).toBeGreaterThan(gateAt);
  });

  it("flushes the whole tail and the status line when the gate is chatty", () => {
    // One gate line far larger than a pipe buffer. A runner that exits before
    // its stderr drains loses the tail and the status line together, which is
    // exactly the blindness this Bead exists to remove.
    const workspace = stubWorkspace(
      1,
      "head -c 200000 /dev/zero | tr '\\0' 'x'; printf '\\n'"
    );

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain("xxxx");
    expect(outcome.stderr).toContain("release failed at typecheck");
  });

  it("publishes nothing for a missing customer", () => {
    const workspace = stubWorkspace(0);

    const outcome = runCli(workspace, [
      "does-not-exist",
      "1.2.3",
      "--repo-root",
      workspace.root,
    ]);

    expect(outcome.status).toBe(1);
    expect(readFileSync(workspace.log, "utf8")).not.toContain("docker push");
  });
});
