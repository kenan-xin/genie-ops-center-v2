import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthMember } from "../src/services/auth/index.ts";
import type {
  DevSessionCookie,
  DevSessionSubject,
  DisposableDeployment,
} from "./index.ts";
import {
  insertCredentialPerson,
  insertRole,
  insertUser,
  mintDevSession,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The dev session mint (genie-ops-center-v2-xok3.25, xok3.10) against a real Postgres: the cookie
 * it answers passes the application's own enforced session read, a role's test person holds that
 * role, and it never mints for the break-glass account or for a deployment that is not local.
 */
const PUBLIC_URL = "http://localhost:3000";

const SECRET = "x".repeat(32);

describe("mintDevSession", () => {
  let deployment: DisposableDeployment;
  let client: PoolClient;
  let auth: AuthMember;

  beforeAll(async () => {
    deployment = await startDisposableDeployment([], {
      env: {
        PUBLIC_URL,
        BETTER_AUTH_SECRET: SECRET,
        KEYCLOAK_URL: "http://127.0.0.1:1",
        KEYCLOAK_REALM: "genie",
        KEYCLOAK_CLIENT_ID: "genie-ops-center",
        KEYCLOAK_CLIENT_SECRET: "test-client-secret",
      },
      profile: "application",
    });

    client = await deployment.context.db.$client.connect();

    await client.query("insert into tenant_settings default values");

    const member = deployment.context.auth;

    if (member === undefined)
      throw new Error("the deployment built no auth member");

    auth = member;
  }, 240_000);

  afterAll(async () => {
    client?.release();
    await deployment?.stop();
  });

  function mint(subject: DevSessionSubject, publicUrl = PUBLIC_URL) {
    return mintDevSession({
      databaseUrl: deployment.context.env.databaseUrl,
      publicUrl,
      secret: SECRET,
      subject,
    });
  }

  async function sessionUser(cookie: DevSessionCookie) {
    const session = await auth.getSession({
      headers: new Headers({ cookie: `${cookie.name}=${cookie.value}` }),
    });

    return session?.user;
  }

  it("signs in one test person per role, which holds that role, on every run", async () => {
    const roleId = await insertRole(deployment.context, {
      name: "Case reviewer",
      permissions: ["core:audit_read"],
    });

    const first = await sessionUser(await mint({ role: "Case reviewer" }));
    const second = await sessionUser(await mint({ role: "Case reviewer" }));

    expect(first?.email).toBe("test-case-reviewer@example.invalid");
    expect(second?.id).toBe(first?.id);

    const grants = await client.query(
      "select 1 from role_assignment where role_id = $1 and principal_type = 'user' and principal_id = $2",
      [roleId, first?.id]
    );

    expect(grants.rowCount).toBe(1);
  });

  it("answers a cookie that the application reads as that person's live session", async () => {
    const userId = await insertUser(deployment.context, {
      email: "tester@example.com",
    });

    const person = await sessionUser(
      await mint({ email: "tester@example.com" })
    );

    expect(person?.id).toBe(userId);
  });

  it("refuses the break-glass account and writes no session", async () => {
    const userId = await insertCredentialPerson(deployment.context, {
      email: "break-glass@example.com",
      password: "break-glass-password-14",
    });

    await expect(mint({ email: "break-glass@example.com" })).rejects.toThrow(
      /break-glass/
    );

    const rows = await client.query(
      "select 1 from session where user_id = $1",
      [userId]
    );

    expect(rows.rowCount).toBe(0);
  });

  it("refuses a PUBLIC_URL that is not local", async () => {
    await expect(
      mint({ email: "tester@example.com" }, "https://ops.example.com")
    ).rejects.toThrow(/not a local address/);
  });
});
