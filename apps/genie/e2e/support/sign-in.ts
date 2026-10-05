import { expect, type Page } from "@playwright/test";

import { E2E_USER_PASSWORD } from "../../testing/e2e-keycloak.ts";

/**
 * Signs the browser in through the real Keycloak login form (Spec 2 AC-20). Global setup created
 * the tenant-realm user and pre-added the matching app `user` row with a real role assignment, so
 * the callback links the realm account to that row and the browser lands on the landing route
 * (R-36).
 *
 * The app starts the flow at `/api/auth/sign-in/keycloak`, which redirects to the one
 * browser-visible Keycloak address the Playwright project maps to loopback.
 */
export async function signInThroughKeycloak(
  page: Page,
  input: {
    readonly email: string;
    readonly landing?: string;
    /** Defaults to the shared seeded password; the S-F proof signs in with the person's own. */
    readonly password?: string;
  }
): Promise<void> {
  // `disableRedirect` is not set on this route, so the browser follows the app's redirect to
  // Keycloak and then Keycloak's callback back to `/auth/complete`, which lands the person.
  await page.goto("/api/auth/sign-in/keycloak");

  await page.locator("#username").fill(input.email);
  await page.locator("#password").fill(input.password ?? E2E_USER_PASSWORD);
  await page.locator("#kc-login").click();

  // The chain ends on the landing decision's target: `/` when no entry carries the landing flag.
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 30000 })
    .toBe(input.landing ?? "/");
}

/**
 * Signs the browser in through a brokered deployment (S2-13). The realm's default redirector sends
 * the authorization request to the company stand-in realm, so the form is the company realm's own
 * login page; after it the broker returns through the tenant realm to the app callback.
 */
export async function signInThroughBroker(
  page: Page,
  input: {
    readonly baseUrl: string;
    readonly email: string;
    readonly landing?: string;
  }
): Promise<void> {
  await page.goto(`${input.baseUrl}/api/auth/sign-in/keycloak`);

  await page.locator("#username").fill(input.email);
  await page.locator("#password").fill(E2E_USER_PASSWORD);
  await page.locator("#kc-login").click();

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 45000 })
    .toBe(input.landing ?? "/");
}
