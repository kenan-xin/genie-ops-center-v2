import {
  enableModules,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { pollHealth, startImage, type RunningImage } from "./image-process.ts";

const PORT = 3441;

const SLOW_READ_PORT = 3442;

const STANDARD_HEADERS = {
  "content-security-policy":
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
} as const;

const ROUTES = ["/", "/placeholder", "/viewer/placeholder"] as const;

const ASSET_LOOKING_DOCUMENTS = [
  "/m/placeholder.json",
  "/not-a-real-route.js",
] as const;

const NON_ASSET_NEXT_PATHS = [
  "/_next/not-a-real-static-asset.js",
  "/_next/imagefoo",
  "/_next/image/x",
] as const;

const AUTH_PATH = "/api/auth/session";

const INBOUND_PATH = "/api/m/placeholder/fixture/hooks";

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let image: RunningImage;

let deploymentStopped = false;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  // The gate owns the refusal; R-8 needs the compiled module enabled for its positive control.
  await enableModules(deployment.context, ["placeholder"]);
  image = await startImage(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: "https://example.invalid",
    },
    PORT
  );

  const health = await pollHealth(PORT);

  expect(health.some(({ status }) => status === 200)).toBe(true);
}, 240000);

beforeEach(async () => {
  await deployment.context.db.$client.query(`
    insert into setup_step (step, state)
    values ('migrations', 'pending'), ('seed', 'pending')
    on conflict (step) do update
      set state = 'pending', detail = null, updated_at = now()
  `);
});

afterAll(async () => {
  await image?.stop();

  if (!deploymentStopped) await deployment?.stop().catch(() => undefined);
});

const url = (path: string) => `http://127.0.0.1:${PORT}${path}`;

function expectStandardHeaders(response: Response, label: string): void {
  for (const [name, value] of Object.entries(STANDARD_HEADERS)) {
    expect(response.headers.get(name), `${label} ${name}`).toBe(value);
  }
}

describe("the setup gate", () => {
  it("reports degraded health with the standard security headers before setup", async () => {
    const health = await fetch(url("/api/health"));

    expect(health.status).toBe(200);
    expect(await health.text()).toBe("degraded");
    expectStandardHeaders(health, "health");
  });

  it("serves public and Next static files before setup", async () => {
    const publicFile = await fetch(url("/probe.txt"));
    const document = await fetch(url("/"));
    const html = await document.text();

    const stylesheetPath = html.match(
      /href="(\/_next\/static\/[^"]+\.css)"/
    )?.[1];

    const scriptPath = html.match(
      /src="(\/_next\/static\/chunks\/[^"]+\.js)" async=/
    )?.[1];

    expect(stylesheetPath).toBeDefined();
    expect(scriptPath).toBeDefined();
    expect(publicFile.status).toBe(200);
    expect(await publicFile.text()).toContain("public asset");

    const stylesheet = await fetch(url(stylesheetPath ?? ""));
    const script = await fetch(url(scriptPath ?? ""));

    expect(stylesheet.status).toBe(200);
    expect(stylesheet.headers.get("content-type")).toContain("text/css");
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
  });

  it("refuses tRPC calls before setup with exactly 503 and standard security headers", async () => {
    const response = await fetch(
      url(`/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`)
    );

    expect(response.status).toBe(503);
    expectStandardHeaders(response, "tRPC refusal");
  });

  it("refuses static-looking tRPC and inbound API paths before setup", async () => {
    const batchedTrpc = await fetch(
      url("/api/trpc/placeholder.read,x.json?batch=1&input=%7B%7D")
    );

    const inbound = await fetch(url("/api/m/placeholder/fixture/hooks.json"), {
      method: "POST",
    });

    expect(batchedTrpc.status).toBe(503);
    expect(await batchedTrpc.text()).toBe("unavailable");
    expect(inbound.status).toBe(503);
    expect(await inbound.text()).toBe("unavailable");
  });

  it("renders the not-set-up page for a module document before setup", async () => {
    const response = await fetch(url("/placeholder"), { redirect: "manual" });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("This deployment is not set up yet");
    expectStandardHeaders(response, "not-set-up");
  });

  it("refuses authentication routes before setup", async () => {
    const response = await fetch(url(AUTH_PATH), { redirect: "manual" });

    expect(response.status).toBe(503);
    expectStandardHeaders(response, "authentication refusal");
  });

  it("refuses inbound module endpoints before setup", async () => {
    const response = await fetch(url(INBOUND_PATH), {
      method: "POST",
      redirect: "manual",
    });

    expect(response.status).toBe(503);
    expectStandardHeaders(response, "inbound endpoint refusal");
  });

  it("renders the standalone not-set-up page on all three document routes", async () => {
    const responses = await Promise.all(
      ROUTES.map(async (path) => {
        const response = await fetch(url(path));

        return { path, response, body: await response.text() };
      })
    );

    for (const { path, response, body } of responses) {
      expect(response.status, path).toBe(200);
      expect(body, path).toContain("This deployment is not set up yet");
      expect(body, path).toContain("migrations");
      expect(body, path).toContain("seed");
      expect(body, path).not.toContain('aria-label="Modules"');
      expect(body, path).not.toContain("Placeholder viewer");
    }
  });

  it("gates asset-looking dynamic paths without exposing the catalogue", async () => {
    const responses = await Promise.all(
      ASSET_LOOKING_DOCUMENTS.map(async (path) => {
        const response = await fetch(url(path));

        return { path, response, body: await response.text() };
      })
    );

    for (const { path, response, body } of responses) {
      expect(response.status, path).toBe(200);
      expect(body, path).toContain("This deployment is not set up yet");
      expect(body, path).not.toContain("Placeholder viewer");
      expect(body, path).not.toContain('aria-label="Modules"');
    }
  });

  it("rewrites an unhandled Next path without serializing the application catalogue", async () => {
    const responses = await Promise.all(
      NON_ASSET_NEXT_PATHS.map(async (path) => {
        const response = await fetch(url(path));

        return { path, response, body: await response.text() };
      })
    );

    for (const { path, response, body } of responses) {
      expect(response.status, path).toBe(200);
      expect(body, path).toContain("This deployment is not set up yet");
      expect(body, path).not.toContain("Placeholder viewer");
      expect(body, path).not.toContain('aria-label="Modules"');
    }
  });

  it("omits the not-set-up page body from RSC and prefetch requests", async () => {
    const rsc = await fetch(url("/placeholder"), { headers: { RSC: "1" } });

    const prefetch = await fetch(url("/placeholder"), {
      headers: { "Next-Router-Prefetch": "1" },
    });

    expect(await rsc.text()).toBe("");
    expect(await prefetch.text()).toBe("");
  });

  it("refuses an API request with an RSC header before setup", async () => {
    const response = await fetch(
      url(`/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`),
      { headers: { RSC: "1" } }
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("unavailable");
  });

  it("answers a generic 503 when reading the setup gate fails", async () => {
    await deployment.context.db.$client.query("drop table setup_step");

    try {
      const response = await fetch(url("/"));
      const body = await response.text();

      expect(response.status).toBe(503);
      expect(body).not.toContain("setup_step");
      expect(body).not.toContain("relation");
      expect(body).not.toContain("PostgreSQL");
      expect(body).not.toContain("This deployment is not set up yet");
      expectStandardHeaders(response, "gate read failure");
    } finally {
      await deployment.context.db.$client.query(
        "create table setup_step (step text primary key not null, state text not null, detail text, updated_at timestamptz not null default now())"
      );
    }
  });

  it("opens after both known steps are done and serves the same routes normally", async () => {
    await markSetupDone(deployment.context);
    await enableModules(deployment.context, ["placeholder"]);

    const health = await fetch(url("/api/health"));

    expect(health.status).toBe(200);
    expect(await health.text()).toBe("ok");

    const responses = await Promise.all(
      ROUTES.map(async (path) => {
        const response = await fetch(url(path));

        return { path, response, body: await response.text() };
      })
    );

    for (const { path, response, body } of responses) {
      expect(response.status, path).toBe(200);
      expect(body, path).not.toContain("This deployment is not set up yet");
    }
  });

  it("keeps the proxy gate open after the setup-step table is unavailable", async () => {
    await markSetupDone(deployment.context);

    const opened = await fetch(url("/"));

    expect(opened.status).toBe(200);
    expect(await opened.text()).not.toContain(
      "This deployment is not set up yet"
    );

    await deployment.context.db.$client.query(
      "alter table setup_step rename to setup_step_unavailable"
    );

    try {
      const response = await fetch(url("/"));
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).not.toContain("This deployment is not set up yet");
      expect(body).toContain("Genie Ops Center");
    } finally {
      await deployment.context.db.$client.query(
        "alter table setup_step_unavailable rename to setup_step"
      );
    }
  });

  it("ignores a client-supplied setup-required header after setup", async () => {
    await markSetupDone(deployment.context);

    const response = await fetch(url("/"), {
      headers: { "x-genie-setup-required": "1" },
    });

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('aria-label="Modules"');
    expect(body).not.toContain("This deployment is not set up yet");
    expect(body).not.toContain('"messages":{}');
  });

  it("does not expose the setup-required route after setup", async () => {
    await markSetupDone(deployment.context);

    const response = await fetch(url("/setup-required"), {
      redirect: "manual",
    });

    expect(response.status).toBe(404);
  });

  it("does not let a slow pending read close the gate after a later read opens it", async () => {
    const raceDeployment = await startDisposableDeployment([placeholderModule]);
    let raceImage: RunningImage | undefined;
    let backingTableRenamed = false;
    let viewCreated = false;
    let tableUnavailable = false;
    let staleRead: Promise<Response> | undefined;

    const raceUrl = (path: string) =>
      `http://127.0.0.1:${SLOW_READ_PORT}${path}`;

    try {
      await enableModules(raceDeployment.context, ["placeholder"]);
      await raceDeployment.context.db.$client.query(`
        insert into setup_step (step, state)
        values ('migrations', 'pending'), ('seed', 'pending')
        on conflict (step) do update
          set state = 'pending', detail = null, updated_at = now()
      `);
      raceImage = await startImage(
        {
          DATABASE_URL: raceDeployment.context.env.databaseUrl,
          PUBLIC_URL: "https://example.invalid",
        },
        SLOW_READ_PORT
      );

      const health = await pollHealth(SLOW_READ_PORT);

      expect(health.some(({ status }) => status === 200)).toBe(true);

      await raceDeployment.context.db.$client.query(
        "alter table setup_step rename to setup_step_backing"
      );
      backingTableRenamed = true;

      await raceDeployment.context.db.$client.query(`
        create function delay_pending_setup_step_state(state text)
        returns text
        language plpgsql
        volatile
        as $$
        begin
          if state = 'pending' then
            perform pg_sleep(1);
          end if;
          return state;
        end
        $$
      `);
      await raceDeployment.context.db.$client.query(`
        create view setup_step as
        select step, delay_pending_setup_step_state(state) as state, detail, updated_at
        from setup_step_backing
      `);
      viewCreated = true;

      staleRead = fetch(raceUrl("/"));
      await vi.waitFor(
        async () => {
          const activeReads = await raceDeployment.context.db.$client.query<{
            count: string;
          }>(`
          select count(*)::text as count
          from pg_stat_activity
          where datname = current_database()
            and pid <> pg_backend_pid()
            and state = 'active'
            and query ilike 'select step, state, detail from setup_step%'
        `);

          expect(Number(activeReads.rows[0]?.count)).toBeGreaterThan(0);
        },
        { interval: 20, timeout: 2000 }
      );

      await raceDeployment.context.db.$client.query(
        "update setup_step_backing set state = 'done', detail = null"
      );

      const freshResponse = await fetch(raceUrl("/"));
      const freshBody = await freshResponse.text();

      expect(freshResponse.status).toBe(200);
      expect(freshBody).not.toContain("This deployment is not set up yet");

      const staleResponse = await staleRead;
      await staleResponse.text();

      await raceDeployment.context.db.$client.query("drop view setup_step");
      viewCreated = false;
      await raceDeployment.context.db.$client.query(
        "alter table setup_step_backing rename to setup_step"
      );
      backingTableRenamed = false;
      await raceDeployment.context.db.$client.query(
        "alter table setup_step rename to setup_step_unavailable"
      );
      tableUnavailable = true;

      const afterStaleResponse = await fetch(raceUrl("/"));
      const afterStaleBody = await afterStaleResponse.text();

      expect(afterStaleResponse.status).toBe(200);
      expect(afterStaleBody).not.toContain("This deployment is not set up yet");
    } finally {
      await staleRead
        ?.then((response) => response.arrayBuffer())
        .catch(() => undefined);

      if (viewCreated) {
        await raceDeployment.context.db.$client.query("drop view setup_step");
      }

      if (backingTableRenamed) {
        await raceDeployment.context.db.$client.query(
          "alter table setup_step_backing rename to setup_step"
        );
      }

      if (tableUnavailable) {
        await raceDeployment.context.db.$client.query(
          "alter table setup_step_unavailable rename to setup_step"
        );
      }

      await raceDeployment.context.db.$client.query(
        "drop function if exists delay_pending_setup_step_state(text)"
      );
      await raceImage?.stop();
      await raceDeployment.stop();
    }
  });
});

describe("health database availability", () => {
  it("answers 503 within the timeout while a health query is blocked on the database", async () => {
    const blocker = await deployment.context.db.$client.connect();

    await blocker.query("begin");
    await blocker.query("lock table setup_step in access exclusive mode");

    try {
      const startedAt = performance.now();
      const response = await fetch(url("/api/health"));
      const elapsed = performance.now() - startedAt;

      expect(response.status).toBe(503);
      expect(await response.text()).toBe("unavailable");
      expect(elapsed).toBeGreaterThanOrEqual(1500);
      expect(elapsed).toBeLessThan(5000);
    } finally {
      await blocker.query("rollback");
      blocker.release();
    }
  });

  it("checks the database on each call and answers 503 after the database stops", async () => {
    await markSetupDone(deployment.context);

    const first = await fetch(url("/api/health"));

    expect(first.status).toBe(200);

    const opened = await fetch(url("/"));

    expect(opened.status).toBe(200);
    expect(await opened.text()).not.toContain(
      "This deployment is not set up yet"
    );

    await deployment.stop();
    deploymentStopped = true;

    const startedAt = performance.now();
    const unavailable = await fetch(url("/api/health"));
    const elapsed = performance.now() - startedAt;

    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toMatch(
      /postgres|database_url|connection refused/i
    );
    expect(elapsed).toBeLessThan(5000);
  });
});
