import { CORE_HISTORY } from "@genie/core";
import { startDisposableDeployment } from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AppRouter } from "../src/trpc/root.ts";
import { startBuiltApp } from "./start-built-app.ts";

// Drizzle creates its ledger in the `drizzle` schema, not `public`.
const LEDGER_SCHEMA = "drizzle";

const LEDGER_TABLE = CORE_HISTORY.table;

/**
 * The envelope R-46 adds to the standard one, as a client receives it.
 *
 * It is written out rather than read from the router, because the registry types
 * every module router as `AnyTRPCRouter` (`readonly router: AnyTRPCRouter`,
 * module-contract.ts), which erases the formatter's return type before the
 * composed client is built.
 */
type DecodedError = {
  readonly message: string;
  readonly data?: {
    readonly code?: string;
    readonly appCode?: string;
    readonly requestId?: string;
  };
};

// Start the built application against the disposable database, then break the
// objects it reads so every read fails inside the database rather than in
// application code.
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let server: Awaited<ReturnType<typeof startBuiltApp>>;

const baseUrl = () => server.baseUrl;

// The pool is reached through the tenant context seam, because `pg` may not be
// imported outside core.
const pool = () => deployment.context.db.$client;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  server = await startBuiltApp(deployment.context.env.databaseUrl, 3410);
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

describe("both transports on a database failure", () => {
  it("answers normally while the database is reachable", async () => {
    const response = await fetch(`${baseUrl()}/api/status`);

    // The positive control. Without it, the failure assertions below could pass
    // against a route that is broken for some unrelated reason.
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
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    // No connection detail, no host, no port, no stack.
    expect(text).not.toMatch(
      /ECONNREFUSED|ETIMEDOUT|127\.0\.0\.1|postgres:\/\//
    );
    expect(text).not.toContain("relation");
    expect(text).not.toMatch(/at .*\.js:\d+/);

    // AC-15: the returned request id matches a redacted server log entry, and
    // the log holds the detail the response withheld.
    const logs = server.logs();

    expect(logs).toContain(body.requestId);
    expect(logs).toContain("request failed");
  });

  it("a standard tRPC client decodes the failure with appCode and requestId", async () => {
    // The module table, so this transport fails on its own read rather than
    // depending on the ordinary route's injection still being in place.
    const admin = await pool().connect();

    try {
      await admin.query("drop table if exists placeholder_record cascade");
    } finally {
      admin.release();
    }

    // The standard client over the standard HTTP batch link, driven through its
    // public untyped entry point: the composed router's procedures cannot be
    // resolved statically, because every module's router reaches the registry as
    // `AnyTRPCRouter` and the record is an index signature. The wire call, the
    // batch link and the response parsing are the same ones the proxy client
    // uses, which is what AC-15 asks this test to prove.
    const client = createTRPCUntypedClient<AppRouter>({
      links: [httpBatchLink({ url: `${baseUrl()}/api/trpc` })],
    });

    const failure = await client.query("placeholder.read").then(
      () => undefined,
      (error: DecodedError) => error
    );

    // The standard client decoded it without a custom transport, the protocol
    // field survived, and the two additive fields are present.
    expect(failure?.data?.code).toBeDefined();
    expect(failure?.data?.appCode).toBe("internal-error");
    expect(failure?.data?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(failure?.data)).not.toMatch(
      /ECONNREFUSED|ETIMEDOUT|127\.0\.0\.1|postgres:\/\//
    );
    expect(JSON.stringify(failure?.data)).not.toContain("relation");

    // AC-15 for the second transport: the same correlation rule holds.
    expect(server.logs()).toContain(failure?.data?.requestId);
  });
});
