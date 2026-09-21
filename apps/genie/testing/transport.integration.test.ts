import { CORE_ERROR_MESSAGES, CORE_HISTORY } from "@genie/core";
import { startDisposableDeployment } from "@genie/core/testing";
import {
  type PlaceholderRouter,
  placeholderModule,
} from "@genie/module-placeholder";
import {
  type TRPCClientError,
  createTRPCClient,
  httpBatchLink,
  isTRPCClientError,
} from "@trpc/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { t } from "../src/trpc/init.ts";
import { startBuiltApp } from "./start-built-app.ts";

// Drizzle creates its ledger in the `drizzle` schema, not `public`.
const LEDGER_SCHEMA = "drizzle";

const LEDGER_TABLE = CORE_HISTORY.table;

// The module's own table, the one `placeholder.read` reads.
const MODULE_TABLE = "placeholder_record";

// How long a log line may take to reach this process. The server writes it
// before it answers, but it arrives over a pipe on the parent's event loop, so
// reading the buffer synchronously after a response can miss the last line.
const LOG_SETTLE_MS = 5000;

/**
 * The transport router, spelled at the type level from the application's own
 * `t`, which is where the error formatter lives.
 *
 * The registry types every module router as `AnyTRPCRouter` (`readonly router:
 * AnyTRPCRouter`, module-contract.ts), and `Object.fromEntries` then yields an
 * index signature, so `AppRouter` cannot carry a typed proxy. This recovers one
 * without touching the contract: the runtime still calls the application router
 * over the same batch link, and a typed path cannot be misspelled.
 */
type PlaceholderTransportRouter = ReturnType<
  typeof t.router<{ placeholder: PlaceholderRouter }>
>;

// Start the built application against the disposable database, then break the
// objects it reads so every read fails inside the database rather than in
// application code.
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let server: Awaited<ReturnType<typeof startBuiltApp>>;

const baseUrl = () => server.baseUrl;

// The pool is reached through the tenant context seam, because `pg` may not be
// imported outside core.
const pool = () => deployment.context.db.$client;

function placeholderClient() {
  return createTRPCClient<PlaceholderTransportRouter>({
    links: [
      httpBatchLink<PlaceholderTransportRouter>({
        url: `${baseUrl()}/api/trpc`,
      }),
    ],
  });
}

type PlaceholderClient = ReturnType<typeof placeholderClient>;

/**
 * The failure a standard client decoded, or `undefined` when the request
 * succeeded.
 *
 * The rejection is narrowed rather than annotated: a network-level rejection is
 * not a `TRPCClientError` and carries no `data`, so it stays `undefined` here
 * and the assertions below fail loudly instead of reading a field the runtime
 * never promised.
 */
async function readFailure(
  client: PlaceholderClient
): Promise<TRPCClientError<PlaceholderTransportRouter> | undefined> {
  try {
    await client.placeholder.read.query();

    return undefined;
  } catch (caught) {
    return isTRPCClientError<PlaceholderTransportRouter>(caught)
      ? caught
      : undefined;
  }
}

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  server = await startBuiltApp(deployment.context.env.databaseUrl, 3410);
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

describe("both transports", () => {
  it("the module transport answers a healthy read with its rows", async () => {
    const admin = await pool().connect();

    try {
      await admin.query(`insert into ${MODULE_TABLE} (label) values ($1)`, [
        "the first row",
      ]);
    } finally {
      admin.release();
    }

    const logBefore = server.logs().length;
    const rows = await placeholderClient().placeholder.read.query();

    // The positive control for this transport. Without it, the failure case
    // below would pass against a context that never reached the module's
    // procedure at all, which is exactly how a missing `tenant` hid.
    expect(rows.map((row) => row.label)).toContain("the first row");

    // A read that reached the database logs no error line.
    const served = server.logs().slice(logBefore);

    expect(served).not.toContain("request failed");
  });

  it("answers normally while the database is reachable", async () => {
    const response = await fetch(`${baseUrl()}/api/status`);

    expect(response.status).toBe(200);
  });

  it("the ordinary route returns code, message and requestId with no leaked text", async () => {
    // A statement-level failure on the connection the application already holds.
    //
    // This is the third design. Dropping `placeholder_record` never made a
    // constant `select 1` fail. Stopping the container, and later terminating
    // backends, both risked the unhandled pool `error` event of
    // genie-ops-center-v2-akh, which can exit the process instead of answering.
    // Refusing new connections was not deterministic either: pg-pool reuses an
    // idle client before opening a new one, so a burst can be served entirely on
    // the existing connection and never fail at all.
    //
    // Renaming the object the route reads fails the next query immediately, on
    // whichever connection serves it, with no connection churn.
    const admin = await pool().connect();

    try {
      const present = await admin.query(
        "select 1 from information_schema.tables where table_schema = $1 and table_name = $2",
        [LEDGER_SCHEMA, LEDGER_TABLE]
      );

      // Positive control. If the ledger is not there, the route was never
      // reading a real object and the whole test would be theatre. The schema
      // matters: an unqualified lookup finds the table while an unqualified
      // `alter` does not resolve it, so the injection would silently miss.
      expect(
        present.rowCount,
        `no ${LEDGER_SCHEMA}.${LEDGER_TABLE} table to break`
      ).toBe(1);

      await admin.query(
        `alter table ${LEDGER_SCHEMA}."${LEDGER_TABLE}" rename to "${LEDGER_TABLE}_hidden"`
      );
    } finally {
      admin.release();
    }

    const logBefore = server.logs().length;

    const response = await fetch(`${baseUrl()}/api/status`, {
      signal: AbortSignal.timeout(15000),
    });

    expect(response.status).toBe(500);

    const text = await response.text();

    // SAFETY: the body is the JSON this route's own helper wrote, and the
    // assertions below check every field this test reads.
    const body = JSON.parse(text) as {
      code: string;
      message: string;
      requestId: string;
    };

    expect(body.code).toBe("internal-error");
    expect(body.message).toBe(CORE_ERROR_MESSAGES["internal-error"]);
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    // No connection detail, no host, no port, no stack.
    expect(text).not.toMatch(
      /ECONNREFUSED|ETIMEDOUT|127\.0\.0\.1|postgres:\/\//
    );
    expect(text).not.toContain("relation");
    expect(text).not.toMatch(/at .*\.js:\d+/);

    // AC-15: the returned request id matches a redacted server log entry, and
    // the log holds the detail the response withheld.
    await expect
      .poll(() => server.logs().slice(logBefore), { timeout: LOG_SETTLE_MS })
      .toContain("request failed");

    expect(server.logs().slice(logBefore)).toContain(body.requestId);
  });

  it("a standard tRPC client decodes the failure with appCode and requestId", async () => {
    // The module table, so this transport fails on its own read rather than
    // depending on the ordinary route's injection still being in place.
    const admin = await pool().connect();

    try {
      const present = await admin.query(
        "select 1 from information_schema.tables where table_schema = $1 and table_name = $2",
        ["public", MODULE_TABLE]
      );

      // Positive control. `drop table if exists` is a silent no-op when the
      // table is absent, and the assertions below would then pass against a
      // procedure that failed for some other reason.
      expect(present.rowCount, `no public.${MODULE_TABLE} table to break`).toBe(
        1
      );

      await admin.query(`drop table ${MODULE_TABLE} cascade`);
    } finally {
      admin.release();
    }

    const logBefore = server.logs().length;
    const failure = await readFailure(placeholderClient());

    // The standard client decoded it without a custom transport, and the
    // protocol code says the server failed rather than that the path was
    // unknown or the caller was refused.
    expect(failure?.data?.code).toBe("INTERNAL_SERVER_ERROR");
    expect(failure?.data?.appCode).toBe("internal-error");
    expect(failure?.data?.requestId).toMatch(/^[0-9a-f-]{36}$/);

    // The whole decoded error, not just `data`. `message` is the field the
    // formatter overwrites with `safeMessageFor`, so leaving it out would let
    // raw database text reach the client with this test still green.
    const decoded = JSON.stringify(failure);

    expect(failure?.message).toBe(CORE_ERROR_MESSAGES["internal-error"]);
    expect(decoded).not.toMatch(
      /ECONNREFUSED|ETIMEDOUT|127\.0\.0\.1|postgres:\/\//
    );
    expect(decoded).not.toContain("relation");
    expect(decoded).not.toContain(MODULE_TABLE);
    expect(decoded).not.toMatch(/at .*\.js:\d+/);

    // AC-15 for the second transport: the id the client received is in the
    // error line this request wrote, not merely in its entry line.
    await expect
      .poll(() => server.logs().slice(logBefore), { timeout: LOG_SETTLE_MS })
      .toContain("request failed");

    expect(server.logs().slice(logBefore)).toContain(failure?.data?.requestId);
  });
});
