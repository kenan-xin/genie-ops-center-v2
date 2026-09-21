import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { promisify } from "node:util";

import { MIGRATION_LOCK_KEY } from "@genie/core";
import {
  startDisposableDeployment,
  startDisposablePostgres,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);

/** The image every test in this file drives. */
const IMAGE = "genie-s005:test";

/** Named in the staleness failures below, so the fix is one copy-paste away. */
const REBUILD_IMAGE =
  "docker build -f deploy/Dockerfile --build-arg MODULE_INCLUDE=placeholder -t genie-s005:test .";

/** The image's creation time, or `undefined` when the image does not exist. */
async function imageCreatedAt(): Promise<string | undefined> {
  try {
    const inspected = await run("docker", [
      "image",
      "inspect",
      "-f",
      "{{.Created}}",
      IMAGE,
    ]);

    return inspected.stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * The image is not a build dependency of this suite, so a stale one surfaces as
 * a bootstrap failure about a migration file and reads like a broken product.
 * This makes staleness loud instead: it fails once, before any test runs, and
 * names the command that fixes it.
 *
 * The build stamp is `apps/genie/.next/BUILD_ID`, which `next build` rewrites on
 * every run. An image older than that stamp was built from an older build than
 * the one on disk.
 */
async function requireFreshImage(): Promise<void> {
  const created = await imageCreatedAt();

  if (created === undefined) {
    throw new Error(
      `The image ${IMAGE} is missing. Rebuild it before running the integration suite:\n  ${REBUILD_IMAGE}`
    );
  }

  const buildId = resolvePath(import.meta.dirname, "../.next/BUILD_ID");

  const builtAt = statSync(buildId, { throwIfNoEntry: false })?.mtimeMs;

  if (builtAt === undefined) {
    throw new Error(
      `No build output at ${buildId}, so image staleness cannot be judged. Build the app first:\n  MODULE_INCLUDE=placeholder pnpm exec nx run @genie/app:build`
    );
  }

  if (Date.parse(created) < builtAt) {
    throw new Error(
      `The image ${IMAGE} is older than the app build at ${buildId}, so it may serve stale code. Rebuild it:\n  ${REBUILD_IMAGE}`
    );
  }
}

// A deployment rather than a bare container, because two tests need a pooled
// client to hold the migrator's advisory lock. `pg` may not be imported outside
// core, so the pool is reached through the tenant context seam. Passing no
// modules applies the core history only, which today is empty, so the image
// still applies the module histories itself.
let database: Awaited<ReturnType<typeof startDisposableDeployment>>;

const databaseUrl = () => database.context.env.databaseUrl;

const pool = () => database.context.db.$client;

/** The request lines the proxy wrote, one per request (R-44). */
const requestLinesIn = (logs: string) =>
  logs.split("\n").filter((line) => line.includes('"msg":"request"'));

beforeAll(async () => {
  await requireFreshImage();
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

  args.push(IMAGE);

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

/**
 * Reads the container log until it satisfies `ready`, or the budget expires.
 *
 * A single read races the logger's own flush. The server answers the request
 * before pino has written the line, so a test that fetches and then reads once
 * sees a log that is correct but not yet complete, and fails intermittently on
 * an application that is behaving. Reproduced here with no modules compiled at
 * all, which rules out anything the module path does.
 *
 * The final read is returned either way, so a genuine absence still fails the
 * assertion that follows, with the whole log to look at.
 */
async function logsUntil(
  image: { logs: () => Promise<string> },
  ready: (logs: string) => boolean,
  budgetMs = 15000
): Promise<string> {
  const deadline = Date.now() + budgetMs;

  // Polling is sequential by definition: each read exists only because the
  // previous one was incomplete. Running the reads in parallel would ask the
  // same question of the same moment several times over.
  /* eslint-disable no-await-in-loop */
  let logs = await image.logs();

  while (!ready(logs) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));

    logs = await image.logs();
  }
  /* eslint-enable no-await-in-loop */

  return logs;
}

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

      const logs = await logsUntil(
        image,
        (seen) =>
          seen.includes("bootstrap complete") &&
          seen.slice(seen.indexOf("bootstrap complete")).includes("/api/health")
      );

      expect(logs).toContain("bootstrap complete");

      // Amendment A point 6: a client timeout does not cancel a queued request.
      // The four requests the client abandoned were accepted before the
      // bootstrap finished, so they must appear in the request log afterwards.
      // Without this the test would tolerate an implementation that silently
      // discarded them, and the documented behaviour would be unproven.
      const bootstrapAt = logs.indexOf("bootstrap complete");
      const afterBootstrap = logs.slice(bootstrapAt);

      // `/api/trpc` is a route as of Task 4, and `/viewer/placeholder` arrives
      // with the viewer in Task 9. The loop stays narrowed to the one path this
      // section proves end to end; Task 9 widens it against the final image.
      // Both stay in the blocked-request list above either way, because a
      // request to them still has to be queued rather than answered early.
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
      IMAGE,
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

      const statuses = await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          fetch(`http://127.0.0.1:3402${paths[index % paths.length]}`).then(
            (response) => response.status,
            (error: Error) => error.name
          )
        )
      );

      // Assert the responses, rather than swallowing them. Nothing else in this
      // repository asserts that the ordinary document renders at all, so a `/`
      // that threw would be invisible to every gate: the next-intl request
      // configuration could be deleted and the suite would stay green.
      expect(
        statuses.every((status) => status === 200),
        `not every response was 200: ${JSON.stringify(statuses)}`
      ).toBe(true);

      const logs = await logsUntil(
        image,
        (seen) => requestLinesIn(seen).length - before >= 24
      );

      // Count request lines, not every line carrying a context id. The bootstrap
      // line carries one too, so matching the whole log would report a single id
      // even when no request was served at all, and the assertion below would
      // pass on a process that built a second context for every request.
      const requestLines = requestLinesIn(logs);

      // The proxy is the one request logger (R-44), so each of the twenty-four
      // requests produces exactly one request line. The count is exact, not
      // "at least": a second logger added back anywhere would double it, which
      // is the defect this count exists to catch. It also keeps the set
      // assertion below honest: an empty set has size zero, but one served
      // request also has size one.
      expect(requestLines.length - before).toBe(24);

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
