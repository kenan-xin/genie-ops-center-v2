import { CORE_ERROR_MESSAGES, CORE_HISTORY } from "@genie/core";
import {
  enableModules,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
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
import { imageHostPort } from "./image-ports.ts";
import { startBuiltApp } from "./start-built-app.ts";

// Drizzle creates its ledger in the `drizzle` schema, not `public`.
const LEDGER_SCHEMA = "drizzle";

const LEDGER_TABLE = CORE_HISTORY.table;

// The table the module gate reads before any procedure runs (R-8).
const ENTITLEMENT_TABLE = "tenant_module";

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
  // Test stand-in for `genie-ops setup`, which populates these rows in 1ia.4.
  await markSetupDone(deployment.context);

  // Stand-in for the `seed` step (R-20), which genie-ops setup brings in 1ia.2. Without the row,
  // R-8 reads the placeholder as disabled and refuses `placeholder.read`.
  await enableModules(deployment.context, ["placeholder"]);

  server = await startBuiltApp(
    deployment.context.env.databaseUrl,
    imageHostPort(3410)
  );
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

describe("both transports", () => {
  it("the module transport reaches the procedure and answers its refusal", async () => {
    const failure = await readFailure(placeholderClient());

    // The positive control for this transport. Sign-in arrives with S2-04, so
    // the request is anonymous and the real evaluator refuses it: FORBIDDEN is
    // the procedure's own `can()` answer, which proves the context reached the
    // module's procedure rather than an unknown path. The authorized read
    // through real role assignments is proved in the placeholder's own
    // integration suite; S2-04 brings the signed-in read back here.
    expect(failure?.data?.code).toBe("FORBIDDEN");
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
    // The entitlement table, so this transport fails inside the database in
    // the module gate every procedure passes first, rather than depending on
    // the ordinary route's injection still being in place. An anonymous caller
    // is refused before any module read, so the gate's read is the one this
    // request makes.
    const admin = await pool().connect();

    try {
      const present = await admin.query(
        "select 1 from information_schema.tables where table_schema = $1 and table_name = $2",
        ["public", ENTITLEMENT_TABLE]
      );

      // Positive control: a rename of an absent table would fail here rather
      // than let the assertions below pass for some other reason.
      expect(
        present.rowCount,
        `no public.${ENTITLEMENT_TABLE} table to break`
      ).toBe(1);

      await admin.query(
        `alter table ${ENTITLEMENT_TABLE} rename to ${ENTITLEMENT_TABLE}_hidden`
      );
    } finally {
      admin.release();
    }

    const logBefore = server.logs().length;

    // The entitlement reader serves a filled value for 10 seconds (DEC-46), so
    // the read fails once the value the refusal case filled has expired.
    await expect
      .poll(async () => (await readFailure(placeholderClient()))?.data?.code, {
        timeout: 15000,
        interval: 1000,
      })
      .toBe("INTERNAL_SERVER_ERROR");

    // A failed read fills no cache, so this request fails the same way.
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
    expect(decoded).not.toContain(ENTITLEMENT_TABLE);
    expect(decoded).not.toMatch(/at .*\.js:\d+/);

    // AC-15 for the second transport: the id the client received is in the
    // error line this request wrote, not merely in its entry line.
    await expect
      .poll(() => server.logs().slice(logBefore), { timeout: LOG_SETTLE_MS })
      .toContain("request failed");

    expect(server.logs().slice(logBefore)).toContain(failure?.data?.requestId);
  });
});
