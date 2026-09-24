import { startDisposableDeployment } from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startBuiltApp } from "./start-built-app.ts";

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let server: Awaited<ReturnType<typeof startBuiltApp>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await deployment.context.db.$client.query(
    "insert into tenant_module (module_id, enabled) values ('placeholder', false) on conflict (module_id) do update set enabled = false"
  );
  server = await startBuiltApp(deployment.context.env.databaseUrl, 3411);
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

describe("compiled disabled module refusal", () => {
  it("a compiled disabled module hides navigation refuses tRPC and routes and keeps its tables", async () => {
    const home = await fetch(`${server.baseUrl}/`);
    const homeText = await home.text();

    expect(home.status).toBe(200);
    expect(homeText).not.toContain('href="/placeholder"');
    expect(homeText).not.toContain("Placeholder settings");

    const transport = await fetch(
      `${server.baseUrl}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`
    );

    const transportText = await transport.text();

    // SAFETY: the response is the JSON tRPC error envelope produced by the request above.
    const transportBody = JSON.parse(transportText) as {
      error?: { data?: { appCode?: string; requestId?: string } };
    };

    expect(transport.status).toBe(403);
    expect(transportBody.error?.data?.appCode).toBe("module-disabled");

    // R-46 and AC-15: the body and the response header must carry one id, even though the gate
    // refuses before any tRPC context exists.
    const transportRequestId = transport.headers.get("x-request-id");

    expect(transportRequestId).not.toBeNull();
    expect(transportBody.error?.data?.requestId).toBe(transportRequestId);

    const routeAnswers = await Promise.all(
      ["/placeholder", "/admin/placeholder", "/viewer/placeholder"].map(
        async (path) => {
          const response = await fetch(`${server.baseUrl}${path}`);
          const text = await response.text();

          return { path, response, text };
        }
      )
    );

    for (const { path, response, text } of routeAnswers) {
      expect(response.status, path).toBe(403);
      expect(text, path).toContain("module-disabled");
    }

    const tables = await deployment.context.db.$client.query<{
      table_name: string;
    }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('tenant_module', 'placeholder_record') order by table_name"
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "placeholder_record",
      "tenant_module",
    ]);
  });
});
