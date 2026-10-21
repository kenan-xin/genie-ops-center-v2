import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type {
  PermissionKey,
  ResourceRef,
} from "../../lib/module-contract/keys.ts";

/**
 * What a download token binds: the file, the permission and the owning record the `can()` check
 * ran against. `fetchLink` reads the permission and resource back from the verified token, so a
 * caller cannot widen a link after it was issued (R-38).
 */
export type FileLinkScope = {
  readonly fileId: string;
  readonly permission: PermissionKey;
  readonly resource: ResourceRef;
};

/** The signed payload. `z.number()` is finite, so a `NaN` or infinite expiry is refused. */
const payloadSchema = z.object({
  fileId: z.string(),
  permission: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  expiresAt: z.number(),
});

/**
 * The key that signs a download token. Section 1 has no file-link secret of its own in the
 * environment contract, and R-27 keeps `BETTER_AUTH_SECRET` out of this section, so the context
 * generates a random key at build time. A token is short-lived, so losing outstanding links on a
 * restart is acceptable; a later section that runs more than one application replica replaces
 * this with a shared secret (see the service README).
 */
export function createFileLinkSecret(): Buffer {
  return randomBytes(32);
}

/**
 * One message covers a bad signature, a malformed payload and an expiry, so a caller learns
 * nothing about which check failed.
 */
function invalidToken(): Error {
  return new Error("The file link token is invalid or has expired.");
}

/**
 * Signs the link scope with its expiry (R-38). The payload is JSON, so a permission or a resource
 * id that holds `:` cannot be split apart, and the whole payload is bound by an HMAC-SHA256.
 */
export function signFileLink(
  scope: FileLinkScope,
  expiresAt: Date,
  secret: Buffer
): string {
  const payload = Buffer.from(
    JSON.stringify({
      fileId: scope.fileId,
      permission: scope.permission,
      resourceType: scope.resource.type,
      resourceId: scope.resource.id,
      expiresAt: expiresAt.getTime(),
    }),
    "utf8"
  ).toString("base64url");

  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

/**
 * Verifies a token against the secret and returns the scope it binds. A bad signature, a
 * non-JSON or wrongly typed payload, and an expiry that has passed are all refused with the same
 * message. The payload is parsed with a schema, so a forged body never reaches the caller.
 */
export function readFileLink(token: string, secret: Buffer): FileLinkScope {
  const [payload, signature, ...rest] = token.split(".");

  if (payload === undefined || signature === undefined || rest.length > 0) {
    throw invalidToken();
  }

  const expected = createHmac("sha256", secret).update(payload).digest();

  const given = Buffer.from(signature, "base64url");

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw invalidToken();
  }

  let raw: unknown;

  try {
    raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw invalidToken();
  }

  const parsed = payloadSchema.safeParse(raw);

  if (!parsed.success) throw invalidToken();

  const { fileId, permission, resourceType, resourceId, expiresAt } =
    parsed.data;

  if (Date.now() > expiresAt) throw invalidToken();

  return {
    fileId,
    // SAFETY: the HMAC above proves the payload came from signFileLink, which signed a
    // PermissionKey; the schema only re-establishes that the value is a string.
    permission: permission as PermissionKey,
    resource: { type: resourceType, id: resourceId },
  };
}
