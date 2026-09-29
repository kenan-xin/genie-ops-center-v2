import { randomBytes, randomUUID } from "node:crypto";

import { makeSignature } from "better-auth/crypto";

import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { session } from "../src/schema.ts";

/**
 * Real sessions without the credential endpoint. Since R-62 lets only the break-glass account sign
 * in with a password, a test that needs an authenticated ordinary person (to prove a permission
 * refusal, an idle expiry or the absolute cap) writes the session row itself and signs the cookie
 * the way the application does. Only the session transport is stood up here; the database, the
 * evaluator and the enforced reads are all real.
 */

/** Writes one live session row for `userId` and answers its token. */
export async function insertSession(
  context: Pick<TenantContext, "db">,
  input: {
    readonly userId: string;
    readonly token?: string;
    readonly expiresAt?: Date;
    readonly lastActiveAt?: Date | null;
  }
): Promise<string> {
  const token = input.token ?? randomBytes(32).toString("base64url");

  await context.db.insert(session).values({
    id: randomUUID(),
    token,
    userId: input.userId,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 86_400_000),
    lastActiveAt: input.lastActiveAt ?? null,
  });

  return token;
}

/**
 * The `Cookie` header value for a session token, signed with the application secret the way
 * Better Auth's `setSignedCookie` does: `token.signature`, URL-encoded.
 */
export async function signedSessionCookie(input: {
  readonly token: string;
  readonly secret: string;
  readonly name: string;
}): Promise<string> {
  const signature = await makeSignature(input.token, input.secret);

  return `${input.name}=${encodeURIComponent(`${input.token}.${signature}`)}`;
}
