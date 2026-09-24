import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

import { MIGRATION_LOCK_KEY } from "@genie/core";
import {
  startDisposableDeployment,
  startDisposablePostgres,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CONTEXT_HEADER } from "../src/context.ts";
import {
  HOST_ALIAS,
  IMAGE,
  WORKSPACE_ROOT,
  countLines,
  logsUntil,
  normalizeSqlText,
  pollHealth,
  startImage,
  type RunningImage,
  asScannerSource,
  collectImagePublicCorpus,
  inventoryEntries,
  moduleMigrationSources,
  scanCorpusForMigrationSql,
  sqlUrlsInCorpus,
  F2_RECORDED_URL,
  SQL_SOURCES,
} from "./image-process.ts";

const run = promisify(execFile);

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

    return inspected.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Assembles the image from the current build context, and reports whether the
 * build succeeded.
 *
 * `--quiet` drops the progress output, which a rebuild of the whole workspace
 * would otherwise flood the hook with.
 */
async function buildImage(): Promise<boolean> {
  try {
    await run(
      "docker",
      [
        "build",
        "--quiet",
        "-f",
        "deploy/Dockerfile",
        "--build-arg",
        `MODULE_INCLUDE=${process.env.MODULE_INCLUDE ?? "placeholder"}`,
        "-t",
        IMAGE,
        ".",
      ],
      { cwd: WORKSPACE_ROOT, maxBuffer: 64 * 1024 * 1024 }
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * `test:integration` depends on `build-image`, which assembles the image from
 * this working tree, but a direct `vitest` run skips that. A stale image then
 * surfaces as a bootstrap failure about a migration file and reads like a broken
 * product. This makes staleness loud instead: it fails once, before any test
 * runs, and names the command that fixes it.
 *
 * Freshness is settled by asking Docker to produce the image from the current
 * build context, because nothing cheaper can settle it. Docker addresses its
 * layers by the content of what it copies, so an unchanged context is a cache hit
 * costing a fraction of a second, while a changed one rebuilds the image.
 *
 * The verdict is the image's creation time, which a cached build reuses and a
 * real one moves. The image id cannot stand in for it: BuildKit mints a fresh
 * config digest on every build, so two back-to-back cache hits produce different
 * ids for the same bytes. Timestamps of the local build cannot stand in either,
 * because `next build` rewrites its own stamp on every run while the image, which
 * `.dockerignore` keeps away from `.next` entirely, stays put.
 */
async function requireFreshImage(): Promise<void> {
  const before = await imageCreatedAt();

  const built = await buildImage();

  const after = await imageCreatedAt();

  if (!built || after === undefined) {
    throw new Error(
      `Could not build the image ${IMAGE} from ${WORKSPACE_ROOT}. Build it by hand and read the error:\n  ${REBUILD_IMAGE}`
    );
  }

  if (before === after) {
    return;
  }

  throw new Error(
    before === undefined
      ? `The image ${IMAGE} was missing and has now been built. Re-run the integration suite.`
      : `The image ${IMAGE} was built from older source than this working tree and has now been rebuilt. Re-run the integration suite.`
  );
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
}, 900000);

beforeAll(async () => {
  database = await startDisposableDeployment([]);
}, 180000);

afterAll(async () => {
  await database?.stop();
});

/**
 * The paths whose abandoned requests must be answered and appear in the request
 * log once the migration lock is released and the bootstrap completes.
 *
 * Task 3 narrowed this to `/api/health` because the other two routes did not
 * exist yet. Task 9 widens it against the final image, where all three do. Each
 * one is queued by the probe below, so each one has to be served rather than
 * discarded.
 */
const ABANDONED_PATHS = [
  "/api/health",
  "/api/trpc/placeholder.read",
  "/viewer/placeholder",
] as const;

/**
 * What the probe actually issues. The ordinary document is added so the page
 * class is exercised too; the log assertion above does not name it, because
 * `/` is a substring of every other path and would assert nothing.
 */
const PROBED_PATHS = ["/", ...ABANDONED_PATHS];

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

/**
 * The context id a response observed, and which bundle observed it.
 *
 * A route handler writes the id as a response header, from the bundle that ran
 * the handler. A page cannot set a response header in this framework, so its
 * server bundle renders the id into the document instead. Either way the value
 * comes from the bundle that served the request, never from the proxy, which is
 * what makes this a cross-bundle proof rather than a restatement of the proxy's
 * one log line.
 */
async function contextIdOf(
  response: Response
): Promise<{ header: string | null; document: string | null }> {
  const header = response.headers.get(CONTEXT_HEADER);

  if (header !== null) return { header, document: null };

  const body = await response.text();

  return {
    header: null,
    document: /data-context-id="([^"]+)"/.exec(body)?.[1] ?? null,
  };
}

/**
 * The three route classes AC-26 names, one per real framework bundle: the page,
 * the tRPC route handler and the viewer page. Twenty-four requests cycle through
 * them, so each class is served eight times.
 */
const ROUTE_CLASSES = [
  "/",
  "/api/trpc/placeholder.read?input=%7B%7D",
  "/viewer/placeholder",
] as const;

describe("the built image", () => {
  it("becomes healthy, logs one bootstrap line, and invokes no provider before it", async () => {
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

      // No provider ran before the bootstrap finished. The ordering of health
      // against migrations, and the one-context claim, are proved by the other
      // cases in this file, not here.
      const bootstrapAt = logs.indexOf("bootstrap complete");
      const providerAt = logs.indexOf("frame origin provider invoked");

      expect(providerAt === -1 || providerAt > bootstrapAt).toBe(true);
    } finally {
      await image.stop();
    }
  }, 180000);

  // R-44/R-46: one log line per request, carrying the request id, and that id is
  // the one the client is handed. The response header is read and matched against
  // the request line for the same request, so neither the header nor the line's
  // `requestId` binding can be dropped or changed without failing here. The path
  // is ordinary and succeeds, so no error line carries this id: the request line
  // is the only line that holds it.
  it("hands the client the same request id it logs for an ordinary request", async () => {
    const image = await startImage(
      {
        DATABASE_URL: databaseUrl(),
        PUBLIC_URL: "https://example.invalid",
      },
      3405
    );

    try {
      // Readiness uses `/api/health`, which never touches `/api/status`, so the
      // status request lines read below are only this test's own request.
      await pollHealth(3405);

      const response = await fetch("http://127.0.0.1:3405/api/status");

      expect(response.status).toBe(200);

      const handed = response.headers.get("x-request-id");

      expect(handed).toMatch(/^[0-9a-f-]{36}$/);

      const logs = await logsUntil(image, (seen) =>
        seen.split("\n").some((line) => line.includes('"path":"/api/status"'))
      );

      const statusLines = logs
        .split("\n")
        .filter((line) => line.includes('"path":"/api/status"'));

      // Exactly one: the proxy is the only request logger, and only this test
      // asked for `/api/status`.
      expect(statusLines).toHaveLength(1);

      const line = statusLines[0] ?? "";

      // The `"path":` filter above is what already excludes an error line: error
      // lines carry no path, so the only line this can be is the request line.
      // An assertion on `"msg":"request"` here would be tautological, so the
      // assertion that carries the claim is the id.
      expect(line).toContain(`"requestId":"${handed}"`);
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
        [...PROBED_PATHS],
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

      // Release the lock. No readiness probe runs inside this window: `pollHealth`
      // issues `/api/health` requests, which would write the very request line the
      // `/api/health` leg below reads, so the probe would satisfy its own
      // assertion and a server that discarded the queued request would still pass.
      // Readiness is instead read from the log, which the bootstrap writes itself
      // and which the queued requests add to as they are served.
      await holder.query("select pg_advisory_unlock($1)", [
        MIGRATION_LOCK_KEY.toString(),
      ]);

      const logs = await logsUntil(
        image,
        (seen) =>
          seen.includes("bootstrap complete") &&
          ABANDONED_PATHS.every((path) =>
            seen.slice(seen.indexOf("bootstrap complete")).includes(path)
          ),
        120000
      );

      expect(logs).toContain("bootstrap complete");

      // Amendment A point 6: a client timeout does not cancel a queued request.
      // The three non-overlapping paths below were queued and abandoned before the
      // bootstrap finished, so each must appear in the request log afterwards.
      // (The probe also issued `/`, which is a substring of the other three, so the
      // loop asserts only the three that can be told apart.) Without this the test
      // would tolerate an implementation that silently discarded them, and the
      // documented behaviour would be unproven.
      const bootstrapAt = logs.indexOf("bootstrap complete");
      const afterBootstrap = logs.slice(bootstrapAt);

      // Task 9 widened this from `/api/health` alone. `/api/trpc` and
      // `/viewer/placeholder` exist now, and all three were queued above, so all
      // three must be answered and logged once the bootstrap completes. A path
      // that could not be proven here would be named as such rather than
      // dropped silently.
      for (const path of ABANDONED_PATHS) {
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
      "PUBLIC_URL=also-not-a-url",
      IMAGE,
    ]).then(
      () => ({ code: 0, output: "" }),
      (error: { code?: number; stdout?: string; stderr?: string }) => ({
        code: error.code ?? -1,
        output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      })
    );

    expect(result.code).not.toBe(0);

    // No rejected value may reach the output in any spelling (R-45): the
    // diagnostic names variables, never values, and both values here carry the
    // `not-a-url` spelling.
    expect(result.output).not.toContain("not-a-url");

    // A silent exit passes the exit-code assertion above, so the diagnostic
    // line is the assertion that carries this requirement: exactly one line
    // names every invalid variable at once, so an operator reading the
    // container log can fix the environment without re-running with a debugger.
    const diagnosticLines = result.output
      .split("\n")
      .filter((line) => line.includes("DATABASE_URL"));

    expect(diagnosticLines).toHaveLength(1);
    expect(diagnosticLines[0]).toContain("The environment is not valid");
    expect(diagnosticLines[0]).toContain("PUBLIC_URL");
  }, 120000);

  // AC-26's concurrency clause, proven across real framework bundles rather
  // than through the proxy's log alone. The proxy is one bundle, so its log
  // lines can only ever show what the proxy saw; the route handler and each page
  // report the context their own bundle read, which is what a second context
  // would split. Twenty-four concurrent page, tRPC and viewer requests, and one
  // id across every observation.
  it("shares one context across concurrent page, tRPC and viewer requests", async () => {
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

      const responses = await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          fetch(
            `http://127.0.0.1:3402${ROUTE_CLASSES[index % ROUTE_CLASSES.length]}`
          ).then(
            async (response) => ({
              status: response.status,
              observed: await contextIdOf(response),
            }),
            (error: Error) => ({
              // SAFETY: a rejected `fetch` narrows to `Error`, and the test
              // below only compares this against the number 200, so widening
              // the discriminant to the union the success branch also uses is
              // what makes one array hold both outcomes.
              status: error.name as string | number,
              observed: { header: null, document: null },
            })
          )
        )
      );

      // Assert the responses, rather than swallowing them. Nothing else in this
      // repository asserts that the ordinary document renders at all, so a `/`
      // that threw would be invisible to every gate: the next-intl request
      // configuration could be deleted and the suite would stay green.
      expect(
        responses.every((response) => response.status === 200),
        `not every response was 200: ${JSON.stringify(
          responses.map((response) => response.status)
        )}`
      ).toBe(true);

      const headerIds = responses
        .map((response) => response.observed.header)
        .filter((id): id is string => id !== null);

      const documentIds = responses
        .map((response) => response.observed.document)
        .filter((id): id is string => id !== null);

      // Each class is observed through the bundle that served it. The eight tRPC
      // responses carry the header the route-handler bundle wrote; the sixteen
      // page responses carry the attribute their page bundle rendered. A zero in
      // either half would shrink the set below and let it pass for the wrong
      // reason, so both counts are asserted, not just the set size.
      expect(
        headerIds.length,
        "no tRPC response carried the context header"
      ).toBe(8);
      expect(documentIds.length, "no page rendered the context attribute").toBe(
        16
      );

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
      // is the defect this count exists to catch.
      expect(requestLines.length - before).toBe(24);

      // All three route classes were served, so the batch really exercised the
      // page, the tRPC handler and the viewer rather than one class three times.
      for (const needle of ['"path":"/"', "api/trpc", "viewer/placeholder"]) {
        expect(
          requestLines.some((line) => line.includes(needle)),
          `no request line for ${needle}`
        ).toBe(true);
      }

      const logIds = requestLines
        .map((line) => /"contextId":"([^"]+)"/.exec(line)?.[1])
        .filter((id): id is string => id !== undefined);

      // One context for the whole process, however many bundles served the load.
      // The set mixes observations from the proxy's log, the tRPC handler's
      // header and both pages' rendered attribute, so it cannot be satisfied by
      // the proxy alone.
      const observed = new Set([...headerIds, ...documentIds, ...logIds]);

      expect(observed.size).toBe(1);
      expect(countLines(logs, "bootstrap complete")).toBe(1);

      // Every observation came from the context the bootstrap published, not
      // from a second one built later that happened to be consistent with
      // itself.
      const bootstrapId = /"contextId":"([^"]+)"[^\n]*bootstrap complete/.exec(
        logs
      )?.[1];

      expect([...observed][0]).toBe(bootstrapId);
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
        // This test's own container, stopped exactly once here — stopping the
        // database instead leaked the image container on its port.
        await image.stop();
      }
    } finally {
      await second.stop();
    }
  }, 240000);
});

describe("the built image", () => {
  const F2_PORT = 3413;

  const f2BaseUrl = `http://127.0.0.1:${F2_PORT}`;

  let f2Image: RunningImage;

  let corpus: Map<string, string>;

  beforeAll(async () => {
    f2Image = await startImage(
      {
        DATABASE_URL: databaseUrl(),
        PUBLIC_URL: "https://example.invalid",
      },
      F2_PORT
    );

    const observations = await pollHealth(F2_PORT);

    expect(observations.some((observation) => observation.status === 200)).toBe(
      true
    );

    corpus = await collectImagePublicCorpus(f2Image.id, f2BaseUrl);

    // Completeness is asserted, not assumed: the inventory must contain the
    // home document and at least the build's own asset tree. A corpus of one
    // would mean the inventory found nothing and every zero below would be
    // vacuous.
    expect(corpus.size).toBeGreaterThanOrEqual(2);
  }, 240000);

  afterAll(async () => {
    await f2Image?.stop();
  });

  it("serves no migration SQL url", async () => {
    // The probes are the inventory's own SQL-spelled URLs plus the URL the F2
    // evidence recorded and the plain journal-tag spellings a naive repair
    // might re-serve. Every probe must answer exactly 404: a 500, an auth
    // wall, or a redirect would be masking, not removal, and the body must
    // carry neither SQL nor an error dump.
    const probes = new Set<string>([
      F2_RECORDED_URL,
      ...SQL_SOURCES.map(({ tag }) => `/_next/static/media/${tag}.sql`),
      ...sqlUrlsInCorpus(corpus),
    ]);

    expect(probes.size).toBeGreaterThanOrEqual(1);

    const masked: string[] = [];

    // Sequential probes: each answer is asserted against the same contract.
    /* eslint-disable no-await-in-loop */
    for (const probe of probes) {
      const response = await fetch(`${f2BaseUrl}${probe}`, {
        redirect: "manual",
      }).catch(() => undefined);

      const body = response === undefined ? "" : await response.text();

      if (response?.status !== 404)
        masked.push(`${probe} -> ${response?.status ?? "no response"}`);

      if (
        SQL_SOURCES.some(({ normalized }) =>
          normalizeSqlText(body).includes(normalized)
        )
      ) {
        masked.push(`${probe} -> body carries migration SQL`);
      }
    }
    /* eslint-enable no-await-in-loop */

    expect(masked).toEqual([]);
  }, 240000);

  it("exposes no migration SQL content in its public corpus", () => {
    expect(scanCorpusForMigrationSql(corpus)).toEqual([]);
  }, 240000);

  it("detects the repository migration SQL in a public corpus, raw, JSON-escaped and base64 encoded, and only that SQL", () => {
    // Control, not contract: the injected files go through the SAME
    // inventory-corpus scanner the real assertion uses. Positives carry the
    // repository's own migration SQL — verbatim, as a JSON-escaped string
    // literal, and as base64 — and every encoding must be flagged. Negatives
    // carry unrelated SQL in the same encodings and must NOT be flagged: the
    // scanner matches this repository's migrations, not SQL in general.
    const [first] = SQL_SOURCES;

    expect(first).toBeDefined();

    // The RAW repository SQL, not the normalized form: normalization strips
    // the newlines and tabs the escaped encoding must be proven against.
    const realSql = first === undefined ? "" : first.raw;
    const unrelated = "insert into f2_control values (1);\nselect 1;";

    const controlled = new Map(corpus);

    controlled.set(`/_next/static/media/${first?.tag ?? "f2"}.sql`, realSql);
    controlled.set(
      "/_next/static/chunks/f2-positive-escaped.js",
      `const m=${JSON.stringify(realSql)};`
    );
    controlled.set(
      "/_next/static/chunks/f2-positive-base64.js",
      `const m=${JSON.stringify(Buffer.from(realSql).toString("base64"))};`
    );
    controlled.set(
      "/_next/static/chunks/f2-negative-escaped.js",
      `const m=${JSON.stringify(unrelated)};`
    );
    controlled.set("/f2-negative.sql", unrelated);

    const offenders = scanCorpusForMigrationSql(controlled);

    expect(offenders.toSorted()).toEqual(
      [
        `/_next/static/media/${first?.tag ?? "f2"}.sql`,
        "/_next/static/chunks/f2-positive-escaped.js",
        "/_next/static/chunks/f2-positive-base64.js",
      ].toSorted()
    );
  }, 240000);

  it("fails closed when a migration SQL file is empty", () => {
    // Empty: malformed, and a contract with no needle is vacuous.
    expect(() => asScannerSource("f2", "0000_tiny", "")).toThrow(/empty/);

    // Short but real: legal, and covered by the same containment scan.
    expect(asScannerSource("f2", "0000_tiny", "select 1").normalized).toBe(
      "select 1"
    );
  }, 240000);

  it("rejects symlinked public corpus entries with a named diagnostic", () => {
    // An inventory that skipped links would be incomplete, and one that
    // followed them could leave the static roots; the proof fails closed
    // naming the link and its target instead.
    expect(() =>
      inventoryEntries(
        '{"symlink":"/app/apps/genie/public/linked.sql","target":"/outside/x.sql"}'
      )
    ).toThrow(/symlink/);

    expect(() =>
      inventoryEntries(
        '{"symlink":"/app/apps/genie/public/linked.sql","target":"/outside/x.sql"}\n{"url":"/_next/static/chunks/a.js","b64":"aGk="}'
      )
    ).toThrow(/symlink/);

    const entries = inventoryEntries(
      '{"url":"/_next/static/chunks/a.js","b64":"aGk="}'
    );

    expect(entries).toEqual([
      { url: "/_next/static/chunks/a.js", b64: "aGk=" },
    ]);
  }, 240000);

  it("migrates the real database from the repository SQL", async () => {
    // The repair must not break what F2 was about to break: the same image
    // still applies the module history to a real database, and the ledger
    // rows it writes hash the repository's own SQL bytes — the ledger is in
    // the migrator's `drizzle` schema, one table per module history.
    const sources = moduleMigrationSources();

    expect(sources.length).toBeGreaterThanOrEqual(1);

    for (const { module, sql } of sources) {
      const expected = createHash("sha256").update(sql).digest("hex");

      // One query per module history, in journal order; the assertions read
      // better sequential and the count is the module count.
      /* eslint-disable no-await-in-loop */
      const applied = await pool().query<{ hash: string }>(
        `select hash from drizzle.__drizzle_migrations_${module}`
      );
      /* eslint-enable no-await-in-loop */

      expect(applied.rowCount).toBeGreaterThanOrEqual(1);
      expect(applied.rows.map((row) => row.hash)).toContain(expected);
    }

    // The history did more than write a ledger: the module's own table exists.
    const table = await pool().query<{ present: boolean }>(
      "select exists (select 1 from information_schema.tables where table_name = 'placeholder_record') as present"
    );

    expect(table.rows[0]?.present).toBe(true);
  }, 240000);
});
