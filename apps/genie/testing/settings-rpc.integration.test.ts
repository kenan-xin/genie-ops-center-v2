import {
  insertCredentialPerson,
  insertSession,
  markSetupDone,
  signedSessionCookie,
  startDisposableDeployment,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_AUTH_ENV } from "./auth-env.ts";
import { imageHostPort } from "./image-ports.ts";
import { readRpcRefusal, rpcRequest } from "./rpc-request.ts";
import { startBuiltApp } from "./start-built-app.ts";

/**
 * The Tenant Settings refusals over the built application's `/api/rpc` (R-79, R-93): a refused
 * save carries `settings-invalid` with its issues through the one transport seam, and the
 * `core:settings:manage` gate answers before input parsing.
 */

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let server: Awaited<ReturnType<typeof startBuiltApp>>;

let managerCookie: string;

let outsiderCookie: string;

async function cookieFor(
  permissions: readonly string[],
  email: string
): Promise<string> {
  const userId = await insertCredentialPerson(deployment.context, {
    email,
    password: "settings-rpc-password-14",
    isBreakGlass: false,
    permissions,
  });

  return signedSessionCookie({
    token: await insertSession(deployment.context, { userId }),
    secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
    name: "__Host-genie-session",
  });
}

const headers = (cookie: string | undefined) =>
  cookie === undefined ? undefined : { cookie };

const saveSessions = (sessionIdleMinutes: number, cookie?: string) =>
  rpcRequest(server.baseUrl, "settings/saveSessions", {
    input: { sessionIdleMinutes },
    headers: headers(cookie),
  });

const read = (cookie: string) =>
  rpcRequest(server.baseUrl, "settings/read", { headers: headers(cookie) });

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await markSetupDone(deployment.context);

  managerCookie = await cookieFor(
    ["core:settings:manage"],
    "settings-rpc-admin@example.com"
  );
  outsiderCookie = await cookieFor(
    ["placeholder:admin"],
    "settings-rpc-outsider@example.com"
  );

  server = await startBuiltApp(
    deployment.context.env.databaseUrl,
    imageHostPort(3415)
  );
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

describe("the settings RPC refusals", () => {
  it("answers an invalid save with settings-invalid at 400 and the field issues", async () => {
    const idle = await saveSessions(4, managerCookie);

    const idleBody = await readRpcRefusal(idle);

    expect(idle.status).toBe(400);
    expect(idleBody.json.data.appCode).toBe("settings-invalid");
    expect(idleBody.json.data.issues).toEqual([
      {
        path: "sessionIdleMinutes",
        message: "Enter a whole number from 5 to 480.",
      },
    ]);

    const module = await rpcRequest(server.baseUrl, "settings/saveModule", {
      input: {
        moduleId: "placeholder",
        values: {
          title: "Placeholder",
          pageSize: 500,
          enabled: false,
          mode: "basic",
          tags: [],
        },
      },
      headers: headers(managerCookie),
    });

    const moduleBody = await readRpcRefusal(module);

    expect(module.status).toBe(400);
    expect(moduleBody.json.data.issues).toEqual([
      { path: "pageSize", message: "Page size must be at most 100." },
    ]);
  });

  it("refuses a caller with a module admin key alone at 403", async () => {
    const answer = await read(outsiderCookie);

    expect(answer.status).toBe(403);
    expect((await readRpcRefusal(answer)).json.data.appCode).toBe("forbidden");
  });

  it("refuses an anonymous caller at 401", async () => {
    const answer = await saveSessions(30);

    expect(answer.status).toBe(401);
    expect((await readRpcRefusal(answer)).json.data.appCode).toBe(
      "unauthenticated"
    );
  });
});
