import type { GroupsContract, RolesContract } from "@genie/core";
import {
  enableModules,
  insertCredentialPerson,
  insertRole,
  insertSession,
  insertUser,
  markSetupDone,
  signedSessionCookie,
  startDisposableDeployment,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServerRpcClient } from "../src/rpc/server-client.ts";
import { TEST_AUTH_ENV } from "./auth-env.ts";
import { imageHostPort } from "./image-ports.ts";
import { rpcRefusalBody, rpcRequest } from "./rpc-request.ts";
import { startBuiltApp } from "./start-built-app.ts";

/**
 * The Groups and Roles transport proof (Spec 2 R-14, R-37), run against the built application:
 * the session gate answers an anonymous caller `unauthenticated` at 401 before any input parsing,
 * a signed-in caller without the key is refused `forbidden` at 403, and a role event emitted inside
 * an RPC request carries that request's correlation id into its handler (the l65 follow-up).
 */

const READ_PASSWORD = "groups-roles-password-14";

const WITHOUT_PERMISSION_EMAIL = "groups-roles-member@example.com";

const WITH_PERMISSION_EMAIL = "groups-roles-admin@example.com";

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let server: Awaited<ReturnType<typeof startBuiltApp>>;

let withoutPermissionId: string;

let withPermissionId: string;

const baseUrl = () => server.baseUrl;

/**
 * A real session for one of the pre-added people, written directly and signed the way Better Auth
 * does. R-62 leaves the credential endpoint to the break-glass account, so an ordinary person's
 * session is minted here; the session row, the evaluator and the routers stay real.
 */
async function sessionFor(userId: string): Promise<string> {
  const token = await insertSession(deployment.context, { userId });

  return signedSessionCookie({
    token,
    secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
    name: "__Host-genie-session",
  });
}

/** A standard RPC client typed from core's Groups and Roles contracts. */
function adminClient(cookie: string) {
  return createServerRpcClient<{
    groups: GroupsContract;
    roles: RolesContract;
  }>({ url: `${baseUrl()}/api/rpc`, headers: { cookie } });
}

/** The RPC refusal's `appCode`, parsed at this boundary, or undefined for another shape. */
async function readAppCode(response: Response): Promise<string | undefined> {
  const parsed = rpcRefusalBody.safeParse(await response.json());

  return parsed.success ? parsed.data.json.data.appCode : undefined;
}

const listGroups = (headers?: Record<string, string>) =>
  rpcRequest(baseUrl(), "groups/list", { input: {}, headers });

const listRoles = (headers?: Record<string, string>) =>
  rpcRequest(baseUrl(), "roles/list", { headers });

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);

  // The `genie-ops setup` stand-in, so the setup gate is satisfied and the placeholder module is
  // enabled (R-8, R-20).
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["placeholder"]);

  withoutPermissionId = await insertCredentialPerson(deployment.context, {
    email: WITHOUT_PERMISSION_EMAIL,
    password: READ_PASSWORD,
    isBreakGlass: false,
    permissions: ["placeholder:read"],
  });

  withPermissionId = await insertCredentialPerson(deployment.context, {
    email: WITH_PERMISSION_EMAIL,
    password: READ_PASSWORD,
    isBreakGlass: false,
    permissions: ["core:groups:manage", "core:roles:manage"],
  });

  // The event-correlation proof reads the bus's `event handled` debug line, so the built app runs
  // at debug level.
  process.env.LOG_LEVEL = "debug";

  server = await startBuiltApp(
    deployment.context.env.databaseUrl,
    imageHostPort(3412)
  );
}, 240000);

afterAll(async () => {
  delete process.env.LOG_LEVEL;

  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

describe("the groups and roles transport", () => {
  it("answers an anonymous caller unauthenticated at 401 before input parsing", async () => {
    const response = await listGroups();

    expect(response.status).toBe(401);
    expect(await readAppCode(response)).toBe("unauthenticated");

    // Roles refuses the same way, so neither router can be reached without a session.
    const roles = await listRoles();

    expect(roles.status).toBe(401);
    expect(await readAppCode(roles)).toBe("unauthenticated");
  });

  it("answers a signed-in caller without the key forbidden at 403", async () => {
    const cookie = await sessionFor(withoutPermissionId);

    const groups = await listGroups({ cookie });

    expect(groups.status).toBe(403);
    expect(await readAppCode(groups)).toBe("forbidden");

    const roles = await listRoles({ cookie });

    expect(roles.status).toBe(403);
    expect(await readAppCode(roles)).toBe("forbidden");
  });

  it("answers a signed-in caller holding the key", async () => {
    const cookie = await sessionFor(withPermissionId);

    const response = await listGroups({ cookie });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"json"');
  });

  it("carries the request's correlation id into the role event handler", async () => {
    const cookie = await sessionFor(withPermissionId);
    const client = adminClient(cookie);

    const roleId = await insertRole(deployment.context, {
      name: `correlation-role-${Date.now()}`,
      permissions: ["placeholder:read"],
    });

    const targetUserId = await insertUser(deployment.context);

    const logBefore = server.logs().length;

    await client.roles.assign({
      roleId,
      principalType: "user",
      principalId: targetUserId,
      scope: undefined,
    });

    // The proxy's request line names this request; the bus logs `event handled` with the correlation
    // id it read from the request's correlation scope (the same x-request-id).
    await expect
      .poll(() => server.logs().slice(logBefore), { timeout: 5000 })
      .toContain("event handled");

    const recent = server.logs().slice(logBefore);

    // SAFETY: the proxy wrote each line this loop reads as JSON, so its one field is present.
    const requestId = recent
      .split("\n")
      .filter((line) => line.includes('"path":"/api/rpc/roles/assign"'))
      .map((line) => JSON.parse(line) as { requestId?: string })
      .map((line) => line.requestId)
      .find((value) => value !== undefined);

    expect(requestId).toBeDefined();

    // SAFETY: the bus wrote each line this loop reads as JSON, so its one field is present.
    const handled = recent
      .split("\n")
      .filter((line) => line.includes('"msg":"event handled"'))
      .filter((line) => line.includes('"event":"core:role:granted"'))
      .map((line) => JSON.parse(line) as { correlationId?: string });

    expect(handled.length).toBeGreaterThan(0);
    expect(handled.some((line) => line.correlationId === requestId)).toBe(true);
  });
});
