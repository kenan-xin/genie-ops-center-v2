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
 * The Modules page refusals over the built application's `/api/rpc` (bead `4xz`, Decision 9): the
 * enable procedure's own codes reach the body with their status through the one transport seam,
 * `module-config-invalid` with its issues, and the `core:settings:manage` gate runs before input
 * parsing (Review Focus 5).
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
    password: "modules-rpc-password-14",
    isBreakGlass: false,
    permissions,
  });

  return signedSessionCookie({
    token: await insertSession(deployment.context, { userId }),
    secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
    name: "__Host-genie-session",
  });
}

/** The body is loosely typed on purpose: one case sends wrong field types. */
const setEnabled = (
  input: Readonly<Record<string, string | number | boolean>>,
  cookie?: string
) =>
  rpcRequest(server.baseUrl, "modules/setEnabled", {
    input,
    headers: cookie === undefined ? undefined : { cookie },
  });

const sql = (text: string) => deployment.context.db.$client.query(text);

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await markSetupDone(deployment.context);

  managerCookie = await cookieFor(
    ["core:settings:manage"],
    "modules-rpc-admin@example.com"
  );
  outsiderCookie = await cookieFor(
    ["core:roles:manage"],
    "modules-rpc-outsider@example.com"
  );

  server = await startBuiltApp(
    deployment.context.env.databaseUrl,
    imageHostPort(3414)
  );
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

describe("the modules RPC refusals", () => {
  it("answers each module refusal with its code, its status and, for an invalid config, its issues", async () => {
    const notCompiled = await setEnabled(
      { moduleId: "absent", enabled: true },
      managerCookie
    );

    expect(notCompiled.status).toBe(404);
    expect((await readRpcRefusal(notCompiled)).json.data.appCode).toBe(
      "module-not-compiled"
    );

    await sql("delete from tenant_module where module_id = 'placeholder'");

    const notRegistered = await setEnabled(
      { moduleId: "placeholder", enabled: true },
      managerCookie
    );

    expect(notRegistered.status).toBe(409);
    expect((await readRpcRefusal(notRegistered)).json.data.appCode).toBe(
      "module-not-registered"
    );

    await sql(
      `insert into tenant_module (module_id, enabled, config) values ('placeholder', false, '{"pageSize": 0}')`
    );

    const invalid = await setEnabled(
      { moduleId: "placeholder", enabled: true },
      managerCookie
    );

    const body = await readRpcRefusal(invalid);

    expect(invalid.status).toBe(400);
    expect(body.json.data.appCode).toBe("module-config-invalid");
    expect(body.json.data.issues).toEqual([
      { path: "pageSize", message: expect.any(String) },
    ]);
  });

  it("refuses a caller without core:settings:manage at 403 even with a malformed body", async () => {
    const answer = await setEnabled(
      { moduleId: 42, enabled: "yes" },
      outsiderCookie
    );

    expect(answer.status).toBe(403);
    expect((await readRpcRefusal(answer)).json.data.appCode).toBe("forbidden");
  });

  it("refuses an anonymous caller at 401", async () => {
    const answer = await setEnabled({ moduleId: "placeholder", enabled: true });

    expect(answer.status).toBe(401);
    expect((await readRpcRefusal(answer)).json.data.appCode).toBe(
      "unauthenticated"
    );
  });
});
