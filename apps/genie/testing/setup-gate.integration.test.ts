import {
  enableModules,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pollHealth, startImage, type RunningImage } from "./image-process.ts";

const PORT = 3441;

const STANDARD_HEADERS = {
  "content-security-policy":
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
} as const;

const ROUTES = ["/", "/placeholder", "/viewer/placeholder"] as const;

const AUTH_PATH = "/api/auth/session";

const INBOUND_PATH = "/api/m/placeholder/fixture/hooks";

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let image: RunningImage;

let deploymentStopped = false;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  // The test target includes placeholder routes so the setup gate, not the
  // disabled-module guard, owns each refusal until setup is complete.
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

  it("serves static assets before setup", async () => {
    const asset = await fetch(url("/probe.txt"));

    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain("public asset");
  });

  it("refuses tRPC calls before setup with standard security headers", async () => {
    const trpc = await fetch(
      url(`/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`)
    );

    expect(trpc.status).toBeGreaterThanOrEqual(400);
    expectStandardHeaders(trpc, "tRPC refusal");
  });

  it("renders the not-set-up page for a module document before setup", async () => {
    const moduleRoute = await fetch(url("/placeholder"), {
      redirect: "manual",
    });

    expect(moduleRoute.status).toBe(200);

    const moduleBody = await moduleRoute.text();

    expect(moduleBody).toContain("This deployment is not set up yet");

    expectStandardHeaders(moduleRoute, "not-set-up");
  });

  it("refuses authentication routes before setup", async () => {
    const authRoute = await fetch(url(AUTH_PATH), {
      redirect: "manual",
    });

    expect(authRoute.status).toBe(503);
    expectStandardHeaders(authRoute, "authentication refusal");
  });

  it("refuses inbound module endpoints before setup", async () => {
    const inbound = await fetch(url(INBOUND_PATH), {
      method: "POST",
      redirect: "manual",
    });

    expect(inbound.status).toBe(503);
    expectStandardHeaders(inbound, "inbound endpoint refusal");
  });

  it("renders the standalone not-set-up page on all three document routes", async () => {
    const responses = await Promise.all(
      ROUTES.map(async (path) => {
        const response = await fetch(url(path));
        const body = await response.text();

        return { path, response, body };
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

  it("omits the not-set-up page body from RSC and prefetch requests", async () => {
    const rsc = await fetch(url("/placeholder"), {
      headers: { RSC: "1" },
    });

    const prefetch = await fetch(url("/placeholder"), {
      headers: { "Next-Router-Prefetch": "1" },
    });

    expect(await rsc.text()).toBe("");
    expect(await prefetch.text()).toBe("");
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
        const body = await response.text();

        return { path, response, body };
      })
    );

    for (const { path, response, body } of responses) {
      expect(response.status, path).toBe(200);
      expect(body, path).not.toContain("This deployment is not set up yet");
    }
  });
});

describe("health database availability", () => {
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
