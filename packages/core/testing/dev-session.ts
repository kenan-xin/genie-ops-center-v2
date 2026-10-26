import { makeSignature } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { user } from "../src/schema.ts";
import { sessionCookieName } from "../src/services/auth/config.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import { insertSession } from "./session-fixtures.ts";

/** The fields of CDP `Network.setCookie` (and Playwright `addCookies`) for one minted session. */
export type DevSessionCookie = {
  readonly name: string;
  readonly value: string;
  readonly url: string;
  readonly path: "/";
  readonly httpOnly: true;
  readonly sameSite: "Lax";
  readonly expires: number;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The application's absolute session cap (R-13), so a minted session lives no longer than a real one. */
const SESSION_MS = 86_400_000;

/**
 * A real session for one person of a local development database, so an unattended agent signs in
 * without the realm and its identity provider (genie-ops-center-v2-xok3.25). Authorization stays
 * real: the session names the person, and `can()` reads that person's roles. The sign-in path is
 * skipped, so no group sync runs; a test person holds roles through local groups.
 *
 * It refuses a `PUBLIC_URL` that is not a local address, and the break-glass account, whose
 * authenticator step it would otherwise skip (R-63).
 */
export async function mintDevSession(input: {
  readonly databaseUrl: string;
  readonly publicUrl: string;
  readonly secret: string;
  readonly email: string;
}): Promise<DevSessionCookie> {
  if (!LOCAL_HOSTS.has(new URL(input.publicUrl).hostname))
    throw new Error(
      `refused: PUBLIC_URL ${input.publicUrl} is not a local address`
    );

  const context = createTenantContext(
    { DATABASE_URL: input.databaseUrl, PUBLIC_URL: input.publicUrl },
    silentLogger(),
    [],
    undefined,
    "core"
  );

  try {
    const [person] = await context.db
      .select({ id: user.id, isBreakGlass: user.isBreakGlass })
      .from(user)
      .where(eq(user.email, input.email.toLowerCase()));

    if (person === undefined)
      throw new Error(`no person with the email ${input.email}`);

    if (person.isBreakGlass)
      throw new Error(
        "refused: the break-glass account signs in only at /admin/login"
      );

    const expiresAt = new Date(Date.now() + SESSION_MS);

    const token = await insertSession(context, {
      userId: person.id,
      expiresAt,
    });

    const signature = await makeSignature(token, input.secret);

    return {
      name: sessionCookieName(input.publicUrl),
      value: encodeURIComponent(`${token}.${signature}`),
      url: input.publicUrl,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(expiresAt.getTime() / 1000),
    };
  } finally {
    await context.db.$client.end();
  }
}
