import { createHmac } from "node:crypto";

/**
 * A real TOTP code for the break-glass authenticator tests. The plugin signs the raw secret bytes
 * (better-auth `totp/index.mjs` `createOTP(secret)`), and its otpauth URI carries the base32 form
 * of that secret, so the code is computed after base32-decoding the URI's `secret` parameter.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value: string): Buffer {
  const clean = value.replace(/=+$/u, "").toUpperCase();
  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);

    if (index === -1)
      throw new Error(`The TOTP secret is not base32: ${character}`);

    buffer = (buffer << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

/** The secret the plugin signs, taken from an otpauth URI's `secret` parameter. */
export function totpSecretOf(otpauthUri: string): Buffer {
  return base32Decode(new URL(otpauthUri).searchParams.get("secret") ?? "");
}

/** The six-digit code for the current 30-second step. */
export function totpCodeForUri(
  otpauthUri: string,
  at: number = Date.now()
): string {
  const counter = Buffer.alloc(8);

  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));

  const digest = createHmac("sha1", totpSecretOf(otpauthUri))
    .update(counter)
    .digest();

  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;

  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);

  return (binary % 1_000_000).toString().padStart(6, "0");
}
