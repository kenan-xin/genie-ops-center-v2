import { expect, type Response } from "@playwright/test";

/**
 * The five security headers Section 0 sets once in the app (R-71, DEC-31), and the deny baseline
 * every document outside the viewer carries. `testing/headers.integration.test.ts` owns the full
 * response-class matrix; this is the browser-side check on the Section 2 screens.
 */
const FIVE = [
  "content-security-policy",
  "strict-transport-security",
  "referrer-policy",
  "x-content-type-options",
  "permissions-policy",
];

const BASELINE =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'";

/** Asserts the five headers and the deny baseline on one document response. */
export function expectSecurityHeaders(
  response: Response | null,
  label: string
): void {
  expect(response, `${label} answered`).not.toBeNull();

  const headers = response?.headers() ?? {};

  for (const header of FIVE) {
    expect(headers[header], `${label} is missing ${header}`).toBeDefined();
  }

  expect(headers["content-security-policy"], label).toBe(BASELINE);
}
