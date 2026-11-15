import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { type AddressInfo, createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

/**
 * The preflight helpers of scripts/gate-preflight-lib.sh against planted processes and
 * listeners. Other sessions run gates on this machine, so every test asserts on its own
 * planted pid or port, never on an empty output.
 */

const WORKSPACE_ROOT = join(import.meta.dirname, "../../..");

const planted: ChildProcess[] = [];

const servers: Server[] = [];

const folders: string[] = [];

afterEach(() => {
  // Each planted process leads its own group, so a shell's sleep dies with it.
  // A failed kill must not stop the cleanup of servers and folders below.
  for (const child of planted.splice(0)) {
    if (child.pid === undefined) continue;

    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      // SAFETY: process.kill throws only Node system errors, which carry `code`.
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }

  for (const server of servers.splice(0)) server.close();

  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

/** Runs one function of the preflight library and returns its output lines. */
function runLib(name: string, env: NodeJS.ProcessEnv = {}): string[] {
  const output = execFileSync(
    "sh",
    ["-c", `. scripts/gate-preflight-lib.sh; ${name}`],
    { cwd: WORKSPACE_ROOT, encoding: "utf8", env: { ...process.env, ...env } }
  );

  return output.split("\n").filter(Boolean);
}

/** Starts a process; the spawn event fires after exec, so `ps` shows its arguments. */
async function plant(command: string, args: string[]): Promise<string> {
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  planted.push(child);
  await once(child, "spawn");

  return String(child.pid);
}

/** Listens on a free 127.0.0.1 port and returns it. */
async function listen(): Promise<Server> {
  const server = createServer();
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  return server;
}

function portOf(server: Server): string {
  // SAFETY: a TCP server listening on a host and port has an AddressInfo address.
  return String((server.address() as AddressInfo).port);
}

describe("other_gate_runs", () => {
  it("ignores a polling shell whose command line names a gate", async () => {
    // A second command keeps the shell alive; a lone `sleep` would replace it by exec.
    const pid = await plant("sh", ["-c", "sleep 60; : gate:merge test:e2e"]);

    expect(runLib("other_gate_runs")).not.toContain(pid);
  });

  it("ignores an agent CLI whose prompt names an e2e run", async () => {
    const pid = await plant("node", [
      "-e",
      "setTimeout(() => {}, 60000)",
      "run pnpm nx run @genie/app:test:e2e and report",
    ]);

    expect(runLib("other_gate_runs")).not.toContain(pid);
  });

  it("reports a node process running Nx with an e2e target", async () => {
    const folder = mkdtempSync(join(tmpdir(), "gate-preflight-"));
    folders.push(folder);
    const nx = join(folder, "nx.js");
    writeFileSync(nx, "setTimeout(() => {}, 60000);\n");

    const pid = await plant("node", [nx, "run-many", "-t", "test:e2e"]);

    expect(runLib("other_gate_runs")).toContain(pid);
  });

  it("reports the gate driver, whose arguments name no target", async () => {
    const folder = mkdtempSync(join(tmpdir(), "gate-preflight-"));
    folders.push(folder);
    const driver = join(folder, "scripts", "gate-merge.mjs");
    mkdirSync(join(folder, "scripts"));
    writeFileSync(driver, "setTimeout(() => {}, 60000);\n");

    const pid = await plant("node", [driver]);

    expect(runLib("other_gate_runs")).toContain(pid);
  });
});

describe("busy_ports", () => {
  it("names a busy GENIE_HOST_PORT", async () => {
    const port = portOf(await listen());

    expect(runLib("busy_ports", { GENIE_HOST_PORT: port })).toContain(port);
  });

  it("does not name a free GENIE_HOST_PORT", async () => {
    const server = await listen();
    const port = portOf(server);
    server.close();
    await once(server, "close");

    expect(runLib("busy_ports", { GENIE_HOST_PORT: port })).not.toContain(port);
  });
});
