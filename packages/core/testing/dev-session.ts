import { makeSignature } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { kebabCase } from "es-toolkit";

import {
  type TenantContext,
  createTenantContext,
} from "../src/lib/tenant-context/index.ts";
import { role, roleAssignment, user } from "../src/schema.ts";
import { sessionCookieName } from "../src/services/auth/config.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import { insertUser } from "./access-fixtures.ts";
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

/** Whom to sign in: an existing person by email, or the test person of one role. */
export type DevSessionSubject =
  | { readonly email: string }
  | { readonly role: string };

/**
 * The test person of one role: `test-<role>@example.invalid`, created on first use and granted
 * that role tenant-wide, directly (a user-principal assignment). A later call reuses the person
 * and leaves any other grant on it alone.
 */
async function testPersonFor(
  context: Pick<TenantContext, "db">,
  roleName: string
): Promise<string> {
  const [found] = await context.db
    .select({ id: role.id })
    .from(role)
    .where(eq(role.name, roleName));

  if (found === undefined) {
    const names = await context.db.select({ name: role.name }).from(role);

    throw new Error(
      `no role named "${roleName}"; roles: ${names.map((row) => row.name).join(", ")}`
    );
  }

  const email = `test-${kebabCase(roleName)}@example.invalid`;

  const [existing] = await context.db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));

  const userId =
    existing?.id ??
    (await insertUser(context, {
      email,
      name: `Test ${roleName}`,
      emailVerified: true,
    }));

  await context.db
    .insert(roleAssignment)
    .values({ roleId: found.id, principalType: "user", principalId: userId })
    .onConflictDoNothing();

  return userId;
}

/**
 * A real session for one person of a local development database, so an unattended agent signs in
 * without the realm and its identity provider (genie-ops-center-v2-xok3.25). Authorization stays
 * real: the session names the person, and `can()` reads that person's roles. The sign-in path is
 * skipped, so no group sync runs: a person signed in this way holds only its stored grants, and
 * `{ role }` signs in that role's test person, which holds the role directly.
 *
 * It refuses a `PUBLIC_URL` that is not a local address, and the break-glass account, whose
 * authenticator step it would otherwise skip (R-63).
 */
export async function mintDevSession(input: {
  readonly databaseUrl: string;
  readonly publicUrl: string;
  readonly secret: string;
  readonly subject: DevSessionSubject;
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
    const { subject } = input;

    const [person] = await context.db
      .select({ id: user.id, isBreakGlass: user.isBreakGlass })
      .from(user)
      .where(
        "role" in subject
          ? eq(user.id, await testPersonFor(context, subject.role))
          : eq(user.email, subject.email.toLowerCase())
      );

    if (person === undefined)
      throw new Error(`no person matches ${JSON.stringify(subject)}`);

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
