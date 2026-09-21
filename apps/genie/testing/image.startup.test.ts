import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { MIGRATION_LOCK_KEY } from "@genie/core";
import {
  startDisposableDeployment,
  startDisposablePostgres,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);

// A deployment rather than a bare container, because two tests need a pooled
// client to hold the migrator's advisory lock. `pg` may not be imported outside
// core, so the pool is reached through the tenant context seam. Passing no
// modules applies the core history only, which today is empty, so the image
// still applies the module histories itself.
let database: Awaited<ReturnType<typeof startDisposableDeployment>>;

const databaseUrl = () => database.context.env.databaseUrl;

const pool = () => database.context.db.$client;

/** The lines one request handler wrote, which is what proves a request was served. */
const requestLinesIn = (logs: string) =>
  logs.split("\n").filter((line) => line.includes('"msg":"request"'));

beforeAll(async () => {
  database = await startDisposableDeployment([]);
}, 180000);

afterAll(async () => {
  await database?.stop();
});

const HOST_ALIAS = "host.docker.internal";

/**
 * Rewrites a host-side database URL into one the container can reach.
 *
 * The disposable database is published on this host, so inside a container
 * `localhost` is the container itself and the connection is refused. The alias
 * is mapped to the host gateway on the command line below, which works on a
 * plain Linux daemon and on Docker Desktop alike.
 */
function reachableFromContainer(url: string): string {
  const parsed = new URL(url);

  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    parsed.hostname = HOST_ALIAS;
  }

  return parsed.toString();
}

/**
 * Starts the image and returns its container id and a log reader.
 *
 * `--rm` is deliberately absent. A container started with `--rm` is removed the
 * instant it exits, so `docker logs` on a failed bootstrap returns nothing and
 * every log assertion passes vacuously. The container is removed explicitly in
 * `stop()` after the logs have been read.
 *
 * The port is published rather than shared with `--network=host`. Host
 * networking only shares this host's namespace on a plain Linux daemon. Under
 * Docker Desktop it joins the daemon's own virtual machine instead, so the
 * container starts and migrates correctly while every assertion that fetches it
 * fails to connect. That failure reads exactly like a broken application, which
 * cost this ticket a full debugging cycle.
 */
async function startImage(env: Record<string, string>, port: number) {
  const args = [
    "run",
    "-d",
    "-p",
    `${port}:3000`,
    "--add-host",
    `${HOST_ALIAS}:host-gateway`,
  ];

  for (const [key, value] of Object.entries(env)) {
    const reachable =
      key === "DATABASE_URL" ? reachableFromContainer(value) : value;

    args.push("-e", `${key}=${reachable}`);
  }

  args.push("genie-s005:test");

  const { stdout } = await run("docker", args);
  const id = stdout.trim();

  return {
    id,
    logs: async () => {
      const result = await run("docker", ["logs", id]).catch(() => ({
        stdout: "",
        stderr: "",
      }));

      return result.stdout + result.stderr;
    },
    stop: () => run("docker", ["rm", "-f", id]).catch(() => undefined),
  };
}

/**
 * Waits for the server's own socket to accept, then issues every request from
 * inside the container, and reports both.
 *
 * Both halves must run in the container's network namespace. A published port
 * is served by the daemon's forwarder, which accepts the TCP connection before
 * anything inside the container is listening and then resets it. Probed from
 * the host, a server that has not bound yet is therefore indistinguishable from
 * one that bound and queued the request, and that distinction is the whole of
 * the amended R-19b. Measured from the host this test reported four connection
 * resets, which could easily have been "fixed" by widening the assertion to
 * accept them, leaving the requirement unproven.
 */
async function probeFromInside(
  id: string,
  paths: string[],
  budgetMs: number
): Promise<{ accepted: boolean; outcomes: string[] }> {
  const script = `
    const net = require("node:net");
    const deadline = Date.now() + ${budgetMs};

    const tryAccept = () => new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port: 3000 });
      const settle = (value) => { socket.destroy(); resolve(value); };
      socket.setTimeout(500, () => settle(false));
      socket.on("connect", () => settle(true));
      socket.on("error", () => settle(false));
    });

    (async () => {
      let accepted = false;

      while (Date.now() < deadline) {
        if (await tryAccept()) { accepted = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const outcomes = await Promise.all(${JSON.stringify(paths)}.map((path) =>
        fetch("http://127.0.0.1:3000" + path, { signal: AbortSignal.timeout(4000) })
          .then((response) => String(response.status))
          .catch((error) => error.name)));

      console.log(JSON.stringify({ accepted, outcomes }));
    })();
  `;

  const { stdout } = await run("docker", ["exec", id, "node", "-e", script]);

  // SAFETY: the script above prints exactly this shape and nothing else, and a
  // malformed line throws here rather than passing an assertion silently.
  return JSON.parse(stdout.trim()) as { accepted: boolean; outcomes: string[] };
}

async function pollHealth(port: number, attempts = 60) {
  const seen: { elapsed: number; status: number | null }[] = [];
  const startedAt = Date.now();

  // Polling is sequential by definition: each attempt exists only because the
  // previous one did not answer 200, and the elapsed time it records is the
  // measurement. Running the attempts in parallel would fire every request at
  // once and destroy the timeline this test reads.
  /* eslint-disable no-await-in-loop */
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await fetch(`http://127.0.0.1:${port}/api/health`)
      .then((response) => response.status)
      .catch(() => null);

    seen.push({ elapsed: Date.now() - startedAt, status });

    if (status === 200) break;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  /* eslint-enable no-await-in-loop */

  return seen;
}

const countLines = (logs: string, needle: string) =>
  logs.split("\n").filter((line) => line.includes(needle)).length;

describe("the built image", () => {
  it("answers health only after migrations complete, and builds exactly one context", async () => {
    const image = await startImage(
      {
        DATABASE_URL: databaseUrl(),
        PUBLIC_URL: "https://example.invalid",
      },
      3399
    );

    try {
      const observations = await pollHealth(3399);

      expect(
        observations.some((observation) => observation.status === 200)
      ).toBe(true);

      const logs = await image.logs();

      expect(countLines(logs, "bootstrap complete")).toBe(1);

      // No request-bound path ran before the bootstrap finished.
      const bootstrapAt = logs.indexOf("bootstrap complete");
      const providerAt = logs.indexOf("frame origin provider invoked");

      expect(providerAt === -1 || providerAt > bootstrapAt).toBe(true);
    } finally {
      await image.stop();
    }
  }, 180000);

  it("blocks every request-bound path while migrations are still running", async () => {
    // Hold the migrator's own advisory lock from this process, so the container's
    // migrator blocks on the real lock rather than on an injected timer. This is
    // the ordering Amendment A requires: migrations precede request-bound
    // handlers, page rendering, tRPC and viewer-provider execution.
    const holder = await pool().connect();

    await holder.query("select pg_advisory_lock($1)", [
      MIGRATION_LOCK_KEY.toString(),
    ]);

    const image = await startImage(
      {
        DATABASE_URL: databaseUrl(),
        PUBLIC_URL: "https://example.invalid",
        LOCK_TIMEOUT_MS: "120000",
      },
      3404
    );

    try {
      // Wait for the socket to accept, rather than sleeping a fixed time. A
      // fixed sleep races a slow container, and a refused connection would then
      // be indistinguishable from a queued request.
      const { accepted, outcomes } = await probeFromInside(
        image.id,
        [
          "/api/health",
          "/",
          "/api/trpc/placeholder.read",
          "/viewer/placeholder",
        ],
        60000
      );

      // Amendment A permits early binding, so acceptance is expected here and is
      // the precondition that makes the next assertion meaningful.
      expect(accepted).toBe(true);

      // The connection was accepted, so a refusal here would be a different
      // failure. Every request must have timed out unanswered, not been refused.
      expect(
        outcomes.every((outcome) => outcome === "TimeoutError"),
        `outcomes: ${JSON.stringify(outcomes)}`
      ).toBe(true);

      const during = await image.logs();

      expect(during).not.toContain("bootstrap complete");
      // The viewer request reached no provider, because no request was handled.
      expect(during).not.toContain("frame origin provider invoked");

      // Release the lock and readiness must follow.
      await holder.query("select pg_advisory_unlock($1)", [
        MIGRATION_LOCK_KEY.toString(),
      ]);

      const after = await pollHealth(3404, 60);

      expect(after.some((observation) => observation.status === 200)).toBe(
        true
      );

      const logs = await image.logs();

      expect(logs).toContain("bootstrap complete");

      // Amendment A point 6: a client timeout does not cancel a queued request.
      // The four requests the client abandoned were accepted before the
      // bootstrap finished, so they must appear in the request log afterwards.
      // Without this the test would tolerate an implementation that silently
      // discarded them, and the documented behaviour would be unproven.
      const bootstrapAt = logs.indexOf("bootstrap complete");
      const afterBootstrap = logs.slice(bootstrapAt);

      // Only the paths that have a request-bound handler today can be checked.
      // `/api/trpc` and `/viewer/placeholder` are not routes yet, so a handler
      // log line for them is unprovable by construction rather than absent; the
      // loop covers them in Task 9, against the final image, once they exist.
      // They stay in the blocked-request list above, because a request to a
      // nonexistent route still has to be queued rather than answered early.
      for (const path of ["/api/health"]) {
        expect(
          afterBootstrap.includes(path),
          `no request log for ${path} after the bootstrap completed. after: ${afterBootstrap.slice(0, 3000)}`
        ).toBe(true);
      }
    } finally {
      await holder
        .query("select pg_advisory_unlock_all()")
        .catch(() => undefined);
      holder.release();
      await image.stop();
    }
  }, 240000);

  it("exits nonzero and never answers when the migration lock times out", async () => {
    const holder = await pool().connect();

    await holder.query("select pg_advisory_lock($1)", [
      MIGRATION_LOCK_KEY.toString(),
    ]);

    const image = await startImage(
      {
        DATABASE_URL: databaseUrl(),
        PUBLIC_URL: "https://example.invalid",
        LOCK_TIMEOUT_MS: "3000",
      },
      3401
    );

    try {
      const observations = await pollHealth(3401, 20);

      expect(
        observations.every((observation) => observation.status !== 200)
      ).toBe(true);

      // The container is still present, because startImage does not use --rm.
      const logs = await image.logs();

      expect(logs).toContain("bootstrap failed");
      expect(logs).not.toContain("bootstrap complete");

      const inspected = await run("docker", [
        "inspect",
        "-f",
        "{{.State.ExitCode}}",
        image.id,
      ]);

      // A migration failure leaves the container unhealthy, which is what keeps
      // the previous version serving (R-27).
      expect(Number(inspected.stdout.trim())).not.toBe(0);

      // The exit must also be prompt. Asserting only the code would accept a
      // container that sat for minutes before giving up, which is not the
      // bounded failure R-19b requires.
      const times = await run("docker", [
        "inspect",
        "-f",
        "{{.State.StartedAt}} {{.State.FinishedAt}}",
        image.id,
      ]);

      const [startedAt, finishedAt] = times.stdout.trim().split(" ");

      // Both halves must be present. Asserting the type instead would let a
      // changed inspect format yield NaN, and every NaN comparison below is
      // false, so the timing bound would silently stop being checked.
      expect(startedAt).toBeDefined();

      expect(finishedAt).toBeDefined();

      const elapsed =
        Date.parse(finishedAt ?? "") - Date.parse(startedAt ?? "");

      // The lock timeout is 3000 ms, plus the failure budget and process start.
      expect(elapsed).toBeLessThan(30000);
    } finally {
      await holder
        .query("select pg_advisory_unlock_all()")
        .catch(() => undefined);
      holder.release();
      await image.stop();
    }
  }, 180000);

  it("exits nonzero for malformed configuration without connecting", async () => {
    const result = await run("docker", [
      "run",
      "--rm",
      "--add-host",
      `${HOST_ALIAS}:host-gateway`,
      "-e",
      "DATABASE_URL=not-a-url",
      "-e",
      "PUBLIC_URL=https://example.invalid",
      "genie-s005:test",
    ]).then(
      () => ({ code: 0, output: "" }),
      (error: { code?: number; stdout?: string; stderr?: string }) => ({
        code: error.code ?? -1,
        output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      })
    );

    expect(result.code).not.toBe(0);
    expect(result.output).not.toContain("not-a-url");
  }, 120000);

  // Scope note. At Task 3 the tRPC route and the viewer route do not exist yet,
  // so this test covers the paths that do: the ordinary document and health. It
  // proves the mechanism early, which is why the image lands here. AC-26's full
  // clause, concurrent page, tRPC and viewer requests sharing one context across
  // real framework bundles, is proven in Task 9 against the final image, once
  // every route exists. Do not record this test as satisfying AC-26.
  it("shares one context across concurrent requests to the routes that exist", async () => {
    const image = await startImage(
      {
        DATABASE_URL: databaseUrl(),
        PUBLIC_URL: "https://example.invalid",
        LOG_LEVEL: "info",
      },
      3402
    );

    try {
      await pollHealth(3402);

      // The readiness poll's own successful request is logged like any other, so
      // the load is counted as a delta. Asserting an absolute total would make
      // the test depend on how many polls the container needed to become ready.
      const before = requestLinesIn(await image.logs()).length;

      const paths = ["/", "/api/health"];

      await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          fetch(`http://127.0.0.1:3402${paths[index % paths.length]}`).catch(
            () => undefined
          )
        )
      );

      const logs = await image.logs();

      // Count request lines, not every line carrying a context id. The bootstrap
      // line carries one too, so matching the whole log would report a single id
      // even when no request was served at all, and the assertion below would
      // pass on a process that built a second context for every request.
      const requestLines = requestLinesIn(logs);

      // Half the load went to the health route, which is the one request-bound
      // handler that exists at this task. Asserting the exact count is what
      // keeps the set assertion below honest: an empty set has size zero, but a
      // set built from one served request also has size one.
      expect(requestLines.length - before).toBe(12);

      const contextIds = new Set(
        requestLines.map((line) => /"contextId":"([^"]+)"/.exec(line)?.[1])
      );

      // One context for the whole process, however many bundles served the load.
      expect(contextIds.size).toBe(1);
      expect(countLines(logs, "bootstrap complete")).toBe(1);

      // The requests were served by the context the bootstrap published, not by
      // a second one built later that happened to be consistent with itself.
      const bootstrapId = /"contextId":"([^"]+)"[^\n]*bootstrap complete/.exec(
        logs
      )?.[1];

      expect([...contextIds][0]).toBe(bootstrapId);
    } finally {
      await image.stop();
    }
  }, 180000);

  it("uses a second runtime configuration rather than build-time values", async () => {
    const second = await startDisposablePostgres();

    try {
      const image = await startImage(
        { DATABASE_URL: second.url, PUBLIC_URL: "https://second.invalid" },
        3403
      );

      try {
        const observations = await pollHealth(3403);

        expect(
          observations.some((observation) => observation.status === 200)
        ).toBe(true);

        const logs = await image.logs();

        // The second database received the histories, which proves the image read
        // its configuration at run time and carried nothing from the build.
        expect(logs).toContain("bootstrap complete");
        expect(logs).not.toContain(databaseUrl());
      } finally {
        await image.stop();
      }
    } finally {
      await second.stop();
    }
  }, 240000);
});
