import { createHmac } from "node:crypto";

import type { Page } from "@playwright/test";

/**
 * Break-glass browser helpers (R-62 to R-65). The authenticator code is computed the way the app's
 * own verifier does it: HMAC-SHA1 over the raw secret bytes, counter = floor(now/30s). The manual
 * key the enrollment card shows is the base32 form of that secret, so it is decoded first.
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
      throw new Error(`The manual key is not base32: ${character}`);

    buffer = (buffer << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

/** The six-digit code the app expects for the current 30-second step. */
export function totpCode(manualKey: string, at: number = Date.now()): string {
  const secret = base32Decode(manualKey.replace(/\s/gu, ""));
  const counter = Buffer.alloc(8);

  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));

  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;

  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);

  return (binary % 1_000_000).toString().padStart(6, "0");
}

/** Fills the six labeled code boxes with `code`, one digit each. */
export async function fillAuthenticatorCode(
  page: Page,
  code: string
): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each box is filled in order
    await page.getByLabel(`Digit ${index + 1} of 6`).fill(code[index] ?? "");
  }
}
