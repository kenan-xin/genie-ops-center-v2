import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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
 * One message covers a bad signature, a mismatched file id and an expiry, so a caller learns
 * nothing about which check failed.
 */
function invalidToken(): Error {
  return new Error("The file link token is invalid or has expired.");
}

/**
 * Signs the file id with its expiry, so the token names one file and cannot be widened to another
 * (R-38). The payload is bound by an HMAC-SHA256 over the encoded payload.
 */
export function signFileLink(
  fileId: string,
  expiresAt: Date,
  secret: Buffer
): string {
  const payload = Buffer.from(
    `${fileId}:${expiresAt.getTime()}`,
    "utf8"
  ).toString("base64url");

  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

/**
 * Verifies a token against the secret and the requested file id, and refuses when the signature,
 * the file id or the expiry does not hold.
 */
export function readFileLink(
  token: string,
  secret: Buffer,
  fileId: string
): void {
  const [payload, signature, ...rest] = token.split(".");

  if (payload === undefined || signature === undefined || rest.length > 0) {
    throw invalidToken();
  }

  const expected = createHmac("sha256", secret).update(payload).digest();

  const given = Buffer.from(signature, "base64url");

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw invalidToken();
  }

  const [tokenFileId, expiry, ...extra] = Buffer.from(payload, "base64url")
    .toString("utf8")
    .split(":");

  if (tokenFileId !== fileId || extra.length > 0) throw invalidToken();

  const expiresAt = Number(expiry);

  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    throw invalidToken();
  }
}
