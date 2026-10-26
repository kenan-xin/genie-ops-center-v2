import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthMember } from "../src/services/auth/index.ts";
import type { DisposableDeployment } from "./index.ts";
import {
  insertCredentialPerson,
  insertUser,
  mintDevSession,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The dev session mint (genie-ops-center-v2-xok3.25) against a real Postgres: the cookie it answers
 * passes the application's own enforced session read, and it never mints for the break-glass
 * account or for a deployment that is not local.
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

  function mint(email: string, publicUrl = PUBLIC_URL) {
    return mintDevSession({
      databaseUrl: deployment.context.env.databaseUrl,
      publicUrl,
      secret: SECRET,
      email,
    });
  }

  it("answers a cookie that the application reads as that person's live session", async () => {
    const userId = await insertUser(deployment.context, {
      email: "tester@example.com",
    });

    const cookie = await mint("tester@example.com");

    const session = await auth.getSession({
      headers: new Headers({ cookie: `${cookie.name}=${cookie.value}` }),
    });

    expect(session?.user.id).toBe(userId);
  });

  it("refuses the break-glass account and writes no session", async () => {
    const userId = await insertCredentialPerson(deployment.context, {
      email: "break-glass@example.com",
      password: "break-glass-password-14",
    });

    await expect(mint("break-glass@example.com")).rejects.toThrow(
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
      mint("tester@example.com", "https://ops.example.com")
    ).rejects.toThrow(/not a local address/);
  });
});
